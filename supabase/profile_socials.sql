-- supabase/profile_socials.sql
-- Profile socials (project_specs.md, "Profile socials", 2026-11-13): the Edit profile links become up to 4 social
-- profiles, one per app, shown 2 × 2 under the bio. Same table (profile_links) plus a `platform` column.
--   platform      instagram / facebook / youtube / tiktok / linkedin / x / threads / snapchat / strava / website
--   url           built by the app from the username; the database checks it really is that app's address
--   title         what shows on the profile (the username, or the website's address); the database works it out itself
--   set_my_profile_links(p_profile, p_links)  now takes [{ platform, url }, ...], at most 4, one per app
--
-- Prerequisite: profile_edit_v2.sql. Safe to run more than once. If profile_edit_v2.sql is ever re-run, run this again after it
-- (v2 has the older set_my_profile_links). Plain links saved before this become "website"
-- socials (only the first one per profile is kept, since each app can be added once — and at most 4 in all).
-- Access is unchanged: no browser access; the server uses the service-role key with the profile id from the session.

-- 1. Is this url a real profile address for that app? (lower-case host, https only, the app's own username rules)
create or replace function public.profile_social_url_ok(p_platform text, p_url text)
returns boolean
language sql immutable set search_path = public as $$
  select coalesce(length(p_url) <= 300 and case p_platform
    when 'instagram' then p_url ~ '^https://instagram\.com/[A-Za-z0-9._]{1,30}$'
    when 'facebook'  then p_url ~ '^https://facebook\.com/[A-Za-z0-9.]{1,50}$'
    when 'youtube'   then p_url ~ '^https://youtube\.com/@[A-Za-z0-9._-]{3,30}$'
    when 'tiktok'    then p_url ~ '^https://tiktok\.com/@[A-Za-z0-9._]{2,24}$'
    when 'linkedin'  then p_url ~ '^https://linkedin\.com/in/[A-Za-z0-9-]{3,100}$'
    when 'x'         then p_url ~ '^https://x\.com/[A-Za-z0-9_]{1,15}$'
    when 'threads'   then p_url ~ '^https://threads\.net/@[A-Za-z0-9._]{1,30}$'
    when 'snapchat'  then p_url ~ '^https://snapchat\.com/add/[A-Za-z0-9._-]{3,15}$'
    when 'strava'    then p_url ~ '^https://strava\.com/athletes/[0-9]{1,12}$'
    when 'website'   then p_url ~ '^https://[^\s/$.?#][^\s]*$'
    else false end, false);
$$;

-- What shows on the profile: the part after the app's address (the username), or the website without https://.
create or replace function public.profile_social_title(p_platform text, p_url text)
returns text
language sql immutable set search_path = public as $$
  select left(case p_platform
    when 'website' then regexp_replace(regexp_replace(p_url, '^https://', ''), '/$', '')
    else regexp_replace(p_url, '^https://[^/]+/(in/|add/|athletes/)?@?', '') end, 100);
$$;

-- 2. The column, and the old plain links tidied into the new rules.
alter table public.profile_links add column if not exists platform text;
update public.profile_links set platform = 'website' where platform is null;
delete from public.profile_links l
  where exists (select 1 from public.profile_links o where o.profile_id = l.profile_id and o.platform = l.platform and o.position < l.position);
delete from public.profile_links where position > 3;
update public.profile_links set title = profile_social_title(platform, url);
alter table public.profile_links alter column platform set not null;

alter table public.profile_links drop constraint if exists profile_links_position_check;
alter table public.profile_links drop constraint if exists profile_links_title_check;
alter table public.profile_links drop constraint if exists profile_links_url_check;
alter table public.profile_links drop constraint if exists profile_links_platform_check;
alter table public.profile_links drop constraint if exists profile_links_social_url;
alter table public.profile_links drop constraint if exists profile_links_one_per_app;
alter table public.profile_links add constraint profile_links_position_check check (position between 0 and 3);
alter table public.profile_links add constraint profile_links_title_check check (length(title) between 1 and 100);
alter table public.profile_links add constraint profile_links_platform_check
  check (platform in ('instagram', 'facebook', 'youtube', 'tiktok', 'linkedin', 'x', 'threads', 'snapchat', 'strava', 'website'));
alter table public.profile_links add constraint profile_links_social_url check (profile_social_url_ok(platform, url));
alter table public.profile_links add constraint profile_links_one_per_app unique (profile_id, platform);

-- 3. Replace my socials with p_links ([{ platform, url }, ...], at most 4, one per app, in order). Returns the saved list.
create or replace function public.set_my_profile_links(p_profile uuid, p_links jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_link jsonb;
  v_position smallint := 0;
  v_platform text;
  v_url text;
begin
  if not exists (select 1 from profiles where id = p_profile and deleted_at is null) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_links) is distinct from 'array' then raise exception 'Socials must be a list.' using errcode = '22023'; end if;
  if jsonb_array_length(p_links) > 4 then raise exception 'You can add up to 4 socials.' using errcode = '22023'; end if;
  delete from profile_links where profile_id = p_profile;
  for v_link in select value from jsonb_array_elements(p_links) loop
    v_platform := coalesce(v_link->>'platform', '');
    v_url := coalesce(v_link->>'url', '');
    if not profile_social_url_ok(v_platform, v_url) then
      raise exception 'That username doesn''t look right for that app.' using errcode = '22023';
    end if;
    begin
      insert into profile_links (profile_id, position, platform, title, url)
        values (p_profile, v_position, v_platform, profile_social_title(v_platform, v_url), v_url);
    exception when unique_violation then
      raise exception 'Each app can be added once.' using errcode = '22023';
    end;
    v_position := v_position + 1;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('platform', platform, 'title', title, 'url', url) order by position)
    from profile_links where profile_id = p_profile), '[]'::jsonb);
end;
$$;

revoke all on function public.profile_social_url_ok(text, text) from public, anon, authenticated;
revoke all on function public.profile_social_title(text, text) from public, anon, authenticated;
revoke all on function public.set_my_profile_links(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_my_profile_links(uuid, jsonb) to service_role;
grant execute on function public.profile_social_url_ok(text, text), public.profile_social_title(text, text) to service_role;

-- Check: select column_name from information_schema.columns where table_name = 'profile_links' and column_name = 'platform';
-- Undo (keeps saved socials as plain links; re-run profile_edit_v2.sql afterwards for its set_my_profile_links):
--   alter table public.profile_links drop constraint if exists profile_links_one_per_app, drop constraint if exists profile_links_social_url,
--     drop constraint if exists profile_links_platform_check, drop column if exists platform;
--   drop function if exists public.profile_social_url_ok(text, text), public.profile_social_title(text, text);
