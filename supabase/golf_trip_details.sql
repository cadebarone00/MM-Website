-- supabase/golf_trip_details.sql
-- Trip Settings → General → General Settings: the organizer changes the trip's name, destination (and its Google
-- place / coordinates) and how everyone's getting there (flight_plan) after the trip is made.
-- One function, called only by the server (PATCH /api/golf-trips/<id>/details) with the signed-in user's id.
-- It changes those columns on that one trip and nothing else; no rows are deleted.
--
-- Prerequisite: golf_trips.sql (including its location columns). Safe to run more than once.
-- Undo: drop function if exists public.update_golf_trip_details(uuid, uuid, text, text, double precision, double precision, text, text);

begin;

create or replace function public.update_golf_trip_details(
  p_profile uuid, p_trip uuid, p_name text, p_destination text,
  p_latitude double precision, p_longitude double precision, p_place_id text, p_flight_plan text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile
      and role = 'organizer' and invitation_status = 'accepted') then
    raise exception 'Only the organizer can change trip details.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 or length(trim(coalesce(p_destination, ''))) not between 1 and 200
    or p_flight_plan not in ('yes', 'no', 'undecided') or (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Invalid trip details.' using errcode = '22023';
  end if;
  update golf_trips set name = trim(p_name), destination = trim(p_destination),
    latitude = p_latitude, longitude = p_longitude, external_place_id = nullif(trim(p_place_id), ''),
    flight_plan = p_flight_plan, updated_at = now()
    where id = p_trip;
  return found;
end;
$$;

revoke all on function public.update_golf_trip_details(uuid, uuid, text, text, double precision, double precision, text, text) from public, anon, authenticated;
grant execute on function public.update_golf_trip_details(uuid, uuid, text, text, double precision, double precision, text, text) to service_role;

commit;
