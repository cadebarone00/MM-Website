-- supabase/golf_trip_scoring.sql
-- Player & Attest scoring, Step 2 (project_specs.md → "Add-on: Player & Attest"): who plays together in a round, who
-- attests whom, and every hole score as it is typed in, by the golfer AND by their attester, independently.
--
--   scoring_groups         one playing group in one round (a trip round now; tournament / personal rounds later).
--   scoring_group_players  the golfers in a group, in playing order, each with the ONE golfer who attests them.
--   hole_score_entries     one row per (golfer being scored, golfer who typed it, hole). The golfer's own row has
--                          strokes + stats; their attester's row has strokes only. Two rows, never one shared value,
--                          so nobody can overwrite anyone else's entry.
--
-- Rules the database itself enforces:
--   * Profiles are permanent ids (profiles.id). A player is in a group once; an attester must be in the same group
--     (composite foreign key) and can't be themselves.
--   * Writes only go through the functions below, called by the server with the signed-in profile's id (service role):
--     save_trip_scoring_groups and save_hole_scores. Nothing writes the tables directly (RLS on, no write policies).
--   * You may write your own entries, or strokes for the ONE golfer you attest. Nothing else.
--   * Assignments are fixed once scoring starts: the first hole entry stamps assignments_locked_at, and after that
--     save_trip_scoring_groups never replaces the groups (it returns them unchanged).
--   * Trip / tournament groups always have attesters (every golfer attests exactly one and is attested by exactly
--     one); only a solo personal round has none.
--
-- Ready for later steps: realtime (members can SELECT through RLS, so Supabase Realtime can stream changes),
-- offline scoring (client_updated_at: an older phone write never replaces a newer one; version counts changes),
-- submission locking (scoring_group_players.submitted_at: no more entries for a submitted golfer), organizer
-- overrides (entries keep who typed them; overrides will be their own rows).
--
-- Live round data: deleting the trip deletes its groups and entries. A golfer's finished round lives on in
-- player_rounds (player_rounds.sql), which never cascades from a trip.
--
-- Prerequisites: schema.sql (profiles), golf_trips.sql, golf_trip_flights.sql (golf_trip_member_id). Safe to run
-- more than once. Undo: see the bottom of this file.

begin;

create table if not exists public.scoring_groups (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('trip', 'tournament', 'personal')),
  golf_trip_id uuid references public.golf_trips(id) on delete cascade,
  golf_trip_round_id uuid references public.golf_trip_rounds(id) on delete cascade,
  group_number integer not null check (group_number between 1 and 50),
  created_by uuid not null references public.profiles(id),
  -- Stamped by the first hole entry; from then on the group and its attesters never change.
  assignments_locked_at timestamptz,
  created_at timestamptz not null default now(),
  -- A trip group belongs to one trip round; other kinds don't point at a trip.
  check ((source = 'trip') = (golf_trip_id is not null and golf_trip_round_id is not null)),
  unique (golf_trip_round_id, group_number)
);
create index if not exists scoring_groups_trip_idx on public.scoring_groups (golf_trip_id);

create table if not exists public.scoring_group_players (
  group_id uuid not null references public.scoring_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  play_order integer not null check (play_order between 1 and 50),
  side text check (side in ('left', 'right')),
  attester_profile_id uuid,
  -- Submission locking (later): set when the golfer submits; no more entries for them after it.
  submitted_at timestamptz,
  primary key (group_id, profile_id),
  unique (group_id, play_order),
  check (attester_profile_id is null or attester_profile_id <> profile_id),
  -- The attester is a player in the same group.
  foreign key (group_id, attester_profile_id) references public.scoring_group_players(group_id, profile_id) deferrable initially deferred
);
create index if not exists scoring_group_players_profile_idx on public.scoring_group_players (profile_id);

