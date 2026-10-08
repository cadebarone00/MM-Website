-- supabase/golf_trip_invitations.sql
-- Golf Trip membership identity and invitations. The rule:
--   ACCOUNT = login. PROFILE = the golfer (profiles.id). GOLF TRIP MEMBER = that profile's participation in one trip.
--   profile → golf_trip_members → golf_trip
--
-- A golf_trip_members row is the membership. Once it has a profile_id, that profile IS the golfer on the trip;
-- display_name / email stay on the row only as the invitation and a name snapshot, never as the identity.
--
-- Invitations: the organizer invites "John Smith, john@email.com" before John has an account. That creates John's
-- member row now, with profile_id = NULL and invitation_status 'pending' — no fake profile, no ghost account. The
-- invite link carries a random secret; only its SHA-256 hash is stored (invite_token_hash). When John is signed in
-- and opens the link, accept_golf_trip_invitation attaches HIS profile to THAT row (no second row). The email is
-- contact information only: it is never used to find an account, and nothing here tells the organizer whether an
-- email belongs to a Maroon account.
--
-- Guarantees:
--   * one profile, one row per trip (golf_trip_members_trip_profile_idx, from golf_trips.sql);
--   * one organizer row per trip (golf_trip_members_one_organizer_key);
--   * an email is invited at most once per trip (golf_trip_members_trip_email_key);
--   * an invite secret belongs to one row (golf_trip_members_invite_token_key);
--   * a claimed row can never be moved to another profile (trigger keep_golf_trip_member_profile) — it may only go
--     back to NULL, which happens when that account is deleted (the row stays as a name, like history);
--   * unclaimed rows (profile_id NULL) stay allowed.
-- Accepting is safe to repeat: the same profile gets "already_member", anyone else gets "claimed".
--
-- Declining (signed in, holding the link) keeps the row as history — invitation_status 'declined', declined_at,
-- still no profile — and clears the link's hash, so that link can never be accepted later. Only the organizer can
-- re-open it, by making a new link (regenerate_golf_trip_invite), which is also how a lost link is replaced: the
-- same row gets a new hash, the old link stops working at once, and accepted rows can't get links at all.
-- Cancelling (remove_golf_trip_member) deletes the row.
--
-- Privacy: nobody reads golf_trip_members directly (no grant, no policy); the server decides what each viewer sees
-- (emails only for the organizer and your own row — lib/platform/golfTripMembers.ts).
--
-- Organizer: golf_trips.created_by is the profile that owns the trip (security: who may manage it). The organizer
-- also has a normal member row (role 'organizer', accepted, profile_id = created_by) made with the trip in
-- create_golf_trip — the same participation model as everyone else, not a second identity.
--
-- Teams are not stored here or on profiles. They will belong to a trip-specific competition relationship
-- (see project_specs.md, "Golf Trip membership identity").
--
-- Access: like the rest of golf_trips.sql — no direct writes; the server calls these functions with the signed-in
-- user's profile id (lib/platform/golfTripsServer.ts) using the service-role key.
--
-- Prerequisite: golf_trips.sql. Safe to run more than once. Undo: see the bottom of this file.

begin;

alter table public.golf_trip_members
  add column if not exists invite_token_hash text,
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists declined_at timestamptz;

-- Members' emails and invite hashes are server-only (golf_trips.sql does the same; repeated here so the order the
-- two files run in doesn't matter).
drop policy if exists golf_trip_members_select_members on public.golf_trip_members;
revoke all on public.golf_trip_members from anon, authenticated;

-- Existing data must already follow the rules; otherwise stop with a message and change nothing.
do $$
begin
  if exists (select 1 from golf_trip_members where role = 'organizer' group by golf_trip_id having count(*) > 1) then
    raise exception 'A golf trip has more than one organizer row. Fix golf_trip_members first.';
  end if;
  if exists (select 1 from golf_trip_members where email is not null group by golf_trip_id, lower(email) having count(*) > 1) then
    raise exception 'A golf trip has the same email on two member rows. Fix golf_trip_members first.';
  end if;
end $$;

create unique index if not exists golf_trip_members_one_organizer_key on public.golf_trip_members (golf_trip_id) where role = 'organizer';
create unique index if not exists golf_trip_members_trip_email_key on public.golf_trip_members (golf_trip_id, lower(email)) where email is not null;
create unique index if not exists golf_trip_members_invite_token_key on public.golf_trip_members (invite_token_hash) where invite_token_hash is not null;

