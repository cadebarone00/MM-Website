-- supabase/golf_trip_games.sql
-- Golf trip → Games, saved to the trip (project_specs.md → "Golf trip → Games, saved to the trip"): the side games a
-- group plays in a round (Play a round's games: Wolf, Skins, Vegas, …) and each hole's extra pick, so everyone in the
-- game sees the same card on their own phone. Scores are NOT stored here: games are scored from the round's
-- scorecard (hole_score_entries) by the app, with Play's own rules.
--
--   golf_trip_games       one game in one trip round: type, options (net, birdies double, teams), players, started.
--   golf_trip_game_picks  one row per game per hole: that hole's pick (Wolf partner, Daytona spots, Bingo Bango
--                         Bongo, Vegas teams), as the app sends it.
--
-- Rules the database itself enforces:
--   * You must be an accepted member of the trip, and a player in every game you create.
--   * Every player must be in YOUR scoring group for that round. Before the round's groups exist, every player must
--     be an accepted member of the trip with an account.
--   * The player count fits the game (Wolf 4–5, Vegas 4, Daytona 5, Nines 3, …); team games need teams (0 / 1 per player).
--   * Only the game's players see it or make its picks. Teams only change before Start. Only the person who created a
--     game can remove it.
--   * Writes only go through the functions below, called by the server with the signed-in profile's id (service role).
--     RLS on: players can SELECT their games (for Realtime); nothing writes the tables directly.
--
-- Prerequisites: schema.sql (profiles), golf_trips.sql, golf_trip_flights.sql (golf_trip_member_id),
-- golf_trip_scoring.sql (scoring groups). Uses golf_trip_rounds.momentum_pars (golf_trip_momentum.sql) when it's there.
-- Safe to run more than once. Undo: see the bottom of this file.

begin;

create table if not exists public.golf_trip_games (
  id uuid primary key default gen_random_uuid(),
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  golf_trip_round_id uuid not null references public.golf_trip_rounds(id) on delete cascade,
  game_type text not null check (game_type in ('stroke', 'stableford', 'match', 'nassau', 'bestball', 'skins', 'wolf', 'vegas',
    'daytona', 'bbb', 'nines', 'sixes', 'snake', 'scramble', 'shamble', 'alternate', 'chapman')),
  net boolean not null default false,
  birdies_double boolean not null default false,
  -- Team 0 or 1 for each player, in player order (team games); null otherwise.
  teams smallint[] check (teams is null or teams <@ array[0, 1]::smallint[]),
  player_profile_ids uuid[] not null check (array_length(player_profile_ids, 1) between 2 and 5),
  started boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  -- Random id the phone sends with Create, so a double tap or a retry makes one game.
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, client_request_id),
  check (teams is null or array_length(teams, 1) = array_length(player_profile_ids, 1))
);
create index if not exists golf_trip_games_trip_idx on public.golf_trip_games (golf_trip_id);

create table if not exists public.golf_trip_game_picks (
  game_id uuid not null references public.golf_trip_games(id) on delete cascade,
  -- Copied from the game so Realtime can filter by trip.
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  pick jsonb not null check (jsonb_typeof(pick) = 'object' and octet_length(pick::text) <= 1000),
  updated_by uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (game_id, hole)
);

-- Allowed group sizes per game (the same as Play a round, lib/platform/roundGames.ts GAMES).
create or replace function public.trip_game_sizes(p_type text)
returns integer[]
language sql immutable set search_path = public as $$
  select case p_type
    when 'match' then array[2, 4] when 'nassau' then array[2, 4] when 'alternate' then array[2, 4] when 'chapman' then array[2, 4]
    when 'bestball' then array[4] when 'vegas' then array[4] when 'sixes' then array[4]
    when 'wolf' then array[4, 5] when 'daytona' then array[5] when 'nines' then array[3]
    else array[2, 3, 4, 5] end;
$$;
create or replace function public.trip_game_has_teams(p_type text)
returns boolean
language sql immutable set search_path = public as $$
  select p_type in ('match', 'nassau', 'bestball', 'vegas', 'scramble', 'shamble', 'alternate', 'chapman');
$$;

-- Is this profile one of the game's players?
create or replace function public.is_trip_game_player(p_game uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from golf_trip_games where id = p_game and p_profile = any(player_profile_ids));
$$;
revoke all on function public.is_trip_game_player(uuid, uuid) from public, anon;
grant execute on function public.is_trip_game_player(uuid, uuid) to authenticated, service_role;

alter table public.golf_trip_games enable row level security;
alter table public.golf_trip_game_picks enable row level security;
drop policy if exists golf_trip_games_select on public.golf_trip_games;
create policy golf_trip_games_select on public.golf_trip_games for select to authenticated using (auth.uid() = any(player_profile_ids));
drop policy if exists golf_trip_game_picks_select on public.golf_trip_game_picks;
create policy golf_trip_game_picks_select on public.golf_trip_game_picks for select to authenticated using (public.is_trip_game_player(game_id, auth.uid()));
revoke all on public.golf_trip_games, public.golf_trip_game_picks from anon, authenticated;
grant select on public.golf_trip_games, public.golf_trip_game_picks to authenticated;