create table if not exists public.hole_score_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  scored_profile_id uuid not null,
  entered_by_profile_id uuid not null,
  hole integer not null check (hole between 1 and 18),
  strokes integer check (strokes between 1 and 20),
  putts integer check (putts between 0 and 10),
  fairway text check (fairway in ('up', 'left', 'center', 'right', 'down')),
  green text check (green in ('up', 'left', 'center', 'right', 'down')),
  penalty_fairway boolean not null default false,
  penalty_green boolean not null default false,
  -- When the phone made the change (offline-safe: an older write never replaces a newer one).
  client_updated_at timestamptz not null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, scored_profile_id, entered_by_profile_id, hole),
  foreign key (group_id, scored_profile_id) references public.scoring_group_players(group_id, profile_id) on delete cascade,
  foreign key (group_id, entered_by_profile_id) references public.scoring_group_players(group_id, profile_id) on delete cascade,
  -- An attester's entry is strokes only; stats belong to the golfer's own entry.
  check (entered_by_profile_id = scored_profile_id
    or (putts is null and fairway is null and green is null and not penalty_fairway and not penalty_green))
);
create index if not exists hole_score_entries_scored_idx on public.hole_score_entries (group_id, scored_profile_id);

-- Is this profile playing in this group? security definer so the policies below don't recurse through RLS.
create or replace function public.is_scoring_group_player(p_group uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from scoring_group_players where group_id = p_group and profile_id = p_profile);
$$;

-- Can this profile see this group? Trip groups: anyone on the trip (leaderboards). Other groups: the players in it.
create or replace function public.can_see_scoring_group(p_group uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from scoring_groups g
    where g.id = p_group and (
      (g.golf_trip_id is not null and is_golf_trip_member(g.golf_trip_id, p_profile))
      or is_scoring_group_player(g.id, p_profile)));
$$;
revoke all on function public.is_scoring_group_player(uuid, uuid) from public, anon;
revoke all on function public.can_see_scoring_group(uuid, uuid) from public, anon;
grant execute on function public.is_scoring_group_player(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_see_scoring_group(uuid, uuid) to authenticated, service_role;

alter table public.scoring_groups enable row level security;
alter table public.scoring_group_players enable row level security;
alter table public.hole_score_entries enable row level security;

-- Read-only (for Realtime later); no insert / update / delete policies: writes go through the functions below.
drop policy if exists scoring_groups_select on public.scoring_groups;
create policy scoring_groups_select on public.scoring_groups for select to authenticated using (public.can_see_scoring_group(id, auth.uid()));
drop policy if exists scoring_group_players_select on public.scoring_group_players;
create policy scoring_group_players_select on public.scoring_group_players for select to authenticated using (public.can_see_scoring_group(group_id, auth.uid()));
drop policy if exists hole_score_entries_select on public.hole_score_entries;
create policy hole_score_entries_select on public.hole_score_entries for select to authenticated using (public.can_see_scoring_group(group_id, auth.uid()));

revoke all on public.scoring_groups, public.scoring_group_players, public.hole_score_entries from anon, authenticated;
grant select on public.scoring_groups, public.scoring_group_players, public.hole_score_entries to authenticated;

-- One trip round's groups, players (with trip display names) and every hole entry, as lib/platform/tripScoring.ts
-- reads it. Null when the trip / round doesn't exist or the profile isn't on the trip.
create or replace function public.get_trip_round_scoring(p_profile uuid, p_trip uuid, p_round_number integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_round golf_trip_rounds;
begin
  if golf_trip_member_id(p_profile, p_trip) is null then return null; end if;
  select * into v_round from golf_trip_rounds where golf_trip_id = p_trip and round_number = p_round_number;
  if v_round.id is null then return null; end if;
  return jsonb_build_object(
    'roundId', v_round.id, 'roundNumber', v_round.round_number,
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'groupNumber', g.group_number, 'lockedAt', g.assignments_locked_at,
        'players', (select jsonb_agg(jsonb_build_object(
            'profileId', p.profile_id, 'playOrder', p.play_order, 'side', p.side, 'attesterProfileId', p.attester_profile_id,
            'submittedAt', p.submitted_at,
            'displayName', coalesce((select m.display_name from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = p.profile_id), 'Player'))
          order by p.play_order) from scoring_group_players p where p.group_id = g.id))
      order by g.group_number) from scoring_groups g where g.golf_trip_round_id = v_round.id), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
        'scoredProfileId', e.scored_profile_id, 'enteredByProfileId', e.entered_by_profile_id, 'hole', e.hole, 'strokes', e.strokes,
        'putts', e.putts, 'fairway', e.fairway, 'green', e.green, 'penaltyFairway', e.penalty_fairway, 'penaltyGreen', e.penalty_green,
        'clientUpdatedAt', e.client_updated_at, 'version', e.version) order by e.scored_profile_id, e.entered_by_profile_id, e.hole)
      from hole_score_entries e join scoring_groups g on g.id = e.group_id where g.golf_trip_round_id = v_round.id), '[]'::jsonb));
