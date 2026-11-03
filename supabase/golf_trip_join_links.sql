-- supabase/golf_trip_join_links.sql
-- Trip Builder: ONE shareable invite link per golf trip (docs/superpowers/specs/2026-11-03-trip-builder-design.md).
--
-- The link is /golf-trips/join/<join_code>. Anyone on the trip can copy or share it; anyone who opens it, signs up or
-- logs in, and taps Join is added to the trip straight away (no approval). The organizer can remove people and can
-- Reset the link so the old one stops working.
--
-- A link lasts 30 MINUTES (owner decision 2026-11-03). Asking for the link (golf_trip_join_code) hands back the
-- current one while it has more than 5 minutes left, otherwise a fresh 30-minute one, so nobody is given a link that
-- dies before their friend taps it.
--
-- Someone who was already invited by email (golf_trip_invitations.sql) and joins through the link claims that
-- pending invitation row instead of getting a second row.
--
-- Access: like golf_trips.sql — no direct reads/writes; the server calls these functions with the signed-in
-- person's profile id using the service-role key (lib/platform/golfTripsServer.ts).
--
-- Prerequisites: golf_trips.sql, then golf_trip_invitations.sql. Safe to run more than once. Undo: see the bottom.

begin;

alter table public.golf_trips
  add column if not exists join_code text,
  add column if not exists join_code_expires_at timestamptz;
alter table public.golf_trips drop constraint if exists golf_trips_join_code_format;
alter table public.golf_trips add constraint golf_trips_join_code_format
  check (join_code is null or join_code ~ '^[A-Za-z0-9_-]{24,64}$');
create unique index if not exists golf_trips_join_code_key on public.golf_trips (join_code) where join_code is not null;

-- The trip's current link for anyone on the trip: { code, expiresAt }. A missing, expired or nearly expired
-- (5 minutes or less left) code is replaced by p_new_code (made by the server) for 30 minutes. Not on the trip → null.
create or replace function public.golf_trip_join_code(p_profile uuid, p_trip uuid, p_new_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_trip golf_trips;
begin
  if not is_golf_trip_member(p_trip, p_profile) then
    return null;
  end if;
  select * into v_trip from golf_trips where id = p_trip for update;
  if v_trip.join_code is null or v_trip.join_code_expires_at is null or v_trip.join_code_expires_at <= now() + interval '5 minutes' then
    update golf_trips set join_code = p_new_code, join_code_expires_at = now() + interval '30 minutes'
    where id = p_trip returning * into v_trip;
  end if;
  return jsonb_build_object('code', v_trip.join_code, 'expiresAt', v_trip.join_code_expires_at);
end;
$$;

-- Organizer only: a brand-new 30-minute link; the old one stops working at once.
create or replace function public.reset_golf_trip_join_code(p_profile uuid, p_trip uuid, p_new_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_trip golf_trips;
begin
  if not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer') then
    raise exception 'Only the organizer can reset the invite link.' using errcode = '42501';
  end if;
  update golf_trips set join_code = p_new_code, join_code_expires_at = now() + interval '30 minutes'
  where id = p_trip returning * into v_trip;
  return jsonb_build_object('code', v_trip.join_code, 'expiresAt', v_trip.join_code_expires_at);
end;
$$;

-- What the join page shows to anyone holding the link (signed in or not). Never any email.
-- status: member (you're on it) | expired | open. Unknown or replaced code → null.
create or replace function public.get_golf_trip_join_preview(p_profile uuid, p_code text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tripId', t.id, 'tripName', t.name, 'destination', t.destination, 'startDate', t.start_date, 'endDate', t.end_date,
    'organizerName', (select o.display_name from golf_trip_members o where o.golf_trip_id = t.id and o.role = 'organizer'),
    'status', case
      when p_profile is not null and exists (select 1 from golf_trip_members m where m.golf_trip_id = t.id and m.profile_id = p_profile) then 'member'
      when t.join_code_expires_at is null or t.join_code_expires_at <= now() then 'expired'
      else 'open' end)
  from golf_trips t
  where t.join_code = p_code;
$$;

-- The signed-in golfer joins through the link. { status: joined | already_member, tripId } or { status: expired | not_found }.
create or replace function public.join_golf_trip_by_code(p_profile uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_trip golf_trips;
  v_invite uuid;
  v_name text;
begin
  select * into v_profile from profiles where id = p_profile;
  if v_profile.id is null then
    raise exception 'No profile found.' using errcode = '42501';
  end if;
  select * into v_trip from golf_trips where join_code = p_code for update;
  if v_trip.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if exists (select 1 from golf_trip_members where golf_trip_id = v_trip.id and profile_id = p_profile) then
    return jsonb_build_object('status', 'already_member', 'tripId', v_trip.id);
  end if;
  if v_trip.join_code_expires_at is null or v_trip.join_code_expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  begin
    -- Already invited by this email and not yet claimed: claim that row.
    select id into v_invite from golf_trip_members
    where golf_trip_id = v_trip.id and profile_id is null and invitation_status = 'pending'
      and v_profile.email is not null and lower(email) = lower(v_profile.email)
    for update;
    if v_invite is not null then
      update golf_trip_members set profile_id = p_profile, invitation_status = 'accepted', claimed_at = now(), invite_token_hash = null
      where id = v_invite;
    else
      v_name := left(coalesce(nullif(trim(v_profile.display_name), ''), nullif(trim(v_profile.username), ''), 'Golfer'), 120);
      insert into golf_trip_members (golf_trip_id, profile_id, display_name, email, role, invitation_status, claimed_at)
      values (v_trip.id, p_profile, v_name,
        -- One email per trip: leave it off when another row (e.g. a declined invite) already has it.
        case when v_profile.email is not null and not exists (
          select 1 from golf_trip_members x where x.golf_trip_id = v_trip.id and lower(x.email) = lower(v_profile.email)) then v_profile.email end,
        'member', 'accepted', now());
    end if;
  exception when unique_violation then
    -- The same profile joined at the same moment through another tap or invitation.
    return jsonb_build_object('status', 'already_member', 'tripId', v_trip.id);
  end;
  return jsonb_build_object('status', 'joined', 'tripId', v_trip.id);
end;
$$;

revoke all on function public.golf_trip_join_code(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reset_golf_trip_join_code(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_golf_trip_join_preview(uuid, text) from public, anon, authenticated;
revoke all on function public.join_golf_trip_by_code(uuid, text) from public, anon, authenticated;
grant execute on function public.golf_trip_join_code(uuid, uuid, text) to service_role;
grant execute on function public.reset_golf_trip_join_code(uuid, uuid, text) to service_role;
grant execute on function public.get_golf_trip_join_preview(uuid, text) to service_role;
grant execute on function public.join_golf_trip_by_code(uuid, text) to service_role;

commit;

-- Undo (keeps every member row; removes the shareable link):
--   drop function if exists public.join_golf_trip_by_code(uuid, text), public.get_golf_trip_join_preview(uuid, text),
--     public.reset_golf_trip_join_code(uuid, uuid, text), public.golf_trip_join_code(uuid, uuid, text);
--   drop index if exists public.golf_trips_join_code_key;
--   alter table public.golf_trips drop constraint if exists golf_trips_join_code_format,
--     drop column if exists join_code_expires_at, drop column if exists join_code;
