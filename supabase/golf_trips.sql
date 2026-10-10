-- supabase/golf_trips.sql
-- Golf Trip core: the trip, its travelers and its planned rounds, saved from the
-- Create Golf Trip questionnaire. Later modules (flights, lodging, itinerary, …)
-- add their own tables that reference golf_trips(id); nothing else lives here yet.
--
-- golf_trips.id is the parent id for everything trip-owned. Canonical page: /golf-trips/<id>.
--
-- Deletion rule: deleting a Golf Trip may delete trip-owned organizational data, memberships,
-- scheduled rounds and live event data. It must never delete finalized player historical rounds
-- or finalized player statistics. So trip-owned tables may use "on delete cascade" from
-- golf_trips, but future permanent player-history tables must not (no foreign key to the trip
-- tables, or "on delete set null", keeping their own copy of player, date, course and scores).
--
-- Writes only go through create_golf_trip (one all-or-nothing call) and
-- delete_golf_trip (organizer only), and reads through get_golf_trip /
-- list_my_golf_trips, all called by the server with the signed-in user's id
-- (POST /api/golf-trips, DELETE /api/golf-trips/<id>, /golf-trips/<id>,
-- lib/platform/golfTripsServer.ts). RLS lets trip members read their own trip and rounds
-- directly and nobody write directly. Members' rows (emails, invitations) are never readable
-- directly: the server sends each viewer only what they may see.
--
-- Prerequisite: schema.sql (profiles) and platform_foundation.sql (tournaments).
-- Safe to run more than once. Undo: see the bottom of this file.

begin;

-- One golf trip. The Yes / No / Not sure yet answers are planning states the
-- Golf Trip Home reads ("Add flights", "Set up tournament", …).
create table if not exists public.golf_trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  destination text not null check (length(trim(destination)) between 1 and 200),
  start_date date not null,
  end_date date not null,
  expected_traveler_count integer check (expected_traveler_count between 1 and 100),
  golf_days integer not null default 0 check (golf_days between 0 and 31),
  planned_rounds integer not null default 0 check (planned_rounds between 0 and 62),
  includes_tournament text not null default 'undecided' check (includes_tournament in ('yes', 'no', 'undecided')),
  lodging_plan text not null default 'undecided' check (lodging_plan in ('yes', 'no', 'undecided')),
  flight_plan text not null default 'undecided' check (flight_plan in ('yes', 'no', 'undecided')),
  transportation_plan text not null default 'undecided' check (transportation_plan in ('yes', 'no', 'undecided')),
  -- Filled in when "Set Up Tournament" attaches a real tournament; the tournament engine is not duplicated here.
  tournament_id uuid references public.tournaments(id) on delete set null,
  status text not null default 'planning' check (status in ('planning', 'upcoming', 'active', 'completed')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  -- Random id the browser sends with Create, so a double tap or a retry returns the same trip.
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (created_by, client_request_id)
);
create index if not exists golf_trips_created_by_idx on public.golf_trips (created_by);

-- Where the trip is, from the Google Places suggestion the organizer picked for the destination. All optional: a
-- destination typed by hand saves without them. destination stays the text shown everywhere; the place id is
-- just a hint back to Google, never the identity. Weather reads latitude/longitude later.
alter table public.golf_trips
  add column if not exists latitude double precision check (latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude between -180 and 180),
  add column if not exists external_place_id text check (external_place_id is null or length(external_place_id) <= 300);
alter table public.golf_trips drop constraint if exists golf_trips_coordinates_pair;
alter table public.golf_trips add constraint golf_trips_coordinates_pair check ((latitude is null) = (longitude is null));