end;
$$;

-- Save a trip round's playing groups (p_groups = [{players: [{profileId, attesterProfileId, side}]}] in playing order,
-- built by lib/platform/tripScoring.ts). Any member may save them (the first to open scoring does), but:
--   * every player is an accepted member of this trip with an account, in one group only;
--   * each group has 2+ players; every attester is in the same group, never themselves; everyone attests exactly one;
--   * once any group of this round has a hole entry, nothing changes (the saved groups are returned as they are).
-- Unlocked groups are replaced only if they differ. Returns get_trip_round_scoring.
create or replace function public.save_trip_scoring_groups(p_profile uuid, p_trip uuid, p_round_number integer, p_groups jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round golf_trip_rounds;
  v_group jsonb;
  v_player jsonb;
  v_group_id uuid;
  v_number integer := 0;
  v_order integer;
  v_all uuid[] := '{}';
  v_ids uuid[];
  v_attesters uuid[];
begin
  if golf_trip_member_id(p_profile, p_trip) is null then raise exception 'Trip not found.' using errcode = 'P0002'; end if;
  -- Serialize: two phones opening scoring at once save the groups once.
  select * into v_round from golf_trip_rounds where golf_trip_id = p_trip and round_number = p_round_number for update;
  if v_round.id is null then raise exception 'Round not found.' using errcode = 'P0002'; end if;

  if exists (select 1 from scoring_groups where golf_trip_round_id = v_round.id and assignments_locked_at is not null) then
    return get_trip_round_scoring(p_profile, p_trip, p_round_number);
  end if;

  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'A round needs at least one group.' using errcode = '22023';
  end if;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(v_group->'players') <> 'array' or jsonb_array_length(v_group->'players') < 2 then
      raise exception 'Every trip group needs at least 2 players.' using errcode = '22023';
    end if;
    select array_agg((p->>'profileId')::uuid), array_agg((p->>'attesterProfileId')::uuid)
      into v_ids, v_attesters from jsonb_array_elements(v_group->'players') p;
    if exists (select 1 from unnest(v_ids) id where not exists (
        select 1 from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = id and m.invitation_status = 'accepted')) then
      raise exception 'Every player must be on this trip.' using errcode = '22023';
    end if;
    if (v_all && v_ids) or (select count(distinct id) from unnest(v_ids) id) <> array_length(v_ids, 1) then
      raise exception 'A player can only be in one group.' using errcode = '22023';
    end if;
    v_all := v_all || v_ids;
    -- Everyone attests exactly one other player in the group and is attested by exactly one.
    if exists (select 1 from unnest(v_attesters) a where a is null or not (a = any(v_ids)))
       or exists (select 1 from jsonb_array_elements(v_group->'players') p where p->>'attesterProfileId' = p->>'profileId')
       or (select count(distinct a) from unnest(v_attesters) a) <> array_length(v_ids, 1) then
      raise exception 'Every player attests exactly one other player in their group.' using errcode = '22023';
    end if;
  end loop;

  -- Nothing to do when the saved groups already match.
  if (select coalesce(jsonb_agg(players order by group_number), '[]'::jsonb) from (
        select g.group_number, jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'attesterProfileId', p.attester_profile_id, 'side', p.side) order by p.play_order) players
        from scoring_groups g join scoring_group_players p on p.group_id = g.id where g.golf_trip_round_id = v_round.id group by g.group_number) s)
     = (select jsonb_agg(g.value->'players' order by g.n) from jsonb_array_elements(p_groups) with ordinality g(value, n)) then
    return get_trip_round_scoring(p_profile, p_trip, p_round_number);
  end if;

  delete from scoring_groups where golf_trip_round_id = v_round.id;
  for v_group in select g.value from jsonb_array_elements(p_groups) with ordinality g(value, n) order by g.n loop
    v_number := v_number + 1;
    insert into scoring_groups (source, golf_trip_id, golf_trip_round_id, group_number, created_by)
    values ('trip', p_trip, v_round.id, v_number, p_profile) returning id into v_group_id;
    v_order := 0;
    for v_player in select p.value from jsonb_array_elements(v_group->'players') with ordinality p(value, n) order by p.n loop
      v_order := v_order + 1;
      insert into scoring_group_players (group_id, profile_id, play_order, side, attester_profile_id)
      values (v_group_id, (v_player->>'profileId')::uuid, v_order, nullif(v_player->>'side', ''), (v_player->>'attesterProfileId')::uuid);
    end loop;
  end loop;
  return get_trip_round_scoring(p_profile, p_trip, p_round_number);
