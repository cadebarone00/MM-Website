-- supabase/push_devices.sql
-- Phone notifications for the iPhone / Android app (project_specs.md "Expo app Step 6 — Phone notifications", 2026-11-25).
--   push_devices              one row per phone that turned notifications on: its Expo push token and whose phone it is.
--                             A phone that signs in as someone else moves to that person (one account per phone).
--   notification_wording_last which of the 3 approved wordings each person got last for each type, so the next one is
--                             never the same (lib/notifications/catalog.ts pickWording).
--   closed accounts           a trigger removes both when an account is closed (profiles.deleted_at is set).
--
-- Access: nothing here is readable or writable from the browser or the app directly; the server uses the service-role
-- key with the profile id from the signed-in session. Prerequisites: schema.sql (profiles) and profile_preferences.sql
-- (adds profiles.deleted_at). Safe to run more than once. NOT run yet: Cade runs it in the Supabase SQL Editor.

alter table public.profiles add column if not exists deleted_at timestamptz;

create table if not exists public.push_devices (
  token text primary key check (token ~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_devices_profile on public.push_devices (profile_id);
alter table public.push_devices enable row level security;
-- No policies on purpose: browsers and the app can't read or write it.
revoke all on table public.push_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.push_devices to service_role;

create table if not exists public.notification_wording_last (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (length(kind) between 1 and 40),
  version smallint not null check (version between 0 and 9),
  updated_at timestamptz not null default now(),
  primary key (profile_id, kind)
);
alter table public.notification_wording_last enable row level security;
revoke all on table public.notification_wording_last from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_wording_last to service_role;

create or replace function public.push_devices_scrub_closed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from push_devices where profile_id = new.id;
    delete from notification_wording_last where profile_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_push_devices_scrub_closed on public.profiles;
create trigger profiles_push_devices_scrub_closed after update of deleted_at on public.profiles
  for each row execute function public.push_devices_scrub_closed();
revoke all on function public.push_devices_scrub_closed() from public, anon, authenticated;

-- Undo (development only): drop trigger profiles_push_devices_scrub_closed on public.profiles;
--   drop function public.push_devices_scrub_closed(); drop table public.notification_wording_last; drop table public.push_devices;
