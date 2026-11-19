-- supabase/profile_edit_v2.sql
-- Edit profile, Instagram-style (project_specs.md, "Edit profile — Instagram-style screen", 2026-11-13):
--   profiles.gender            man / woman / prefer_not_to_say (or empty). PRIVATE: only the owner's own Edit profile reads it.
--   profile_links              up to 5 links (title + https:// address) shown on the profile under the bio (Public profiles / the owner).
--   update_my_profile          same as profile_v1.sql, plus the optional "gender" key.
--   set_my_profile_links       replaces the whole list of links in one go.
--   closed accounts            a trigger removes links and gender when an account is closed (profiles.deleted_at is set).
--
-- Access: nothing here is readable or callable from the browser. The server uses the service-role key, and the
-- profile id always comes from the signed-in session. profiles' own RLS (profiles_select_own) is unchanged.
-- Prerequisite: schema.sql (profiles), profile_v1.sql. Safe to run more than once.

-- Closed accounts are marked with deleted_at (account_deletion.sql adds it the same way; harmless if it's already there).
alter table public.profiles add column if not exists deleted_at timestamptz;

-- 1. Gender (private).
alter table public.profiles add column if not exists gender text;
alter table public.profiles drop constraint if exists profiles_gender_choice;
alter table public.profiles add constraint profiles_gender_choice check (gender is null or gender in ('man', 'woman', 'prefer_not_to_say'));

-- 2. Edit my profile: displayName / username / bio / gender (keys left out stay as they are). Everything else in
--    p_input is ignored. "gender": "" clears it. Returns the saved { displayName, username, bio, gender }.
create or replace function public.update_my_profile(p_profile uuid, p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.profiles;
  v_problem text;
begin
  select * into v_row from profiles where id = p_profile for update;
  if not found then raise exception 'No account found.' using errcode = '42501'; end if;
  if p_input ? 'displayName' then
    v_problem := profile_display_name_problem(p_input->>'displayName');
    if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
    v_row.display_name := trim(p_input->>'displayName');
  end if;
  if p_input ? 'username' then
    v_problem := profile_username_problem(trim(p_input->>'username'), p_profile);
    if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
    v_row.username := trim(p_input->>'username');
  end if;
  if p_input ? 'bio' then
    if length(coalesce(p_input->>'bio', '')) > 1000 then raise exception 'Bios are 1000 characters at most.' using errcode = '22023'; end if;
    v_row.bio := nullif(trim(coalesce(p_input->>'bio', '')), '');
  end if;
  if p_input ? 'gender' then
    if coalesce(p_input->>'gender', '') not in ('', 'man', 'woman', 'prefer_not_to_say') then
      raise exception 'Choose Man, Woman or Prefer not to say.' using errcode = '22023';
    end if;
    v_row.gender := nullif(p_input->>'gender', '');
  end if;
  begin
    update profiles set display_name = v_row.display_name, username = v_row.username, bio = v_row.bio, gender = v_row.gender where id = p_profile;
  exception when unique_violation then
    raise exception 'That username is taken.' using errcode = '22023';
  end;
  return jsonb_build_object('displayName', v_row.display_name, 'username', v_row.username, 'bio', v_row.bio, 'gender', v_row.gender);
end;
$$;

-- 3. Links.
create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null check (position between 0 and 4),
  title text not null check (length(trim(title)) between 1 and 40),
  url text not null check (url ~ '^https://[^\s/$.?#][^\s]*$' and length(url) <= 300),
  created_at timestamptz not null default now(),
  unique (profile_id, position)
);
alter table public.profile_links enable row level security;
-- No policies on purpose: browsers can't read or write it; the server reads it with the service-role key.
revoke all on table public.profile_links from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_links to service_role;

-- Replace my links with p_links ([{ title, url }, ...], at most 5, in order). Returns the saved list.
create or replace function public.set_my_profile_links(p_profile uuid, p_links jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_link jsonb;
  v_position smallint := 0;
begin
  if not exists (select 1 from profiles where id = p_profile and deleted_at is null) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_links) is distinct from 'array' then raise exception 'Links must be a list.' using errcode = '22023'; end if;
  if jsonb_array_length(p_links) > 5 then raise exception 'You can add up to 5 links.' using errcode = '22023'; end if;
  delete from profile_links where profile_id = p_profile;
  for v_link in select value from jsonb_array_elements(p_links) loop
    if length(trim(coalesce(v_link->>'title', ''))) not between 1 and 40 then
      raise exception 'Each link needs a title of 1–40 characters.' using errcode = '22023';
    end if;
    if coalesce(v_link->>'url', '') !~ '^https://[^\s/$.?#][^\s]*$' or length(v_link->>'url') > 300 then
      raise exception 'Links must be web addresses starting with https://' using errcode = '22023';
    end if;
    insert into profile_links (profile_id, position, title, url) values (p_profile, v_position, trim(v_link->>'title'), v_link->>'url');
    v_position := v_position + 1;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('title', title, 'url', url) order by position) from profile_links where profile_id = p_profile), '[]'::jsonb);
end;
$$;

-- 4. Closed accounts: links and gender go with everything else personal (account_deletion.sql keeps a tombstone row).
create or replace function public.profile_edit_v2_scrub_closed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from profile_links where profile_id = new.id;
    new.gender := null;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_edit_v2_scrub_closed on public.profiles;
create trigger profiles_edit_v2_scrub_closed before update of deleted_at on public.profiles
  for each row execute function public.profile_edit_v2_scrub_closed();

revoke all on function public.update_my_profile(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_my_profile_links(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.profile_edit_v2_scrub_closed() from public, anon, authenticated;
grant execute on function public.update_my_profile(uuid, jsonb) to service_role;
grant execute on function public.set_my_profile_links(uuid, jsonb) to service_role;

-- Check: select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'gender';
--        select to_regclass('public.profile_links');
-- Undo (drops every saved link and gender; re-run profile_v1.sql afterwards to restore its update_my_profile):
--   drop trigger if exists profiles_edit_v2_scrub_closed on public.profiles;
--   drop function if exists public.profile_edit_v2_scrub_closed(), public.set_my_profile_links(uuid, jsonb);
--   drop table if exists public.profile_links;
--   alter table public.profiles drop constraint if exists profiles_gender_choice, drop column if exists gender;
