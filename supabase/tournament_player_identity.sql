-- supabase/tournament_player_identity.sql
-- Tournament participation follows the profile rule:
--   PROFILE (profiles.id)            = who the golfer is.
--   TOURNAMENT PLAYER (tournament_players.id) = that profile's place in ONE tournament, kept across its editions
--                                      (the golfer doesn't get a new identity every year).
--   EDITION ROSTER (edition_roster, keyed by edition_id + tournament_player_id) = that player in one year:
--                                      team_id and handicap for that edition only.
--   CAPTAIN (edition_teams.captain_player_id) = a role on one edition's team.
-- Teams and captaincy never live on profiles.
--
-- A golfer the organizer added by name / email is a tournament player with profile_id = NULL (no fake profile).
-- The organizer gives them an invite link (random secret; only its SHA-256 hash is stored here, like Golf Trip
-- invites). When they are signed in and accept, their profile is attached to THAT player row (claimed_at), and they
-- become a 'player' member of the tournament so they can see it if it's private. The email is contact info only —
-- it is never used to find an account, so nothing reveals whether an email has a Maroon account.
-- Declining (signed in, holding the link) leaves the player unclaimed, records declined_at and kills the link; only an
-- organizer re-opens it with a new link. Organizers (and platform admins) see each player as joined / invited /
-- declined / none through list_edition_player_invites.
--
-- Guarantees:
--   * one profile is at most one player per tournament (tournament_players_tournament_profile_key, also in
--     profile_identity.sql — repeated here so the order the files run in doesn't matter);
--   * a claimed player can never be moved to another profile (trigger keep_tournament_player_profile); it can only
--     go back to NULL (account deleted, or an admin unlinking a legacy Maroon slot);
--   * unclaimed players (profile_id NULL) stay allowed.
--
-- Legacy Maroon bridge: The Maroon's players are tournament_players with legacy_player_slug (live scoring, rosters
-- and archives still use player_slug). Claiming a player slot (player_slots.claimed_by — signup with an MM code or
-- an admin invite) now also sets that tournament player's profile_id, and unlinking clears it, so
-- legacy slot → tournament_player → profile stays in step. Existing claims are backfilled once below.
--
-- Access: no direct reads or writes (platform_foundation.sql grants these tables to the service role only). The
-- server calls the functions below with the signed-in user's profile id.
--
-- Prerequisite: platform_foundation.sql (and schema.sql). Safe to run more than once. Undo: see the bottom.

begin;

alter table public.tournament_players
  add column if not exists invite_token_hash text,
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists declined_at timestamptz;

comment on column public.tournament_players.profile_id is 'Who the golfer is (profiles.id). NULL until the invited golfer claims this place.';
comment on column public.tournament_players.legacy_player_slug is 'LEGACY: The Maroon''s old player slot; kept for live scoring and archives that still use player_slug.';

do $$
begin
  if exists (select 1 from tournament_players where profile_id is not null group by tournament_id, profile_id having count(*) > 1) then
    raise exception 'A profile is more than one player in the same tournament. Fix tournament_players.profile_id first.';
  end if;
end $$;

create unique index if not exists tournament_players_tournament_profile_key on public.tournament_players (tournament_id, profile_id) where profile_id is not null;
create unique index if not exists tournament_players_invite_token_key on public.tournament_players (invite_token_hash) where invite_token_hash is not null;

-- A claimed player keeps its profile: it can be cleared but never handed to someone else.
create or replace function public.keep_tournament_player_profile()
returns trigger
language plpgsql set search_path = public as $$
begin
  if old.profile_id is not null and new.profile_id is not null and new.profile_id <> old.profile_id then
    raise exception 'This tournament player already belongs to another profile.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists keep_tournament_player_profile on public.tournament_players;
create trigger keep_tournament_player_profile before update of profile_id on public.tournament_players
  for each row execute function public.keep_tournament_player_profile();

-- Legacy bridge: a Maroon slot's claim follows through to its tournament players.
create or replace function public.sync_legacy_tournament_player_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.claimed_by is not null and old.claimed_by is distinct from new.claimed_by then
    update tournament_players set profile_id = null where legacy_player_slug = new.player_slug and profile_id = old.claimed_by;
  end if;
  if new.claimed_by is not null and old.claimed_by is distinct from new.claimed_by then
    update tournament_players p set profile_id = new.claimed_by
    where p.legacy_player_slug = new.player_slug and p.profile_id is null
      and not exists (select 1 from tournament_players x where x.tournament_id = p.tournament_id and x.profile_id = new.claimed_by);
  end if;
  return new;
end;
$$;
drop trigger if exists sync_legacy_tournament_player_profile on public.player_slots;
create trigger sync_legacy_tournament_player_profile after update of claimed_by on public.player_slots
  for each row execute function public.sync_legacy_tournament_player_profile();

-- One-time backfill: slots claimed after the platform layer was set up.
update public.tournament_players p set profile_id = s.claimed_by
from public.player_slots s
where p.legacy_player_slug = s.player_slug and p.profile_id is null and s.claimed_by is not null
  and not exists (select 1 from public.tournament_players x where x.tournament_id = p.tournament_id and x.profile_id = s.claimed_by);

create or replace function public.tournament_invite_hash(p_token text)
returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- Who may manage a tournament's players: its owners / organizers, or a platform admin (same rule as the dashboard).
create or replace function public.can_manage_tournament_players(p_profile uuid, p_tournament uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select platform_role = 'admin' from profiles where id = p_profile), false)
      or exists (select 1 from tournament_members m where m.tournament_id = p_tournament and m.profile_id = p_profile and m.role in ('owner', 'organizer'));
