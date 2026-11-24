-- supabase/profile_preferences.sql
-- Settings → Notifications and Golf preferences (project_specs.md "Settings redo", 2026-11-19).
--   profile_preferences       one row per profile (made on the first save; no row = the defaults)
--     notifications            { "<type>": { "push": bool, "email": bool } } for the Settings switches in
--                              lib/notifications/catalog.ts: friendRequests, tripInvites, scoresPosted, bigMoments,
--                              travel, draftStarting, yourPick, chat (types left out = the app's default)
--     distance_unit            yards / meters
--     usual_tees               Black / Blue / White / Gold / Red / Green, or empty
--     score_entry              simple / full
--     color_scheme             Settings → Appearance colour scheme (lib/theme/colorSchemes.ts); maroon = The Maroon
--   set_my_preference(profile, change)  saves ONE change: { notification, channel, on } | { distance } | { usualTees } | { scoreEntry } | { colorScheme }
--   closed accounts            a trigger removes the row when an account is closed (profiles.deleted_at is set)
--
-- Access: nothing here is readable or callable from the browser; the server uses the service-role key with the profile
-- id from the signed-in session. Prerequisite: schema.sql (profiles). Safe to run more than once.

alter table public.profiles add column if not exists deleted_at timestamptz;

create table if not exists public.profile_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  notifications jsonb not null default '{}'::jsonb check (jsonb_typeof(notifications) = 'object'),
  distance_unit text not null default 'yards' check (distance_unit in ('yards', 'meters')),
  usual_tees text check (usual_tees is null or usual_tees in ('Black', 'Blue', 'White', 'Gold', 'Red', 'Green')),
  score_entry text not null default 'simple' check (score_entry in ('simple', 'full')),
  updated_at timestamptz not null default now()
);
-- Added 2026-11-23 (colour schemes): safe on a table made before it.
alter table public.profile_preferences add column if not exists color_scheme text not null default 'maroon'
  check (color_scheme in ('maroon', 'green', 'navy', 'desert', 'rivalry', 'midnight', 'stone'));
alter table public.profile_preferences enable row level security;
-- No policies on purpose: browsers can't read or write it.
revoke all on table public.profile_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_preferences to service_role;

create or replace function public.set_my_preference(p_profile uuid, p_change jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.profile_preferences;
begin
  if not exists (select 1 from profiles where id = p_profile and deleted_at is null) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  insert into profile_preferences (profile_id) values (p_profile) on conflict (profile_id) do nothing;
  select * into v_row from profile_preferences where profile_id = p_profile for update;

  if p_change ? 'notification' then
    if coalesce(p_change->>'notification', '') not in ('friendRequests', 'tripInvites', 'scoresPosted', 'bigMoments', 'travel', 'draftStarting', 'yourPick', 'chat')
       or coalesce(p_change->>'channel', '') not in ('push', 'email') or jsonb_typeof(p_change->'on') is distinct from 'boolean' then
      raise exception 'That notification setting isn''t one we know.' using errcode = '22023';
    end if;
    v_row.notifications := jsonb_set(
      case when v_row.notifications ? (p_change->>'notification') then v_row.notifications
           else v_row.notifications || jsonb_build_object(p_change->>'notification', '{}'::jsonb) end,
      array[p_change->>'notification', p_change->>'channel'], p_change->'on');
  elsif p_change ? 'distance' then
    if coalesce(p_change->>'distance', '') not in ('yards', 'meters') then raise exception 'Choose Yards or Meters.' using errcode = '22023'; end if;
    v_row.distance_unit := p_change->>'distance';
  elsif p_change ? 'usualTees' then
    if coalesce(p_change->>'usualTees', '') not in ('', 'Black', 'Blue', 'White', 'Gold', 'Red', 'Green') then raise exception 'Choose one of the tee colours.' using errcode = '22023'; end if;
    v_row.usual_tees := nullif(p_change->>'usualTees', '');
  elsif p_change ? 'scoreEntry' then
    if coalesce(p_change->>'scoreEntry', '') not in ('simple', 'full') then raise exception 'Choose Simple or Full.' using errcode = '22023'; end if;
    v_row.score_entry := p_change->>'scoreEntry';
  elsif p_change ? 'colorScheme' then
    if coalesce(p_change->>'colorScheme', '') not in ('maroon', 'green', 'navy', 'desert', 'rivalry', 'midnight', 'stone') then raise exception 'Choose one of the colour schemes.' using errcode = '22023'; end if;
    v_row.color_scheme := p_change->>'colorScheme';
  else
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;

  update profile_preferences set notifications = v_row.notifications, distance_unit = v_row.distance_unit, usual_tees = v_row.usual_tees,
    score_entry = v_row.score_entry, color_scheme = v_row.color_scheme, updated_at = now() where profile_id = p_profile;
  return jsonb_build_object('notifications', v_row.notifications, 'distance', v_row.distance_unit, 'usualTees', coalesce(v_row.usual_tees, ''), 'scoreEntry', v_row.score_entry, 'colorScheme', v_row.color_scheme);
end;
$$;

-- Closed accounts (account_deletion.sql keeps a tombstone profiles row): their preferences go too.
create or replace function public.profile_preferences_scrub_closed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then delete from profile_preferences where profile_id = new.id; end if;
  return new;
end;
$$;
drop trigger if exists profiles_preferences_scrub_closed on public.profiles;
create trigger profiles_preferences_scrub_closed after update of deleted_at on public.profiles
  for each row execute function public.profile_preferences_scrub_closed();

revoke all on function public.set_my_preference(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.profile_preferences_scrub_closed() from public, anon, authenticated;
grant execute on function public.set_my_preference(uuid, jsonb) to service_role;

-- Undo: drop trigger if exists profiles_preferences_scrub_closed on public.profiles;
--       drop function if exists public.profile_preferences_scrub_closed(), public.set_my_preference(uuid, jsonb);
--       drop table if exists public.profile_preferences;
