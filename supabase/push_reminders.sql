-- supabase/push_reminders.sql
-- Timed phone notifications (project_specs.md "Expo app Step 6", part 6c, 2026-11-26): "Tee time in 30 minutes" and
-- "The draft starts in 15 minutes".
--   golf_trips.time_zone    the trip's time zone (IANA name, e.g. "America/Phoenix"), picked by the organizer in Trip
--                           Settings → General. Tee times and the draft time are trip-local, so reminders need it.
--                           Empty = America/Chicago until the organizer picks one.
--   push_reminders_sent     one row per reminder already sent, so the 5-minute timer never sends one twice.
--                           Rows older than 30 days are removed by the timer itself.
--
-- Access: service role only (the timer route and the time-zone route use the service-role key after their own checks).
-- Prerequisites: golf_trips.sql, push_devices.sql. Safe to run more than once. NOT run yet: Cade runs it in the SQL Editor.

alter table public.golf_trips add column if not exists time_zone text
  check (time_zone is null or time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$');

create table if not exists public.push_reminders_sent (
  key text primary key check (length(key) between 3 and 200),
  sent_at timestamptz not null default now()
);
create index if not exists push_reminders_sent_at on public.push_reminders_sent (sent_at);
alter table public.push_reminders_sent enable row level security;
-- No policies on purpose: browsers and the app can't read or write it.
revoke all on table public.push_reminders_sent from public, anon, authenticated;
grant select, insert, delete on table public.push_reminders_sent to service_role;

-- Undo (development only): drop table public.push_reminders_sent; alter table public.golf_trips drop column time_zone;
