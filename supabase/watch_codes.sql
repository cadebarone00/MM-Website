-- supabase/watch_codes.sql
-- Watch codes (project_specs.md, "Feature: Watch codes"): every tournament (code_tournaments) and golf trip gets a
-- second, read-only code so anyone can follow along without joining or signing in. Watch codes are 6 characters that
-- always start with W (no look-alikes) and never match any join code, so one code box can take either.
--
-- Spectators never touch the database. The server resolves a watch code with the service-role key and sends back only
-- what a leaderboard needs (lib/platform/watchServer.ts strips ids, emails, codes and anything private).
--
-- Prerequisites: golf_trips.sql and tournament_codes.sql. Safe to run more than once.
-- Undo: alter table public.code_tournaments drop column watch_code; alter table public.golf_trips drop column watch_code;
--       drop function public.new_watch_code(), public.find_watch_code(text);

begin;

alter table public.code_tournaments add column if not exists watch_code text;
alter table public.golf_trips add column if not exists watch_code text;

-- A fresh watch code: W + 5 characters, unused by any watch code and by any tournament join code.
create or replace function public.new_watch_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  v_code text;
  v_letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  loop
    v_code := 'W' || (select string_agg(substr(v_letters, 1 + floor(random() * length(v_letters))::integer, 1), '') from generate_series(1, 5));
    exit when not exists (select 1 from code_tournaments where watch_code = v_code or code = v_code)
          and not exists (select 1 from golf_trips where watch_code = v_code);
  end loop;
  return v_code;
end $$;

-- Existing tournaments and trips get one now; new ones get one when they're created (always on).
update public.code_tournaments set watch_code = public.new_watch_code() where watch_code is null;
update public.golf_trips set watch_code = public.new_watch_code() where watch_code is null;
alter table public.code_tournaments alter column watch_code set default public.new_watch_code();
alter table public.golf_trips alter column watch_code set default public.new_watch_code();
alter table public.code_tournaments alter column watch_code set not null;
alter table public.golf_trips alter column watch_code set not null;
create unique index if not exists code_tournaments_watch_code on public.code_tournaments (watch_code);
create unique index if not exists golf_trips_watch_code on public.golf_trips (watch_code);

-- What a watch code opens: { kind: 'tournament', id, organizer } or { kind: 'trip', id, organizer } (the organizer's
-- profile, whose read the server reuses and then strips). Null = no such code.
create or replace function public.find_watch_code(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('kind', 'tournament', 'id', t.id, 'organizer', t.organizer)
       from code_tournaments t where t.watch_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))),
    (select jsonb_build_object('kind', 'trip', 'id', g.id, 'organizer',
       (select m.profile_id from golf_trip_members m where m.golf_trip_id = g.id and m.role = 'organizer' and m.profile_id is not null limit 1))
       from golf_trips g where g.watch_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))));
$$;

revoke all on function public.new_watch_code() from public, anon, authenticated;
revoke all on function public.find_watch_code(text) from public, anon, authenticated;
grant execute on function public.new_watch_code() to service_role;
grant execute on function public.find_watch_code(text) to service_role;

commit;
