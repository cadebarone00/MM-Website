-- Run after archived_handicap_tees.sql and course_library_tee_setups.sql.
begin;
create table if not exists public.round_format_setups (
  season_year integer not null check (season_year between 2000 and 2200),
  round integer not null check (round >= 0),
  course_name text not null,
  played_on date not null,
  tee_setup jsonb not null,
  source text not null default 'archive' check (source in ('archive','live')),
  updated_at timestamptz not null default now(),
  primary key (season_year, round)
);
alter table public.round_format_setups enable row level security;
grant select on public.round_format_setups to anon, authenticated;
grant all on public.round_format_setups to service_role;
drop policy if exists round_format_setups_read on public.round_format_setups;
create policy round_format_setups_read on public.round_format_setups for select using (true);

-- Preserve prior assignments only when the field agrees on the setup/date.
insert into public.round_format_setups(season_year, round, course_name, played_on, tee_setup)
select substring(tournament_slug from 1 for 4)::integer, round, min(course), min(played_on), (array_agg(handicap_setup))[1]
from public.archived_scorecard_rounds
where tournament_slug ~ '^[0-9]{4}-' and handicap_setup is not null and played_on is not null
group by substring(tournament_slug from 1 for 4)::integer, round
having count(distinct handicap_setup) = 1 and count(distinct played_on) = 1
on conflict (season_year, round) do nothing;

create or replace function public.archive_locked_round_setup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Once play starts, library edits must not change the historical snapshot.
  if tg_op = 'UPDATE' and old.started then return new; end if;
  if new.course_locked and new.matchups_locked and new.course_setup is not null and new.date is not null then
    insert into round_format_setups(season_year, round, course_name, played_on, tee_setup, source)
    select new.season_year, new.round, name, new.date,
      new.course_setup || jsonb_build_object('courseId',new.course_id), 'live'
    from live_courses where id = new.course_id
    on conflict (season_year, round) do update set course_name = excluded.course_name,
      played_on = excluded.played_on, tee_setup = excluded.tee_setup, updated_at = now()
    where round_format_setups.source = 'live';
  end if;
  return new;
end;
$$;
drop trigger if exists archive_locked_round_setup_trigger on public.live_round_state;
create trigger archive_locked_round_setup_trigger after insert or update on public.live_round_state
for each row execute function public.archive_locked_round_setup();

-- Existing locked live rounds already have verified snapshots.
insert into public.round_format_setups(season_year, round, course_name, played_on, tee_setup, source)
select r.season_year, r.round, c.name, r.date, r.course_setup || jsonb_build_object('courseId',r.course_id), 'live'
from public.live_round_state r join public.live_courses c on c.id = r.course_id
where r.course_locked and r.matchups_locked and r.course_setup is not null and r.date is not null
on conflict (season_year, round) do nothing;
commit;
