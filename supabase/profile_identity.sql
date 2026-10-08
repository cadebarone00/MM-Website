-- supabase/profile_identity.sql
-- Profile identity foundation. The permanent rule:
--   ACCOUNT (auth.users)  = login only.
--   PROFILE (profiles)    = the golfer. profiles.id IS the permanent profile_id.
--
-- profiles.id is the primary key AND a foreign key to auth.users(id): every profile has exactly one login account
-- behind it, and a login account can never get a second profile (the primary key refuses it). So "which profile
-- does this account control?" is a direct lookup — profiles.id = auth.uid() — never an email / username / name /
-- player_slug match. Golf and product tables point at profiles(id) in a column named profile_id
-- (golf_trip_members, tournament_players, tournament_members, player_rounds, …). No second identifier is needed.
--
-- Teams are NOT part of a profile. They belong to a context (an edition's roster, a trip), never to the person.
--
-- This file adds the uniqueness rules that keep links to a profile one-to-one:
--   * profiles.player_slug  — the optional, temporary legacy mapping to an old Maroon player slot: one slot ↔ one profile.
--   * player_slots.claimed_by — the same link from the slot's side: a profile claims at most one slot.
--   * tournament_players (tournament_id, profile_id) — a profile is at most one player in a tournament
--     (players not yet linked to a profile are unaffected).
-- Each rule first checks the existing data. If anything already breaks it, the whole file stops with a message
-- saying what to fix, and nothing changes. Run this read-only check first if you like:
--   select player_slug, count(*) from profiles where player_slug is not null group by 1 having count(*) > 1;
--   select claimed_by, count(*) from player_slots where claimed_by is not null group by 1 having count(*) > 1;
--   select tournament_id, profile_id, count(*) from tournament_players where profile_id is not null group by 1, 2 having count(*) > 1;
--
-- Not enforced here (see project_specs.md, "Profile identity foundation"): that every login account HAS a profile.
-- Signup creates both and removes the account if the profile can't be saved; accounts with no profile can be listed:
--   select u.id, u.email, u.created_at from auth.users u left join profiles p on p.id = u.id where p.id is null;
--
-- Prerequisite: schema.sql; platform_foundation.sql for the tournament_players rule (skipped if it isn't installed).
-- Safe to run more than once. Undo: see the bottom of this file.

begin;

comment on column public.profiles.id is 'The permanent profile_id: the golfer. Equals the owning login account''s auth.users id (one account, one profile).';
comment on column public.profiles.player_slug is 'Temporary legacy mapping to an old Maroon player slot (player_slots). Optional; never the person''s identity.';

do $$
begin
  if exists (select 1 from profiles where player_slug is not null group by player_slug having count(*) > 1) then
    raise exception 'A Maroon player slot is linked to more than one profile. Fix profiles.player_slug first (see the check query at the top of this file).';
  end if;
  if exists (select 1 from player_slots where claimed_by is not null group by claimed_by having count(*) > 1) then
    raise exception 'A profile has claimed more than one Maroon player slot. Fix player_slots.claimed_by first (see the check query at the top of this file).';
  end if;
  if to_regclass('public.tournament_players') is not null
     and exists (select 1 from tournament_players where profile_id is not null group by tournament_id, profile_id having count(*) > 1) then
    raise exception 'A profile is more than one player in the same tournament. Fix tournament_players.profile_id first (see the check query at the top of this file).';
  end if;
end $$;

create unique index if not exists profiles_player_slug_key on public.profiles (player_slug) where player_slug is not null;
create unique index if not exists player_slots_claimed_by_key on public.player_slots (claimed_by) where claimed_by is not null;

do $$
begin
  if to_regclass('public.tournament_players') is not null then
    create unique index if not exists tournament_players_tournament_profile_key on public.tournament_players (tournament_id, profile_id) where profile_id is not null;
  end if;
end $$;

commit;

-- Undo:
--   drop index if exists public.tournament_players_tournament_profile_key;
--   drop index if exists public.player_slots_claimed_by_key;
--   drop index if exists public.profiles_player_slug_key;