-- Who is going: the organizer and the members. profile_id is empty for a traveler who hasn't made an account yet.
create table if not exists public.golf_trip_members (
  id uuid primary key default gen_random_uuid(),
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  email text,
  phone text,
  role text not null default 'member' check (role in ('organizer', 'member')),
  invitation_status text not null default 'pending' check (invitation_status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
-- One-time fix for databases that ran the first version of this file, where the non-organizer role was
-- 'traveler' ("create table if not exists" above leaves an existing table's rule alone). Renames those rows to
-- 'member' and swaps the rule and default. Does nothing harmful on a new database or on a second run.
alter table public.golf_trip_members drop constraint if exists golf_trip_members_role_check;
update public.golf_trip_members set role = 'member' where role = 'traveler';
alter table public.golf_trip_members alter column role set default 'member';
alter table public.golf_trip_members add constraint golf_trip_members_role_check check (role in ('organizer', 'member'));

create unique index if not exists golf_trip_members_trip_profile_idx on public.golf_trip_members (golf_trip_id, profile_id) where profile_id is not null;
create index if not exists golf_trip_members_profile_idx on public.golf_trip_members (profile_id);

-- One row per planned round. course_name is typed for now; a course id joins it when the course search lands.
create table if not exists public.golf_trip_rounds (
  id uuid primary key default gen_random_uuid(),
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 62),
  day_number integer not null check (day_number between 1 and 31),
  play_date date,
  course_name text check (course_name is null or length(course_name) <= 200),
  created_at timestamptz not null default now(),
  unique (golf_trip_id, round_number)
);

-- Is this person on the trip? security definer so the policies below don't recurse through RLS.
create or replace function public.is_golf_trip_member(p_trip uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile);
$$;
revoke all on function public.is_golf_trip_member(uuid, uuid) from public, anon;
grant execute on function public.is_golf_trip_member(uuid, uuid) to authenticated, service_role;

-- Is this membership row mine? For other tables' policies (e.g. golf_trip_flights) now that members' rows can't be
-- read directly. Answers yes / no only.
create or replace function public.is_my_golf_trip_member(p_member uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from golf_trip_members where id = p_member and profile_id = auth.uid());
$$;
revoke all on function public.is_my_golf_trip_member(uuid) from public, anon;
grant execute on function public.is_my_golf_trip_member(uuid) to authenticated, service_role;

alter table public.golf_trips enable row level security;
alter table public.golf_trip_members enable row level security;
alter table public.golf_trip_rounds enable row level security;

-- Read-only for members. No insert / update / delete policies: writes go through create_golf_trip.
drop policy if exists golf_trips_select_members on public.golf_trips;
create policy golf_trips_select_members on public.golf_trips for select to authenticated
  using (public.is_golf_trip_member(id, auth.uid()));
-- No direct reads of members (their emails and invitations stay on the server); see lib/platform/golfTripMembers.ts.
drop policy if exists golf_trip_members_select_members on public.golf_trip_members;
drop policy if exists golf_trip_rounds_select_members on public.golf_trip_rounds;
create policy golf_trip_rounds_select_members on public.golf_trip_rounds for select to authenticated
  using (public.is_golf_trip_member(golf_trip_id, auth.uid()));

revoke all on public.golf_trips, public.golf_trip_members, public.golf_trip_rounds from anon;
revoke all on public.golf_trip_members from authenticated;
grant select on public.golf_trips, public.golf_trip_rounds to authenticated;

-- Create a trip, its organizer and its rounds in one go (all or nothing). p_input is what
-- lib/platform/golfTripCreate.ts builds after validating the questionnaire; the checks here
-- repeat the important ones so no caller can skip them.
create or replace function public.create_golf_trip(p_profile uuid, p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_request uuid;
  v_trip uuid;
  v_round jsonb;
begin
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'No account found.' using errcode = '42501';
  end if;

  v_request := (p_input->>'requestId')::uuid;
  if v_request is null then
    raise exception 'Missing request id.' using errcode = '22023';
  end if;

  -- Same request again (double tap, retry after a lost reply): return the trip it already made.
  select id into v_trip from golf_trips where created_by = p_profile and client_request_id = v_request;
  if v_trip is not null then
    return jsonb_build_object('tripId', v_trip, 'created', false);
  end if;

  begin
    insert into golf_trips (name, destination, latitude, longitude, external_place_id, start_date, end_date, expected_traveler_count, golf_days, planned_rounds,
      includes_tournament, lodging_plan, flight_plan, transportation_plan, created_by, client_request_id)
    values (
      trim(p_input->>'name'), trim(p_input->>'destination'),
      (p_input->>'latitude')::double precision, (p_input->>'longitude')::double precision, nullif(trim(p_input->>'externalPlaceId'), ''),
      (p_input->>'startDate')::date, (p_input->>'endDate')::date,
      nullif(p_input->>'expectedTravelerCount', '')::integer,
      (p_input->>'golfDays')::integer, jsonb_array_length(coalesce(p_input->'rounds', '[]'::jsonb)),
      p_input->>'includesTournament', p_input->>'lodgingPlan', p_input->>'flightPlan', p_input->>'transportationPlan',
      p_profile, v_request
    )
    returning id into v_trip;
  exception when unique_violation then
    -- Two identical requests at the same moment: the other one won, return its trip.
    select id into v_trip from golf_trips where created_by = p_profile and client_request_id = v_request;
    return jsonb_build_object('tripId', v_trip, 'created', false);
  end;

  insert into golf_trip_members (golf_trip_id, profile_id, display_name, email, role, invitation_status)
  values (v_trip, p_profile, trim(p_input->'organizer'->>'displayName'), nullif(trim(p_input->'organizer'->>'email'), ''), 'organizer', 'accepted');

  for v_round in select * from jsonb_array_elements(coalesce(p_input->'rounds', '[]'::jsonb)) loop
    if (v_round->>'playDate') is not null and ((v_round->>'playDate')::date < (p_input->>'startDate')::date
        or (v_round->>'playDate')::date > (p_input->>'endDate')::date) then
      raise exception 'A round is outside the trip dates.' using errcode = '22023';
    end if;
    insert into golf_trip_rounds (golf_trip_id, round_number, day_number, play_date, course_name)
    values (v_trip, (v_round->>'roundNumber')::integer, (v_round->>'dayNumber')::integer,
      (v_round->>'playDate')::date, nullif(trim(v_round->>'courseName'), ''));
  end loop;

  return jsonb_build_object('tripId', v_trip, 'created', true);
end;
$$;

-- The whole trip for Golf Trip Home, or null when it doesn't exist or this person isn't on it.
create or replace function public.get_golf_trip(p_profile uuid, p_trip uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_golf_trip_member(t.id, p_profile) then jsonb_build_object(
    'trip', to_jsonb(t) - 'client_request_id',
    -- username: only for members who accepted with a real profile (links to /profile/<username>); null for invitations.
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'profileId', m.profile_id, 'displayName', m.display_name,
        'email', m.email, 'role', m.role, 'invitationStatus', m.invitation_status,
        'username', case when m.invitation_status = 'accepted' then p.username end) order by m.created_at)
      from golf_trip_members m left join profiles p on p.id = m.profile_id where m.golf_trip_id = t.id), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('roundNumber', r.round_number, 'dayNumber', r.day_number,
        'playDate', r.play_date, 'courseName', r.course_name) order by r.round_number)
      from golf_trip_rounds r where r.golf_trip_id = t.id), '[]'::jsonb)
  ) end
  from golf_trips t where t.id = p_trip;