$$;

-- Organizer gives an unclaimed player an invite link (or a new one: the old link stops working; a decline is cleared).
-- False when not allowed: not someone who manages that tournament, already claimed, or not found.
create or replace function public.invite_tournament_player(p_profile uuid, p_player uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invite secret is too short.' using errcode = '22023';
  end if;
  update tournament_players p set invite_token_hash = tournament_invite_hash(p_token), invited_by = p_profile, declined_at = null
  where p.id = p_player and p.profile_id is null and can_manage_tournament_players(p_profile, p.tournament_id);
  return found;
end;
$$;

-- Organizer view of one edition's players: { <tournament player id>: joined | invited | declined | none }.
-- Null when this person doesn't manage the tournament.
create or replace function public.list_edition_player_invites(p_profile uuid, p_edition uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when can_manage_tournament_players(p_profile, e.tournament_id) then coalesce((
    select jsonb_object_agg(p.id, case when p.profile_id is not null then 'joined' when p.invite_token_hash is not null then 'invited'
      when p.declined_at is not null then 'declined' else 'none' end)
    from edition_roster r join tournament_players p on p.id = r.tournament_player_id where r.edition_id = e.id), '{}'::jsonb) end
  from tournament_editions e where e.id = p_edition;
$$;

-- The signed-in person holding the link says no: the player stays unclaimed, the link stops working.
-- { status: declined | already_player (it's already your place) | not_found }.
create or replace function public.decline_tournament_player_invitation(p_profile uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_player tournament_players;
begin
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'No profile found.' using errcode = '42501';
  end if;
  select * into v_player from tournament_players where invite_token_hash = tournament_invite_hash(p_token) for update;
  if v_player.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_player.profile_id = p_profile then
    return jsonb_build_object('status', 'already_player');
  end if;
  if v_player.profile_id is not null then
    return jsonb_build_object('status', 'not_found');
  end if;
  update tournament_players set invite_token_hash = null, declined_at = now(), updated_at = now() where id = v_player.id;
  return jsonb_build_object('status', 'declined');
end;
$$;

-- What the invite link may show its holder (never the email). Null for an unknown or replaced link.
-- status: open | yours | already_player (you're another player in this tournament) | claimed.
create or replace function public.get_tournament_player_invitation(p_profile uuid, p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tournamentId', t.id, 'tournamentName', t.name, 'tournamentSlug', t.slug, 'playerName', p.display_name,
    'status', case
      when p.profile_id is not null and p.profile_id = p_profile then 'yours'
      when p.profile_id is not null then 'claimed'
      when exists (select 1 from tournament_players x where x.tournament_id = t.id and x.profile_id = p_profile) then 'already_player'
      else 'open' end)
  from tournament_players p join tournaments t on t.id = p.tournament_id
  where p.invite_token_hash = tournament_invite_hash(p_token);
$$;

-- The signed-in golfer claims their place: their profile is attached to that player row. Safe to repeat.
-- { status: accepted | already_player, tournamentId } or { status: claimed | not_found }.
create or replace function public.accept_tournament_player_invitation(p_profile uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_player tournament_players;
begin
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'No profile found.' using errcode = '42501';
  end if;
  select * into v_player from tournament_players where invite_token_hash = tournament_invite_hash(p_token) for update;
  if v_player.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_player.profile_id = p_profile
     or exists (select 1 from tournament_players where tournament_id = v_player.tournament_id and profile_id = p_profile) then
    return jsonb_build_object('status', 'already_player', 'tournamentId', v_player.tournament_id);
  end if;
  if v_player.profile_id is not null then
    return jsonb_build_object('status', 'claimed');
  end if;
  begin
    update tournament_players set profile_id = p_profile, claimed_at = now(), updated_at = now()
    where id = v_player.id and profile_id is null;
  exception when unique_violation then
    return jsonb_build_object('status', 'already_player', 'tournamentId', v_player.tournament_id);
  end;
  insert into tournament_members (tournament_id, profile_id, role) values (v_player.tournament_id, p_profile, 'player')
  on conflict (tournament_id, profile_id) do nothing;
  return jsonb_build_object('status', 'accepted', 'tournamentId', v_player.tournament_id);
end;
$$;

revoke all on function public.keep_tournament_player_profile() from public, anon, authenticated;
revoke all on function public.sync_legacy_tournament_player_profile() from public, anon, authenticated;
revoke all on function public.tournament_invite_hash(text) from public, anon, authenticated;
revoke all on function public.can_manage_tournament_players(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_edition_player_invites(uuid, uuid) from public, anon, authenticated;
revoke all on function public.decline_tournament_player_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.invite_tournament_player(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_tournament_player_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_tournament_player_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.list_edition_player_invites(uuid, uuid) to service_role;
grant execute on function public.decline_tournament_player_invitation(uuid, text) to service_role;
grant execute on function public.invite_tournament_player(uuid, uuid, text) to service_role;
grant execute on function public.get_tournament_player_invitation(uuid, text) to service_role;
grant execute on function public.accept_tournament_player_invitation(uuid, text) to service_role;

commit;

-- Undo (keeps every player and every profile link already made):
--   drop function if exists public.accept_tournament_player_invitation(uuid, text), public.get_tournament_player_invitation(uuid, text),
--     public.decline_tournament_player_invitation(uuid, text), public.list_edition_player_invites(uuid, uuid),
--     public.invite_tournament_player(uuid, uuid, text), public.can_manage_tournament_players(uuid, uuid), public.tournament_invite_hash(text);
--   drop trigger if exists sync_legacy_tournament_player_profile on public.player_slots;
--   drop function if exists public.sync_legacy_tournament_player_profile();
--   drop trigger if exists keep_tournament_player_profile on public.tournament_players;
--   drop function if exists public.keep_tournament_player_profile();
--   drop index if exists public.tournament_players_invite_token_key;
--   alter table public.tournament_players drop column if exists declined_at, drop column if exists claimed_at, drop column if exists invited_by,
--     drop column if exists invite_token_hash;