-- A claimed membership keeps its profile: it can be cleared (account deleted) but never handed to someone else.
create or replace function public.keep_golf_trip_member_profile()
returns trigger
language plpgsql set search_path = public as $$
begin
  if old.profile_id is not null and new.profile_id is not null and new.profile_id <> old.profile_id then
    raise exception 'This trip membership already belongs to another profile.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists keep_golf_trip_member_profile on public.golf_trip_members;
create trigger keep_golf_trip_member_profile before update of profile_id on public.golf_trip_members
  for each row execute function public.keep_golf_trip_member_profile();

create or replace function public.golf_trip_invite_hash(p_token text)
returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- Organizer invites someone by name (+ optional email). p_token is the invite link's secret, made by the server.
-- Returns { memberId }, or null when this person isn't the trip's organizer (same answer for a missing trip).
create or replace function public.invite_golf_trip_member(p_profile uuid, p_trip uuid, p_input jsonb, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(p_input->>'displayName', ''));
  v_email text := nullif(lower(trim(coalesce(p_input->>'email', ''))), '');
  v_member uuid;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invite secret is too short.' using errcode = '22023';
  end if;
  if not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer') then
    return null;
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'Add the person''s name.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email doesn''t look right.' using errcode = '22023';
  end if;
  insert into golf_trip_members (golf_trip_id, display_name, email, role, invitation_status, invite_token_hash, invited_by)
  values (p_trip, v_name, v_email, 'member', 'pending', golf_trip_invite_hash(p_token), p_profile)
  returning id into v_member;
  return jsonb_build_object('memberId', v_member);
end;
$$;

-- What the invite page may show to whoever holds the link (never the invited email). Null for an unknown or
-- cancelled invitation. status: open (anyone signed in may accept), yours, already_member (you're on the trip
-- another way), claimed (someone else accepted it).
create or replace function public.get_golf_trip_invitation(p_profile uuid, p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tripId', t.id, 'tripName', t.name, 'destination', t.destination, 'startDate', t.start_date, 'endDate', t.end_date,
    'invitedName', m.display_name,
    'organizerName', (select o.display_name from golf_trip_members o where o.golf_trip_id = t.id and o.role = 'organizer'),
    'status', case
      when m.profile_id is not null and m.profile_id = p_profile then 'yours'
      when m.profile_id is not null then 'claimed'
      when exists (select 1 from golf_trip_members x where x.golf_trip_id = t.id and x.profile_id = p_profile) then 'already_member'
      else 'open' end)
  from golf_trip_members m join golf_trips t on t.id = m.golf_trip_id
  where m.invite_token_hash = golf_trip_invite_hash(p_token);
$$;