$$;

-- Every trip this person belongs to (organizer or member), soonest first, for the My Trips list.
create or replace function public.list_my_golf_trips(p_profile uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'destination', t.destination, 'startDate', t.start_date, 'endDate', t.end_date,
      'status', t.status, 'expectedTravelerCount', t.expected_traveler_count,
      -- Players = accepted members with a profile; pending invitations aren't players yet.
      'memberCount', (select count(*) from golf_trip_members x where x.golf_trip_id = t.id and x.profile_id is not null and x.invitation_status = 'accepted'),
      'role', m.role
    ) order by t.start_date, t.created_at), '[]'::jsonb)
  from golf_trip_members m join golf_trips t on t.id = m.golf_trip_id
  where m.profile_id = p_profile;
$$;

-- Delete a whole trip. Only the trip's organizer can. Its members and rounds go with it (on delete cascade);
-- players' own accounts (profiles) are never touched. Returns false when the trip doesn't exist or this person
-- isn't its organizer, so a stranger can't tell the two apart.
create or replace function public.delete_golf_trip(p_profile uuid, p_trip uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from golf_trips t
  where t.id = p_trip
    and exists (select 1 from golf_trip_members m where m.golf_trip_id = t.id and m.profile_id = p_profile and m.role = 'organizer');
  return found;
end;
$$;

revoke all on function public.create_golf_trip(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_golf_trip(uuid, jsonb) to service_role;
revoke all on function public.get_golf_trip(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_golf_trip(uuid, uuid) to service_role;
revoke all on function public.list_my_golf_trips(uuid) from public, anon, authenticated;
grant execute on function public.list_my_golf_trips(uuid) to service_role;
revoke all on function public.delete_golf_trip(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_golf_trip(uuid, uuid) to service_role;

commit;

-- Undo just the location columns (keeps the trips):
--   alter table public.golf_trips drop constraint if exists golf_trips_coordinates_pair,
--     drop column if exists latitude, drop column if exists longitude, drop column if exists external_place_id;
--   (then re-run the create_golf_trip definition from the previous version of this file)
--
-- Undo (deletes every saved golf trip):
--   drop function if exists public.delete_golf_trip(uuid, uuid);
--   drop function if exists public.list_my_golf_trips(uuid);
--   drop function if exists public.get_golf_trip(uuid, uuid);
--   drop function if exists public.create_golf_trip(uuid, jsonb);
--   drop table if exists public.golf_trip_rounds, public.golf_trip_members, public.golf_trips;
--   drop function if exists public.is_golf_trip_member(uuid, uuid);
