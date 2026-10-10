-- supabase/profile_v1.sql
-- Profile V1 (project_specs.md, "Profile V1"): a modern bio, finishing a half-made profile, editing your own profile,
-- finding a profile by username, and profile links for claimed tournament players.
--
--   profiles.bio                    the golfer's own bio (legacy Maroon bios stay where they are, as a fallback)
--   profile_username_problem        the username rules, in one place (null = fine)
--   create_my_profile               the one profile for a login that has none: profiles.id = that login's id. Safe to
--                                   call twice (the second call returns the profile already there).
--   update_my_profile               display name / username / bio — nothing else is editable here
--   profile_id_for_username         username → profile id, ignoring case (server only: the id never reaches a page)
--   list_edition_player_profiles    organizer-only: { <tournament player id>: username } for JOINED players
--
-- All functions are service-role only; the server passes the signed-in login's id from the session.
-- Prerequisites: schema.sql, platform_foundation.sql, tournament_player_identity.sql. Safe to run more than once.
-- Undo: see the bottom of this file.

begin;

alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length check (bio is null or length(bio) <= 1000);

-- Usernames are public (they're in /profile/<username>). Existing rows aren't re-checked; a username is only checked
-- when it's chosen or changed. The old Maroon player codes ("MM" + letters, claimed at signup) are reserved unless
-- they're already yours; so are words used as /profile/<word> routes.
create or replace function public.profile_username_problem(p_username text, p_self uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    -- Keeping the username you already have (even one made before these rules) is always fine.
    when exists (select 1 from profiles where id = p_self and username = p_username) then null
    when p_username is null or p_username !~ '^[A-Za-z0-9][A-Za-z0-9_.]{2,29}$'
      then 'Usernames are 3–30 letters, numbers, _ or . and start with a letter or number.'
    when exists (select 1 from profiles where id = p_self and lower(username) = lower(p_username)) then null
    when lower(p_username) in ('edit', 'setup', 'settings', 'me', 'new', 'admin') or lower(p_username) ~ '^mm[a-z]{0,6}$'
      then 'That username isn''t available.'
    when exists (select 1 from profiles where lower(username) = lower(p_username)) then 'That username is taken.'
  end;
$$;

create or replace function public.profile_display_name_problem(p_name text)
returns text
language sql immutable set search_path = public as $$
  select case when p_name is null or length(trim(p_name)) not between 1 and 60 then 'Your name needs 1–60 characters.' end;
$$;

-- Finish profile setup. p_account = the signed-in login's id, p_email = that login's own email (stored as contact,
-- never used to find anyone). { created: true | false, username }.
create or replace function public.create_my_profile(p_account uuid, p_email text, p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(p_input->>'displayName');
  v_username text := trim(p_input->>'username');
  v_problem text;
  v_existing text;
begin
  if not exists (select 1 from auth.users where id = p_account) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  select username into v_existing from profiles where id = p_account;
  if v_existing is not null then
    return jsonb_build_object('created', false, 'username', v_existing);
  end if;
  v_problem := coalesce(profile_display_name_problem(v_name), profile_username_problem(v_username, p_account));
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  begin
    insert into profiles (id, email, display_name, username, is_host)
    values (p_account, coalesce(nullif(trim(p_email), ''), ''), v_name, v_username, false)
    on conflict (id) do nothing;
  exception when unique_violation then
    raise exception 'That username is taken.' using errcode = '22023';
  end;
  select username into v_existing from profiles where id = p_account;
  return jsonb_build_object('created', v_existing = v_username, 'username', v_existing);
end;
$$;

-- Edit my profile: any of displayName / username / bio (keys left out stay as they are). Everything else in p_input
-- is ignored. Returns the saved { displayName, username, bio }.
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
  begin
    update profiles set display_name = v_row.display_name, username = v_row.username, bio = v_row.bio where id = p_profile;
  exception when unique_violation then
    raise exception 'That username is taken.' using errcode = '22023';
  end;
  return jsonb_build_object('displayName', v_row.display_name, 'username', v_row.username, 'bio', v_row.bio);
end;
$$;

create or replace function public.profile_id_for_username(p_username text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where lower(username) = lower(trim(p_username));
$$;

-- Organizer Players editor: usernames of this edition's players who have JOINED (claimed their place), so the editor
-- can link to their profile. Unclaimed and invited players aren't in it. Organizers / platform admins only; null otherwise.
create or replace function public.list_edition_player_profiles(p_profile uuid, p_edition uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when can_manage_tournament_players(p_profile, e.tournament_id) then coalesce((
    select jsonb_object_agg(p.id, pr.username)
    from edition_roster r join tournament_players p on p.id = r.tournament_player_id join profiles pr on pr.id = p.profile_id
    where r.edition_id = e.id), '{}'::jsonb) end
  from tournament_editions e where e.id = p_edition;
$$;

revoke all on function public.profile_username_problem(text, uuid) from public, anon, authenticated;
revoke all on function public.profile_display_name_problem(text) from public, anon, authenticated;
revoke all on function public.create_my_profile(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_my_profile(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.profile_id_for_username(text) from public, anon, authenticated;
revoke all on function public.list_edition_player_profiles(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_my_profile(uuid, text, jsonb) to service_role;
grant execute on function public.update_my_profile(uuid, jsonb) to service_role;
grant execute on function public.profile_id_for_username(text) to service_role;
grant execute on function public.list_edition_player_profiles(uuid, uuid) to service_role;

commit;

-- Undo (keeps every profile; drops the bio column's contents):
--   drop function if exists public.list_edition_player_profiles(uuid, uuid), public.profile_id_for_username(text),
--     public.update_my_profile(uuid, jsonb), public.create_my_profile(uuid, text, jsonb),
--     public.profile_display_name_problem(text), public.profile_username_problem(text, uuid);
--   alter table public.profiles drop constraint if exists profiles_bio_length;
--   alter table public.profiles drop column if exists bio;