-- The signed-in golfer accepts: their profile is attached to the invited row. Safe to repeat.
-- { status: accepted | already_member, tripId } or { status: claimed | not_found }.
create or replace function public.accept_golf_trip_invitation(p_profile uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member golf_trip_members;
begin
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'No profile found.' using errcode = '42501';
  end if;
  select * into v_member from golf_trip_members where invite_token_hash = golf_trip_invite_hash(p_token) for update;
  if v_member.id is null or (v_member.profile_id is null and v_member.invitation_status <> 'pending') then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_member.profile_id = p_profile then
    return jsonb_build_object('status', 'already_member', 'tripId', v_member.golf_trip_id);
  end if;
  if v_member.profile_id is not null then
    return jsonb_build_object('status', 'claimed');
  end if;
  if exists (select 1 from golf_trip_members where golf_trip_id = v_member.golf_trip_id and profile_id = p_profile) then
    return jsonb_build_object('status', 'already_member', 'tripId', v_member.golf_trip_id);
  end if;
  begin
    update golf_trip_members set profile_id = p_profile, invitation_status = 'accepted', claimed_at = now()
    where id = v_member.id and profile_id is null;
  exception when unique_violation then
    -- The same profile joined this trip through another invitation at the same moment.
    return jsonb_build_object('status', 'already_member', 'tripId', v_member.golf_trip_id);
  end;
  return jsonb_build_object('status', 'accepted', 'tripId', v_member.golf_trip_id);
end;
$$;

-- The signed-in person holding the link says no. The row stays (status 'declined') with no profile; the link stops
-- working. { status: declined | already_member (you're on the trip) | not_found }.
create or replace function public.decline_golf_trip_invitation(p_profile uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member golf_trip_members;
begin
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'No profile found.' using errcode = '42501';
  end if;
  select * into v_member from golf_trip_members where invite_token_hash = golf_trip_invite_hash(p_token) for update;
  if v_member.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_member.profile_id = p_profile or exists (select 1 from golf_trip_members where golf_trip_id = v_member.golf_trip_id and profile_id = p_profile) then
    return jsonb_build_object('status', 'already_member');
  end if;
  if v_member.profile_id is not null or v_member.invitation_status <> 'pending' then
    return jsonb_build_object('status', 'not_found');
  end if;
  update golf_trip_members set invitation_status = 'declined', declined_at = now(), invite_token_hash = null where id = v_member.id;
  return jsonb_build_object('status', 'declined');
end;
$$;

-- Organizer replaces an invitation's link (lost link, or re-inviting someone who declined): same row, new hash,
-- back to pending; the old link stops working. Only for invitations nobody has accepted. False when not allowed.
create or replace function public.regenerate_golf_trip_invite(p_profile uuid, p_trip uuid, p_member uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invite secret is too short.' using errcode = '22023';
  end if;
  update golf_trip_members m
  set invite_token_hash = golf_trip_invite_hash(p_token), invitation_status = 'pending', declined_at = null
  where m.id = p_member and m.golf_trip_id = p_trip and m.role = 'member' and m.profile_id is null
    and exists (select 1 from golf_trip_members o where o.golf_trip_id = p_trip and o.profile_id = p_profile and o.role = 'organizer');
  return found;
end;
$$;

-- Organizer removes a member or cancels an invitation (the link stops working). The organizer row can't be removed.
-- False when not allowed or not found (same answer, so a stranger learns nothing).
create or replace function public.remove_golf_trip_member(p_profile uuid, p_trip uuid, p_member uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from golf_trip_members m
  where m.id = p_member and m.golf_trip_id = p_trip and m.role <> 'organizer'
    and exists (select 1 from golf_trip_members o where o.golf_trip_id = p_trip and o.profile_id = p_profile and o.role = 'organizer');
  return found;
end;
$$;

-- A member leaves a trip themselves. The organizer can't leave (they delete the trip instead).
create or replace function public.leave_golf_trip(p_profile uuid, p_trip uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role <> 'organizer';
  return found;
end;
$$;

revoke all on function public.keep_golf_trip_member_profile() from public, anon, authenticated;
revoke all on function public.golf_trip_invite_hash(text) from public, anon, authenticated;
revoke all on function public.invite_golf_trip_member(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.get_golf_trip_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_golf_trip_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.decline_golf_trip_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.regenerate_golf_trip_invite(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.remove_golf_trip_member(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_golf_trip(uuid, uuid) from public, anon, authenticated;
grant execute on function public.invite_golf_trip_member(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.get_golf_trip_invitation(uuid, text) to service_role;
grant execute on function public.accept_golf_trip_invitation(uuid, text) to service_role;
grant execute on function public.decline_golf_trip_invitation(uuid, text) to service_role;
grant execute on function public.regenerate_golf_trip_invite(uuid, uuid, uuid, text) to service_role;
grant execute on function public.remove_golf_trip_member(uuid, uuid, uuid) to service_role;
grant execute on function public.leave_golf_trip(uuid, uuid) to service_role;

commit;

-- Undo (keeps every member row; removes invitations' secrets and the new rules):
--   drop function if exists public.leave_golf_trip(uuid, uuid), public.remove_golf_trip_member(uuid, uuid, uuid),
--     public.regenerate_golf_trip_invite(uuid, uuid, uuid, text), public.decline_golf_trip_invitation(uuid, text),
--     public.accept_golf_trip_invitation(uuid, text), public.get_golf_trip_invitation(uuid, text),
--     public.invite_golf_trip_member(uuid, uuid, jsonb, text), public.golf_trip_invite_hash(text);
--   drop trigger if exists keep_golf_trip_member_profile on public.golf_trip_members;
--   drop function if exists public.keep_golf_trip_member_profile();
--   drop index if exists public.golf_trip_members_invite_token_key, public.golf_trip_members_trip_email_key,
--     public.golf_trip_members_one_organizer_key;
--   alter table public.golf_trip_members drop column if exists declined_at, drop column if exists claimed_at, drop column if exists invited_by,
--     drop column if exists invite_token_hash;
