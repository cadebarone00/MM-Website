-- supabase/golf_trip_import.sql
-- Golf Trips → Import past trip (project_specs.md, "Import a past trip from a spreadsheet").
--
-- An imported trip is a real trip: a golf_trips row (imported = true, status 'completed'), its rounds, and its
-- members — the person who imported it as the organizer, everyone else as a member row with no profile yet
-- (invitation_status 'pending', the same as an invited player who hasn't joined). The organizer can later send each
-- of them a link from Trip Settings → Members (regenerate_golf_trip_invite); opening it attaches their account to that
-- same row. No fake profiles.
--
-- The results (players and teams, each round's format and par, the matches and the scores) are one JSON document in
-- golf_trip_imported_results, keyed by member row id. Live scoring tables need a real account for every golfer, which
-- old trips don't have. The server works the results out from the spreadsheet (lib/platform/pastTripImport.ts) and
-- checks them before calling import_golf_trip; nobody writes this table directly.
--
-- Access: like the rest of golf_trips.sql — no direct reads or writes; the server calls these functions with the
-- signed-in user's profile id using the service-role key. Members read the results through the server only.
--
-- Prerequisites: golf_trips.sql, golf_trip_invitations.sql. Safe to run more than once. Undo: see the bottom.

begin;

alter table public.golf_trips add column if not exists imported boolean not null default false;

create table if not exists public.golf_trip_imported_results (
  golf_trip_id uuid primary key references public.golf_trips(id) on delete cascade,
  results jsonb not null check (jsonb_typeof(results) = 'object' and octet_length(results::text) <= 1048576),
  created_at timestamptz not null default now()
);
alter table public.golf_trip_imported_results enable row level security;
revoke all on public.golf_trip_imported_results from public, anon, authenticated;
grant all on public.golf_trip_imported_results to service_role;

-- Makes the whole trip in one step. p_input: requestId, name, destination, startDate, endDate, organizerName,
-- organizerMemberId (the importer's own player row id, or null if they didn't play), players [{id, name}],
-- rounds [{roundNumber, dayNumber, playDate, courseName}], results (object).
-- The same requestId again (double tap, retry) returns the trip it already made.
create or replace function public.import_golf_trip(p_profile uuid, p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_request uuid;
  v_trip uuid;
  v_me uuid;
  v_player jsonb;
  v_round jsonb;
  v_start date;
  v_end date;
begin
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  v_request := (p_input->>'requestId')::uuid;
  if v_request is null then
    raise exception 'Missing request id.' using errcode = '22023';
  end if;
  select id into v_trip from golf_trips where created_by = p_profile and client_request_id = v_request;
  if v_trip is not null then
    return jsonb_build_object('tripId', v_trip, 'created', false);
  end if;

  v_start := (p_input->>'startDate')::date;
  v_end := (p_input->>'endDate')::date;
  if v_start is null or v_end is null or v_end < v_start or v_end >= current_date then
    raise exception 'Only past trips can be imported.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_input->'players') <> 'array' or jsonb_array_length(p_input->'players') not between 2 and 64
    or jsonb_typeof(p_input->'rounds') <> 'array' or jsonb_array_length(p_input->'rounds') not between 1 and 62
    or jsonb_typeof(p_input->'results') <> 'object' then
    raise exception 'Invalid import.' using errcode = '22023';
  end if;
  v_me := nullif(p_input->>'organizerMemberId', '')::uuid;
  if v_me is not null and not exists (select 1 from jsonb_array_elements(p_input->'players') p where (p->>'id')::uuid = v_me) then
    raise exception 'Invalid import.' using errcode = '22023';
  end if;

  begin
    insert into golf_trips (name, destination, start_date, end_date, expected_traveler_count, golf_days, planned_rounds,
      includes_tournament, lodging_plan, flight_plan, transportation_plan, status, imported, created_by, client_request_id)
    values (trim(p_input->>'name'), trim(p_input->>'destination'), v_start, v_end, jsonb_array_length(p_input->'players'),
      (select count(distinct r->>'dayNumber') from jsonb_array_elements(p_input->'rounds') r), jsonb_array_length(p_input->'rounds'),
      'yes', 'no', 'no', 'no', 'completed', true, p_profile, v_request)
    returning id into v_trip;
  exception when unique_violation then
    select id into v_trip from golf_trips where created_by = p_profile and client_request_id = v_request;
    return jsonb_build_object('tripId', v_trip, 'created', false);
  end;

  -- The importer: the organizer row (their own player row when they played).
  insert into golf_trip_members (id, golf_trip_id, profile_id, display_name, role, invitation_status, claimed_at)
  values (coalesce(v_me, gen_random_uuid()), v_trip, p_profile, trim(p_input->>'organizerName'), 'organizer', 'accepted', now());
  for v_player in select * from jsonb_array_elements(p_input->'players') loop
    if (v_player->>'id')::uuid is distinct from v_me then
      insert into golf_trip_members (id, golf_trip_id, profile_id, display_name, role, invitation_status, invited_by)
      values ((v_player->>'id')::uuid, v_trip, null, trim(v_player->>'name'), 'member', 'pending', p_profile);
    end if;
  end loop;

  for v_round in select * from jsonb_array_elements(p_input->'rounds') loop
    if (v_round->>'playDate') is not null and ((v_round->>'playDate')::date < v_start or (v_round->>'playDate')::date > v_end) then
      raise exception 'A round is outside the trip dates.' using errcode = '22023';
    end if;
    insert into golf_trip_rounds (golf_trip_id, round_number, day_number, play_date, course_name)
    values (v_trip, (v_round->>'roundNumber')::integer, (v_round->>'dayNumber')::integer, (v_round->>'playDate')::date, nullif(trim(v_round->>'courseName'), ''));
  end loop;

  insert into golf_trip_imported_results (golf_trip_id, results) values (v_trip, p_input->'results');
  return jsonb_build_object('tripId', v_trip, 'created', true);
end;
$$;
revoke all on function public.import_golf_trip(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_golf_trip(uuid, jsonb) to service_role;

-- An imported trip's results, for members only (null for anyone else, or a trip that wasn't imported).
create or replace function public.get_golf_trip_imported_results(p_profile uuid, p_trip uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select r.results from golf_trip_imported_results r
  where r.golf_trip_id = p_trip and public.is_golf_trip_member(p_trip, p_profile);
$$;
revoke all on function public.get_golf_trip_imported_results(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_golf_trip_imported_results(uuid, uuid) to service_role;

commit;

-- Undo (imported trips are deleted with them):
--   delete from public.golf_trips where imported;
--   drop function if exists public.get_golf_trip_imported_results(uuid, uuid);
--   drop function if exists public.import_golf_trip(uuid, jsonb);
--   drop table if exists public.golf_trip_imported_results;
--   alter table public.golf_trips drop column if exists imported;