-- Every game you're in on this trip, with its players' trip names, its picks and its round's pars (null if not set).
-- Null when you aren't on the trip.
create or replace function public.get_trip_games(p_profile uuid, p_trip uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if golf_trip_member_id(p_profile, p_trip) is null then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'roundNumber', r.round_number, 'gameType', g.game_type, 'net', g.net, 'birdiesDouble', g.birdies_double,
      'teams', to_jsonb(g.teams), 'started', g.started, 'mine', g.created_by = p_profile,
      'players', (select jsonb_agg(jsonb_build_object('profileId', pid,
          'displayName', coalesce((select m.display_name from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = pid), 'Player')) order by ord)
        from unnest(g.player_profile_ids) with ordinality as u(pid, ord)),
      'picks', coalesce((select jsonb_object_agg(k.hole::text, k.pick) from golf_trip_game_picks k where k.game_id = g.id), '{}'::jsonb),
      'pars', to_jsonb(r) -> 'momentum_pars') order by g.created_at)
    from golf_trip_games g join golf_trip_rounds r on r.id = g.golf_trip_round_id
    where g.golf_trip_id = p_trip and p_profile = any(g.player_profile_ids)), '[]'::jsonb);
end;
$$;

-- Create a game (p_game = {gameType, net, birdiesDouble, teams?, players: [profileId, …]}) in round p_round_number.
-- Returns get_trip_games. A repeat of the same p_request returns the games unchanged.
create or replace function public.create_trip_game(p_profile uuid, p_trip uuid, p_round_number integer, p_game jsonb, p_request uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round golf_trip_rounds;
  v_type text := p_game ->> 'gameType';
  v_players uuid[];
  v_teams smallint[];
  v_group uuid;
begin
  if golf_trip_member_id(p_profile, p_trip) is null then raise exception 'You''re not on this trip.'; end if;
  if exists (select 1 from golf_trip_games where created_by = p_profile and client_request_id = p_request) then return get_trip_games(p_profile, p_trip); end if;
  select * into v_round from golf_trip_rounds where golf_trip_id = p_trip and round_number = p_round_number;
  if v_round.id is null then raise exception 'That round isn''t on this trip.'; end if;
  if v_type is null or not (v_type = any(array['stroke', 'stableford', 'match', 'nassau', 'bestball', 'skins', 'wolf', 'vegas', 'daytona', 'bbb', 'nines', 'sixes', 'snake', 'scramble', 'shamble', 'alternate', 'chapman'])) then
    raise exception 'Pick a game.';
  end if;
  begin
    select array_agg(value::uuid order by ord) into v_players from jsonb_array_elements_text(p_game -> 'players') with ordinality as e(value, ord);
  exception when others then raise exception 'Those players aren''t on this trip.';
  end;
  if v_players is null or (select count(distinct x) from unnest(v_players) x) <> array_length(v_players, 1) then raise exception 'Pick each player once.'; end if;
  if not (array_length(v_players, 1) = any(trip_game_sizes(v_type))) then raise exception 'That game doesn''t fit % players.', array_length(v_players, 1); end if;
  if not (p_profile = any(v_players)) then raise exception 'You have to be in a game you start.'; end if;
  -- Your group only: the round's scoring group you're in; before groups exist, accepted trip members.
  if exists (select 1 from scoring_groups where golf_trip_round_id = v_round.id) then
    select gp.group_id into v_group from scoring_group_players gp join scoring_groups g on g.id = gp.group_id
      where g.golf_trip_round_id = v_round.id and gp.profile_id = p_profile;
    if v_group is null or exists (select 1 from unnest(v_players) x where not exists (select 1 from scoring_group_players where group_id = v_group and profile_id = x)) then
      raise exception 'Games are only with players in your group.';
    end if;
  elsif exists (select 1 from unnest(v_players) x where not exists (
      select 1 from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = x and m.invitation_status = 'accepted')) then
    raise exception 'Those players aren''t on this trip.';
  end if;
  -- The same game for the same players in the same round already exists (e.g. an organizer's game opened on two phones).
  if exists (select 1 from golf_trip_games g where g.golf_trip_round_id = v_round.id and g.game_type = v_type
      and (select array_agg(x order by x) from unnest(g.player_profile_ids) x) = (select array_agg(x order by x) from unnest(v_players) x)) then
    return get_trip_games(p_profile, p_trip);
  end if;
  if trip_game_has_teams(v_type) then
    select array_agg(value::smallint order by ord) into v_teams from jsonb_array_elements_text(coalesce(p_game -> 'teams', '[]'::jsonb)) with ordinality as e(value, ord);
    if v_teams is null then v_teams := (select array_agg((case when ord <= array_length(v_players, 1) / 2 then 0 else 1 end)::smallint order by ord) from generate_series(1, array_length(v_players, 1)) as ord); end if;
    if array_length(v_teams, 1) <> array_length(v_players, 1) or not (v_teams <@ array[0, 1]::smallint[]) then raise exception 'Put each player on a team.'; end if;
  end if;
  insert into golf_trip_games (golf_trip_id, golf_trip_round_id, game_type, net, birdies_double, teams, player_profile_ids, started, created_by, client_request_id)
  values (p_trip, v_round.id, v_type, coalesce((p_game ->> 'net')::boolean, false), coalesce((p_game ->> 'birdiesDouble')::boolean, false), v_teams, v_players,
    -- Games with nothing to pick before teeing off start right away (Vegas picks teams hole by hole).
    not trip_game_has_teams(v_type) or v_type = 'vegas', p_profile, p_request);
  return get_trip_games(p_profile, p_trip);
end;
$$;

-- Before Start: change the teams (p_patch.teams) and/or start the game (p_patch.started = true). Any player may.
create or replace function public.update_trip_game(p_profile uuid, p_game uuid, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_game golf_trip_games;
  v_teams smallint[];
begin
  select * into v_game from golf_trip_games where id = p_game for update;
  if v_game.id is null or not (p_profile = any(v_game.player_profile_ids)) then raise exception 'Game not found.'; end if;
  if p_patch ? 'teams' then
    if v_game.started then raise exception 'Teams are set once the game starts.'; end if;
    if not trip_game_has_teams(v_game.game_type) then raise exception 'This game has no teams.'; end if;
    select array_agg(value::smallint order by ord) into v_teams from jsonb_array_elements_text(p_patch -> 'teams') with ordinality as e(value, ord);
    if v_teams is null or array_length(v_teams, 1) <> array_length(v_game.player_profile_ids, 1) or not (v_teams <@ array[0, 1]::smallint[])
      or not (0 = any(v_teams)) or not (1 = any(v_teams)) then raise exception 'Put at least one player on each team.'; end if;
    update golf_trip_games set teams = v_teams, updated_at = now() where id = p_game;
  end if;
  if coalesce((p_patch ->> 'started')::boolean, false) then
    update golf_trip_games set started = true, updated_at = now() where id = p_game;
  end if;
  return get_trip_games(p_profile, v_game.golf_trip_id);
end;
$$;

-- Save (or clear, p_pick = null) a hole's pick. Only the game's players.
create or replace function public.save_trip_game_pick(p_profile uuid, p_game uuid, p_hole integer, p_pick jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_game golf_trip_games;
begin
  select * into v_game from golf_trip_games where id = p_game;
  if v_game.id is null or not (p_profile = any(v_game.player_profile_ids)) then raise exception 'Game not found.'; end if;
  if p_hole is null or p_hole < 1 or p_hole > 18 then raise exception 'Pick a hole from 1 to 18.'; end if;
  if p_pick is null or p_pick = '{}'::jsonb then
    delete from golf_trip_game_picks where game_id = p_game and hole = p_hole;
  else
    if jsonb_typeof(p_pick) <> 'object' or octet_length(p_pick::text) > 1000 then raise exception 'That pick couldn''t be saved.'; end if;
    insert into golf_trip_game_picks (game_id, golf_trip_id, hole, pick, updated_by) values (p_game, v_game.golf_trip_id, p_hole, p_pick, p_profile)
    on conflict (game_id, hole) do update set pick = excluded.pick, updated_by = excluded.updated_by, updated_at = now();
  end if;
  return get_trip_games(p_profile, v_game.golf_trip_id);
end;
$$;

-- Remove a game (and its picks). Only the person who created it.
create or replace function public.delete_trip_game(p_profile uuid, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_game golf_trip_games;
begin
  select * into v_game from golf_trip_games where id = p_game;
  if v_game.id is null or not (p_profile = any(v_game.player_profile_ids)) then raise exception 'Game not found.'; end if;
  if v_game.created_by <> p_profile then raise exception 'Only the person who started this game can remove it.'; end if;
  delete from golf_trip_games where id = p_game;
  return get_trip_games(p_profile, v_game.golf_trip_id);
end;
$$;

revoke all on function public.get_trip_games(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_trip_game(uuid, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.update_trip_game(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_trip_game_pick(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.delete_trip_game(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_trip_games(uuid, uuid) to service_role;
grant execute on function public.create_trip_game(uuid, uuid, integer, jsonb, uuid) to service_role;
grant execute on function public.update_trip_game(uuid, uuid, jsonb) to service_role;
grant execute on function public.save_trip_game_pick(uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.delete_trip_game(uuid, uuid) to service_role;

-- Live updates: phones hear "something changed" and reload through the server.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'golf_trip_games') then
      alter publication supabase_realtime add table public.golf_trip_games;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'golf_trip_game_picks') then
      alter publication supabase_realtime add table public.golf_trip_game_picks;
    end if;
  end if;
end $$;

commit;

-- Undo (deletes every saved game and pick):
--   drop function if exists public.delete_trip_game(uuid, uuid), public.save_trip_game_pick(uuid, uuid, integer, jsonb),
--     public.update_trip_game(uuid, uuid, jsonb), public.create_trip_game(uuid, uuid, integer, jsonb, uuid),
--     public.get_trip_games(uuid, uuid), public.is_trip_game_player(uuid, uuid), public.trip_game_has_teams(text), public.trip_game_sizes(text);
--   drop table if exists public.golf_trip_game_picks, public.golf_trip_games;
