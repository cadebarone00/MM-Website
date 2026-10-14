-- Saved organizer setup for the shared phone/development UI.
-- Prerequisite: golf_trips.sql. No existing trips are deleted or rewritten on installation.
begin;
create table if not exists public.golf_trip_setup (
  golf_trip_id uuid primary key references public.golf_trips(id) on delete cascade,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 524288),
  basis jsonb not null,
  revision integer not null default 1,
  last_write_id uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.golf_trip_setup enable row level security;
revoke all on public.golf_trip_setup from public, anon, authenticated;
grant all on public.golf_trip_setup to service_role;

create or replace function public.save_golf_trip_setup(
  p_profile uuid, p_trip uuid, p_revision integer, p_write uuid, p_settings jsonb,
  p_basis jsonb, p_arrival date, p_departure date, p_capacity integer, p_rounds jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_saved golf_trip_setup;
  v_trip golf_trips;
  v_rounds jsonb;
  v_scored boolean := false;
  v_revision integer;
begin
  select * into v_trip from golf_trips where id = p_trip for update;
  if not found or not exists(select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer' and invitation_status = 'accepted') then
    raise exception 'Trip not found.' using errcode = '42501';
  end if;
  select * into v_saved from golf_trip_setup where golf_trip_id = p_trip;
  if v_saved.last_write_id = p_write then return jsonb_build_object('revision',v_saved.revision); end if;
  if coalesce(v_saved.revision,0) <> p_revision then raise exception 'Settings changed on another device. Reload before editing.' using errcode = '40001'; end if;
  if jsonb_typeof(p_settings) <> 'object' or octet_length(p_settings::text) > 524288 or jsonb_typeof(p_rounds) <> 'array'
    or p_capacity not between 1 and 64 or p_arrival is null or p_departure is null or p_departure < p_arrival or p_departure - p_arrival > 30 then
    raise exception 'Invalid trip settings.' using errcode = '22023';
  end if;
  if p_capacity < (select count(*) from golf_trip_members where golf_trip_id = p_trip and invitation_status = 'accepted') then
    raise exception 'Remove a joined player before lowering the player count.' using errcode = '22023';
  end if;
  perform id from golf_trip_rounds where golf_trip_id = p_trip order by round_number for update;
  select coalesce(jsonb_agg(jsonb_build_object('roundNumber',round_number,'dayNumber',day_number,'playDate',play_date,'courseName',course_name) order by round_number),'[]') into v_rounds
    from golf_trip_rounds where golf_trip_id = p_trip;
  if to_regclass('public.scoring_groups') is not null then
    execute 'select exists(select 1 from public.scoring_groups where golf_trip_id = $1)' into v_scored using p_trip;
  end if;
  if v_scored and (p_rounds <> v_rounds or p_arrival <> v_trip.start_date or p_departure <> v_trip.end_date) then
    raise exception 'This trip has scoring groups. Its dates and rounds cannot be changed.' using errcode = '42501';
  end if;
  if p_rounds <> v_rounds then
    delete from golf_trip_rounds where golf_trip_id = p_trip and round_number not in (select (r->>'roundNumber')::integer from jsonb_array_elements(p_rounds) r);
    insert into golf_trip_rounds(golf_trip_id,round_number,day_number,play_date,course_name)
      select p_trip,(r->>'roundNumber')::integer,(r->>'dayNumber')::integer,(r->>'playDate')::date,r->>'courseName' from jsonb_array_elements(p_rounds) r
      on conflict(golf_trip_id,round_number) do update set day_number=excluded.day_number,play_date=excluded.play_date,course_name=excluded.course_name;
  end if;
  update golf_trips set start_date=p_arrival,end_date=p_departure,expected_traveler_count=p_capacity,
    planned_rounds=jsonb_array_length(p_rounds),golf_days=(select count(distinct r->>'playDate') from jsonb_array_elements(p_rounds) r),
    includes_tournament=case when p_settings ? 'localCompetitionType' then case when p_settings->'localCompetitionType'->>'individual' is not null or p_settings->'localCompetitionType'->>'team' is not null then 'yes' else 'no' end else includes_tournament end
    where id=p_trip;
  v_revision := coalesce(v_saved.revision,0)+1;
  insert into golf_trip_setup(golf_trip_id,settings,basis,revision,last_write_id)
    values(p_trip,p_settings,coalesce(v_saved.basis,p_basis),v_revision,p_write)
    on conflict(golf_trip_id) do update set settings=excluded.settings,revision=excluded.revision,last_write_id=excluded.last_write_id,updated_at=now();
  return jsonb_build_object('revision',v_revision);
end;
$$;
revoke all on function public.save_golf_trip_setup(uuid,uuid,integer,uuid,jsonb,jsonb,date,date,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_golf_trip_setup(uuid,uuid,integer,uuid,jsonb,jsonb,date,date,integer,jsonb) to service_role;
commit;
