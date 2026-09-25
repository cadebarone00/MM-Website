-- Apply before deploying the Tiger Center season overview.
-- Handoffs occur at midnight America/Chicago. Existing score rows stay year-keyed.
create table if not exists public.season_calendar (
  season_year integer primary key check (season_year between 2026 and 2034),
  active_on date,
  pass_on date,
  locked boolean not null default false,
  check (active_on is null or pass_on is null or active_on < pass_on),
  check (not locked or (active_on is not null and pass_on is not null)),
  check (season_year <> 2034 or not locked)
);
alter table public.season_calendar enable row level security;
grant all on public.season_calendar to service_role;
insert into public.season_calendar(season_year) select generate_series(2026, 2034) on conflict do nothing;

create or replace function public.save_season_calendar(p_year integer, p_active date, p_pass date, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare existing public.season_calendar; neighbor public.season_calendar;
begin
  -- Serializes neighboring edits so overlapping activation windows cannot race.
  perform pg_advisory_xact_lock(7262026);
  if p_year < 2026 or p_year >= 2034 then raise exception 'The test season cannot be scheduled.' using errcode='23514'; end if;
  select * into existing from season_calendar where season_year=p_year for update;
  if existing.locked and (p_active is distinct from existing.active_on or p_pass is distinct from existing.pass_on) then
    raise exception 'Unlock these dates before editing them.' using errcode='23514';
  end if;
  if p_active is not null and p_pass is not null and p_active >= p_pass then
    raise exception 'Active must be before Pass on.' using errcode='23514';
  end if;
  if p_locked and (p_active is null or p_pass is null) then raise exception 'Choose both dates before locking.' using errcode='23514'; end if;
  if p_locked and p_year=2033 then raise exception '2034 is reserved for testing. Add a real successor season before arming the 2033 handoff.' using errcode='23514'; end if;
  for neighbor in select * from season_calendar where season_year in (p_year-1,p_year+1) loop
    if neighbor.locked and ((neighbor.season_year=p_year-1 and neighbor.pass_on is distinct from p_active) or (neighbor.season_year=p_year+1 and neighbor.active_on is distinct from p_pass)) then
      raise exception 'The handoff date is locked by the adjacent year. Unlock that year first.' using errcode='23514';
    end if;
    if neighbor.season_year=p_year-1 and neighbor.active_on is not null and p_active <= neighbor.active_on then raise exception 'This Active date must follow the previous year Active date.' using errcode='23514'; end if;
    if neighbor.season_year=p_year+1 and neighbor.pass_on is not null and p_pass >= neighbor.pass_on then raise exception 'This Pass on date must precede the next year Pass on date.' using errcode='23514'; end if;
  end loop;
  insert into season_calendar values(p_year,p_active,p_pass,p_locked) on conflict(season_year) do update set active_on=excluded.active_on,pass_on=excluded.pass_on,locked=excluded.locked;
  update season_calendar set pass_on=p_active where season_year=p_year-1 and not locked;
  update season_calendar set active_on=p_pass where season_year=p_year+1 and not locked;
end;
$$;
revoke all on function public.save_season_calendar(integer,date,date,boolean) from public;
grant execute on function public.save_season_calendar(integer,date,date,boolean) to service_role;

-- Keep legacy database consumers on the same year as the website.
create or replace function public.sync_season_calendar()
returns integer language plpgsql security definer set search_path=public as $$
declare selected_year integer; previous_year integer; today date := (now() at time zone 'America/Chicago')::date;
begin
  perform pg_advisory_xact_lock(7262026);
  select season_year into previous_year from live_active_season where id=true;
  if previous_year=2034 then return previous_year; end if;
  select season_year into selected_year from season_calendar where locked and active_on<=today and today<pass_on and season_year<2034 order by season_year desc limit 1;
  if selected_year is null then
    select season_year+1 into selected_year from season_calendar where locked and pass_on<=today and season_year<2033 order by season_year desc limit 1;
  end if;
  if selected_year is not null and selected_year is distinct from previous_year then
    update live_active_season set season_year=selected_year where id=true;
  end if;
  update live_tournament_settings settings set completed_at=(calendar.pass_on::timestamp at time zone 'America/Chicago')
    from season_calendar calendar where settings.season_year=calendar.season_year and calendar.locked and calendar.pass_on<=today and settings.completed_at is null;
  return coalesce(selected_year,previous_year,2027);
end;
$$;
revoke all on function public.sync_season_calendar() from public;
grant execute on function public.sync_season_calendar() to service_role;
-- Requests always sync the calendar. If pg_cron is already enabled, also
-- keep the stored year current when no one is visiting the website.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('season-calendar-handoff','* * * * *','select public.sync_season_calendar()');
  end if;
end $$;
