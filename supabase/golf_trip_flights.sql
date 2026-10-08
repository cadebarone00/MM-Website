-- supabase/golf_trip_flights.sql
-- Golf Trip Info → Flights: each traveler's own flights for a trip (getting there, heading home, connections),
-- typed in by hand. No flight API yet: the provider columns at the bottom of the table are reserved for one and
-- stay empty ('manual') until then, so adding a provider later doesn't change the screens.
--
-- A flight belongs to a trip member (golf_trip_members.id), not straight to an account, so a traveler who hasn't
-- signed up yet can have flights later. It is trip-owned data: deleting the trip or the member removes it.
--
-- Private to its traveler: RLS lets a member read only their own flights, and nobody writes directly. Writes
-- and reads go through list_my_golf_trip_flights / save_golf_trip_flight / delete_golf_trip_flight, called by the
-- server with the signed-in user's id (/golf-trips/<id>/flights, /api/golf-trips/<id>/flights,
-- lib/platform/golfTripsServer.ts).
--
-- Times are the local wall-clock times printed on the ticket at each airport, saved without a timezone (a
-- westbound flight can "land before it leaves"), so arrival is not required to be after departure.
--
-- Prerequisite: golf_trips.sql. Safe to run more than once. Undo: see the bottom of this file.

begin;

create table if not exists public.golf_trip_flights (
  id uuid primary key default gen_random_uuid(),
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  member_id uuid not null references public.golf_trip_members(id) on delete cascade,
  direction text not null check (direction in ('arrival', 'return')),
  airline text not null check (length(trim(airline)) between 1 and 60),
  flight_number text not null check (flight_number ~ '^[A-Z0-9]{1,8}$'),
  departure_airport text not null check (departure_airport ~ '^[A-Z]{3}$'),
  arrival_airport text not null check (arrival_airport ~ '^[A-Z]{3}$'),
  departure_local timestamp not null,
  arrival_local timestamp not null,
  confirmation_number text check (confirmation_number ~ '^[A-Z0-9]{1,12}$'),
  notes text check (length(notes) <= 500),
  -- Reserved for a future flight-data provider. Always 'manual' / empty for now; save_golf_trip_flight never writes them.
  source text not null default 'manual' check (source in ('manual', 'provider')),
  provider text,
  provider_flight_id text,
  live_status text,
  departure_terminal text,
  departure_gate text,
  arrival_terminal text,
  arrival_gate text,
  estimated_departure timestamptz,
  estimated_arrival timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (departure_airport <> arrival_airport)
);
create index if not exists golf_trip_flights_member_idx on public.golf_trip_flights (member_id, departure_local);
create index if not exists golf_trip_flights_trip_idx on public.golf_trip_flights (golf_trip_id);

alter table public.golf_trip_flights enable row level security;

-- Read-only, and only your own. No insert / update / delete policies: writes go through save/delete below.
drop policy if exists golf_trip_flights_select_own on public.golf_trip_flights;
create policy golf_trip_flights_select_own on public.golf_trip_flights for select to authenticated
  using (public.is_my_golf_trip_member(member_id));

revoke all on public.golf_trip_flights from anon;
grant select on public.golf_trip_flights to authenticated;

-- This person's member row on this trip, or null when they aren't on it.
create or replace function public.golf_trip_member_id(p_profile uuid, p_trip uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile;
$$;
revoke all on function public.golf_trip_member_id(uuid, uuid) from public, anon, authenticated;
grant execute on function public.golf_trip_member_id(uuid, uuid) to service_role;

-- Your flights on this trip in departure order, or null when the trip doesn't exist or you aren't on it.
create or replace function public.list_my_golf_trip_flights(p_profile uuid, p_trip uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_member uuid := golf_trip_member_id(p_profile, p_trip);
begin
  if v_member is null then
    return null;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(f) - 'golf_trip_id' - 'member_id' order by f.departure_local, f.created_at)
    from golf_trip_flights f where f.member_id = v_member), '[]'::jsonb);
end;
$$;

-- Add a flight, or edit one of yours when p_flight has an id. p_flight is what lib/platform/golfTripFlights.ts
-- builds after checking the form; the table's checks repeat the important ones so no caller can skip them.
-- Returns the saved flight.
create or replace function public.save_golf_trip_flight(p_profile uuid, p_trip uuid, p_flight jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := golf_trip_member_id(p_profile, p_trip);
  v_id uuid := nullif(p_flight->>'id', '')::uuid;
  v_saved golf_trip_flights;
begin
  if v_member is null then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  if v_id is null then
    if (select count(*) from golf_trip_flights where member_id = v_member) >= 20 then
      raise exception 'You can save up to 20 flights per trip.' using errcode = '22023';
    end if;
    insert into golf_trip_flights (golf_trip_id, member_id, direction, airline, flight_number, departure_airport, arrival_airport,
      departure_local, arrival_local, confirmation_number, notes)
    values (p_trip, v_member, p_flight->>'direction', trim(p_flight->>'airline'), p_flight->>'flightNumber',
      p_flight->>'departureAirport', p_flight->>'arrivalAirport', (p_flight->>'departureLocal')::timestamp,
      (p_flight->>'arrivalLocal')::timestamp, nullif(p_flight->>'confirmationNumber', ''), nullif(trim(p_flight->>'notes'), ''))
    returning * into v_saved;
  else
    update golf_trip_flights set
      direction = p_flight->>'direction', airline = trim(p_flight->>'airline'), flight_number = p_flight->>'flightNumber',
      departure_airport = p_flight->>'departureAirport', arrival_airport = p_flight->>'arrivalAirport',
      departure_local = (p_flight->>'departureLocal')::timestamp, arrival_local = (p_flight->>'arrivalLocal')::timestamp,
      confirmation_number = nullif(p_flight->>'confirmationNumber', ''), notes = nullif(trim(p_flight->>'notes'), ''),
      updated_at = now()
    where id = v_id and member_id = v_member
    returning * into v_saved;
    if v_saved.id is null then
      raise exception 'Flight not found.' using errcode = 'P0002';
    end if;
  end if;

  return to_jsonb(v_saved) - 'golf_trip_id' - 'member_id';
end;
$$;

-- Delete one of your flights. False when it doesn't exist or isn't yours, so a stranger can't tell the two apart.
create or replace function public.delete_golf_trip_flight(p_profile uuid, p_trip uuid, p_flight uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from golf_trip_flights where id = p_flight and member_id = golf_trip_member_id(p_profile, p_trip);
  return found;
end;
$$;

revoke all on function public.list_my_golf_trip_flights(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_my_golf_trip_flights(uuid, uuid) to service_role;
revoke all on function public.save_golf_trip_flight(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_golf_trip_flight(uuid, uuid, jsonb) to service_role;
revoke all on function public.delete_golf_trip_flight(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_golf_trip_flight(uuid, uuid, uuid) to service_role;

commit;

-- Undo (deletes every saved flight):
--   drop function if exists public.delete_golf_trip_flight(uuid, uuid, uuid);
--   drop function if exists public.save_golf_trip_flight(uuid, uuid, jsonb);
--   drop function if exists public.list_my_golf_trip_flights(uuid, uuid);
--   drop function if exists public.golf_trip_member_id(uuid, uuid);
--   drop table if exists public.golf_trip_flights;