end;
$$;

-- Save hole entries typed by p_profile for p_scored in p_group (p_entries = [{hole, strokes, putts, fairway, green,
-- penaltyFairway, penaltyGreen}], checked by lib/platform/tripScoring.ts and again here).
--   * p_profile = p_scored: your own card (strokes + stats).
--   * p_profile = p_scored's attester: strokes only.
--   * anyone else: refused. A submitted golfer takes no more entries.
-- Each entry only replaces the same typist's row for that hole, and only when it is newer (p_client_updated_at).
-- The first entry locks the group's attesters. Returns get_trip_round_scoring for the group's round.
create or replace function public.save_hole_scores(p_profile uuid, p_group uuid, p_scored uuid, p_client_updated_at timestamptz, p_entries jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_group scoring_groups;
  v_scored scoring_group_players;
  v_own boolean;
  v_entry jsonb;
  v_round_number integer;
begin
  select * into v_group from scoring_groups where id = p_group for update;
  if v_group.id is null or not is_scoring_group_player(p_group, p_profile) then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;
  select * into v_scored from scoring_group_players where group_id = p_group and profile_id = p_scored;
  if v_scored.profile_id is null then raise exception 'That golfer isn''t in your group.' using errcode = '42501'; end if;
  v_own := p_profile = p_scored;
  if not v_own and v_scored.attester_profile_id is distinct from p_profile then
    raise exception 'You can only score yourself and the golfer you attest.' using errcode = '42501';
  end if;
  if v_scored.submitted_at is not null then raise exception 'That card is already submitted.' using errcode = '42501'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 18 then
    raise exception 'Send 1 to 18 holes.' using errcode = '22023';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if not v_own and (v_entry->>'putts' is not null or v_entry->>'fairway' is not null or v_entry->>'green' is not null
                      or coalesce((v_entry->>'penaltyFairway')::boolean, false) or coalesce((v_entry->>'penaltyGreen')::boolean, false)) then
      raise exception 'An attester enters strokes only.' using errcode = '22023';
    end if;
    insert into hole_score_entries (group_id, scored_profile_id, entered_by_profile_id, hole, strokes, putts, fairway, green,
      penalty_fairway, penalty_green, client_updated_at)
    values (p_group, p_scored, p_profile, (v_entry->>'hole')::integer, (v_entry->>'strokes')::integer, (v_entry->>'putts')::integer,
      v_entry->>'fairway', v_entry->>'green', coalesce((v_entry->>'penaltyFairway')::boolean, false),
      coalesce((v_entry->>'penaltyGreen')::boolean, false), p_client_updated_at)
    on conflict (group_id, scored_profile_id, entered_by_profile_id, hole) do update set
      strokes = excluded.strokes, putts = excluded.putts, fairway = excluded.fairway, green = excluded.green,
      penalty_fairway = excluded.penalty_fairway, penalty_green = excluded.penalty_green,
      client_updated_at = excluded.client_updated_at, version = hole_score_entries.version + 1, updated_at = now()
    where hole_score_entries.client_updated_at <= excluded.client_updated_at;
  end loop;

  update scoring_groups set assignments_locked_at = coalesce(assignments_locked_at, now()) where id = p_group;
  select r.round_number into v_round_number from golf_trip_rounds r where r.id = v_group.golf_trip_round_id;
  return get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number);
end;
$$;

revoke all on function public.get_trip_round_scoring(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.save_trip_scoring_groups(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.save_hole_scores(uuid, uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.get_trip_round_scoring(uuid, uuid, integer) to service_role;
grant execute on function public.save_trip_scoring_groups(uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.save_hole_scores(uuid, uuid, uuid, timestamptz, jsonb) to service_role;

commit;

-- Undo (deletes every saved group and hole entry):
--   drop function if exists public.save_hole_scores(uuid, uuid, uuid, timestamptz, jsonb),
--     public.save_trip_scoring_groups(uuid, uuid, integer, jsonb), public.get_trip_round_scoring(uuid, uuid, integer),
--     public.can_see_scoring_group(uuid, uuid), public.is_scoring_group_player(uuid, uuid);
--   drop table if exists public.hole_score_entries, public.scoring_group_players, public.scoring_groups;
