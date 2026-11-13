-- supabase/leagues.sql
-- Leagues (project_specs.md, "Feature: Leagues"). One round, one course, one day: an organizer creates a league and
-- gets a short code; players type the code (or open a shared link) to join. The players play in tee-time groups; one
-- scorer per group keeps the whole group's card. Everyone in the league reads the same leaderboard, league-wide skins
-- and the random 2-person pairs game; each group can also play its own game (lib/platform/roundGames.ts).
--
-- course = { ref, name, place, par[18], strokeIndex[18] | null, tee: { name, rating, slope } | null }
-- skins  = { on, net, carryover }
-- pairs  = { on, format, net, segments, rule, locked, teams: [[profileId, …], …] }
--
-- Access: nobody reads or writes the tables directly (RLS on, no policies). The server calls the functions below with
-- the signed-in user's id, using the service-role key (lib/platform/leaguesServer.ts):
--   - anyone signed in can look a league up by its code and join it while it's live
--   - only the organizer and the league's players read the whole league
--   - only the organizer changes settings, tee times, scorers and pairs, ends, copies or deletes the league
--   - a group's scorer (or the organizer) enters that group's strokes and picks its game, until the group's card is submitted
--
-- Prerequisite: schema.sql (profiles). Safe to run more than once.
-- Undo: drop table public.league_holes, public.league_groups, public.league_players, public.leagues cascade;

begin;

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  organizer uuid not null references public.profiles(id) on delete cascade,
  course jsonb not null,
  round_date date not null,
  scoring text not null default 'Gross' check (scoring in ('Gross', 'Net')),
  skins jsonb not null default '{"on": true, "net": false, "carryover": true}',
  pairs jsonb not null default '{"on": false, "format": "bestball", "net": false, "segments": 18, "rule": "random", "locked": false, "teams": []}',
  status text not null default 'live' check (status in ('live', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.league_players (
  league_id uuid not null references public.leagues(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  handicap numeric(4, 1) check (handicap between -10 and 54),
  joined_at timestamptz not null default now(),
  primary key (league_id, profile_id)
);

create table if not exists public.league_groups (
  league_id uuid not null references public.leagues(id) on delete cascade,
  number integer not null check (number between 1 and 60),
  tee_time text not null default '' check (tee_time ~ '^(([01][0-9]|2[0-3]):[0-5][0-9])?$'),
  start_hole integer not null default 1 check (start_hole between 1 and 18),
  scorer uuid,
  players uuid[] not null check (cardinality(players) between 1 and 5),
  game jsonb,
  inputs jsonb not null default '[]',
  submitted_at timestamptz,
  primary key (league_id, number)
);

create table if not exists public.league_holes (
  league_id uuid not null,
  profile_id uuid not null,
  hole integer not null check (hole between 1 and 18),
  strokes integer not null check (strokes between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (league_id, profile_id, hole),
  foreign key (league_id, profile_id) references public.league_players(league_id, profile_id) on delete cascade
);

alter table public.leagues enable row level security;
alter table public.league_players enable row level security;
alter table public.league_groups enable row level security;
alter table public.league_holes enable row level security;
revoke all on public.leagues, public.league_players, public.league_groups, public.league_holes from anon, authenticated;

-- A code as typed ("lg7-k2q ") → as stored ("LG7K2Q").
create or replace function public.league_clean_code(p_code text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.league_is_member(p_profile uuid, p_league uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from leagues where id = p_league and organizer = p_profile)
      or exists (select 1 from league_players where league_id = p_league and profile_id = p_profile);
$$;

-- The course must have an 18-hole scorecard (pars 3–6): skins and the pairs segments are played over 18 holes.
create or replace function public.league_check_course(p_course jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare v_par jsonb := p_course -> 'par';
begin
  if jsonb_typeof(p_course) <> 'object' or jsonb_typeof(p_course -> 'name') <> 'string' or jsonb_typeof(v_par) <> 'array' or jsonb_array_length(v_par) <> 18 then
    raise exception 'A league needs a course with an 18-hole scorecard.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_par) p where jsonb_typeof(p) <> 'number' or (p #>> '{}')::integer not between 3 and 6) then
    raise exception 'Each hole''s par must be 3 to 6.' using errcode = '22023';
  end if;
end $$;

-- A new 6-character code with no look-alikes (no 0 / O, 1 / I / L); try again on the rare clash.
create or replace function public.league_new_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  v_code text;
  v_letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  loop
    v_code := (select string_agg(substr(v_letters, 1 + floor(random() * length(v_letters))::integer, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from leagues where code = v_code);
  end loop;
  return v_code;
end $$;

-- The organizer creates the league (and plays in it unless p_plays is false). Returns { id, code }.
create or replace function public.create_league(p_organizer uuid, p_name text, p_course jsonb, p_date date, p_scoring text, p_plays boolean, p_handicap numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Give the league a name (up to 60 characters).' using errcode = '22023'; end if;
  if p_scoring not in ('Gross', 'Net') then raise exception 'Pick Gross or Net.' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Pick the league''s date.' using errcode = '22023'; end if;
  perform league_check_course(p_course);
  v_code := league_new_code();
  insert into leagues (code, name, organizer, course, round_date, scoring) values (v_code, btrim(p_name), p_organizer, p_course, p_date, p_scoring)
  returning id into v_id;
  if coalesce(p_plays, true) then insert into league_players (league_id, profile_id, handicap) values (v_id, p_organizer, p_handicap); end if;
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

-- Look a league up by its code, before joining. Null = no such code.
create or replace function public.find_league(p_profile uuid, p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'name', l.name, 'status', l.status, 'scoring', l.scoring, 'organizerName', o.display_name,
    'course', l.course ->> 'name', 'date', l.round_date, 'member', league_is_member(p_profile, l.id),
    'playerCount', (select count(*) from league_players p where p.league_id = l.id))
  from leagues l join profiles o on o.id = l.organizer
  where l.code = league_clean_code(p_code);
$$;

-- Join with the code and my handicap index. Joining again just updates the handicap. Returns the league's id.
create or replace function public.join_league(p_profile uuid, p_code text, p_handicap numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text;
begin
  select id, status into v_id, v_status from leagues where code = league_clean_code(p_code);
  if v_id is null then raise exception 'No league has that code. Check it and try again.' using errcode = '22023'; end if;
  if v_status <> 'live' then raise exception 'This league has ended.' using errcode = '22023'; end if;
  if (select count(*) from league_players where league_id = v_id) >= 200 then raise exception 'This league is full (200 players).' using errcode = '22023'; end if;
  insert into league_players (league_id, profile_id, handicap) values (v_id, p_profile, p_handicap)
  on conflict (league_id, profile_id) do update set handicap = coalesce(excluded.handicap, league_players.handicap);
  return v_id;
end $$;

-- The whole league for the organizer or a player (the League shape in lib/platform/leagues.ts). Null for anyone else.
create or replace function public.get_league(p_profile uuid, p_league uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not league_is_member(p_profile, l.id) then null else jsonb_build_object(
    'id', l.id, 'code', l.code, 'name', l.name, 'organizer', l.organizer, 'date', l.round_date, 'status', l.status,
    'course', l.course, 'scoring', l.scoring, 'skins', l.skins, 'pairs', l.pairs,
    'players', (select coalesce(jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'name', pr.display_name, 'handicap', p.handicap) order by p.joined_at), '[]'::jsonb)
                from league_players p join profiles pr on pr.id = p.profile_id where p.league_id = l.id),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('number', g.number, 'time', g.tee_time, 'hole', g.start_hole, 'scorer', g.scorer,
                 'players', to_jsonb(g.players), 'game', g.game, 'inputs', g.inputs, 'submitted', g.submitted_at is not null) order by g.number), '[]'::jsonb)
               from league_groups g where g.league_id = l.id),
    'holes', (select coalesce(jsonb_agg(jsonb_build_object('profileId', h.profile_id, 'hole', h.hole, 'strokes', h.strokes)), '[]'::jsonb)
              from league_holes h where h.league_id = l.id))
  end
  from leagues l where l.id = p_league;
$$;

-- Leagues I organize or play in, newest first (the Leagues tab).
create or replace function public.list_my_leagues(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'status', l.status, 'date', l.round_date, 'course', l.course ->> 'name',
    'playerCount', (select count(*) from league_players p where p.league_id = l.id)) order by l.round_date desc, l.created_at desc), '[]'::jsonb)
  from leagues l where league_is_member(p_profile, l.id);
$$;

create or replace function public.league_check_organizer(p_organizer uuid, p_league uuid, p_live boolean)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from leagues where id = p_league and organizer = p_organizer) then raise exception 'Only the organizer can change the league.' using errcode = '42501'; end if;
  if p_live and not exists (select 1 from leagues where id = p_league and status = 'live') then raise exception 'This league has ended.' using errcode = '22023'; end if;
end $$;

-- The organizer's settings: Gross / Net, skins and the pairs game (with its drawn teams). Every team is 1–3 of the
-- league's players, nobody twice; once scores are in, the drawn pairs can't change.
create or replace function public.set_league_settings(p_organizer uuid, p_league uuid, p_scoring text, p_skins jsonb, p_pairs jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_ids text[];
begin
  perform league_check_organizer(p_organizer, p_league, true);
  if p_scoring not in ('Gross', 'Net') then raise exception 'Pick Gross or Net.' using errcode = '22023'; end if;
  if jsonb_typeof(p_skins -> 'on') <> 'boolean' or jsonb_typeof(p_skins -> 'net') <> 'boolean' or jsonb_typeof(p_skins -> 'carryover') <> 'boolean' then
    raise exception 'Those skins settings aren''t valid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_pairs -> 'on') <> 'boolean' or jsonb_typeof(p_pairs -> 'net') <> 'boolean' or jsonb_typeof(p_pairs -> 'locked') <> 'boolean'
     or coalesce(p_pairs ->> 'format', '') not in ('bestball', 'combined', 'stableford-bestball', 'stableford-combined')
     or coalesce(p_pairs ->> 'rule', '') not in ('random', 'balanced', 'split-groups', 'keep-groups')
     or coalesce(p_pairs ->> 'segments', '') not in ('6', '9', '18') or jsonb_typeof(p_pairs -> 'teams') <> 'array' then
    raise exception 'Those pairs settings aren''t valid.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pairs -> 'teams') t where jsonb_typeof(t) <> 'array' or jsonb_array_length(t) not between 1 and 3) then
    raise exception 'Each pair has 1 to 3 players.' using errcode = '22023';
  end if;
  select array_agg(id) into v_ids from (select jsonb_array_elements_text(t) id from jsonb_array_elements(p_pairs -> 'teams') t) x;
  if v_ids is not null and (cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x)
     or exists (select 1 from unnest(v_ids) x where not exists (select 1 from league_players p where p.league_id = p_league and p.profile_id::text = x))) then
    raise exception 'Every pair must be the league''s own players, each in one pair.' using errcode = '22023';
  end if;
  select pairs into v_old from leagues where id = p_league;
  if (v_old -> 'teams') is distinct from (p_pairs -> 'teams') and exists (select 1 from league_holes where league_id = p_league) and coalesce((v_old ->> 'locked')::boolean, false) then
    raise exception 'The pairs can''t change once scores are in.' using errcode = '22023';
  end if;
  update leagues set scoring = p_scoring, skins = jsonb_build_object('on', p_skins -> 'on', 'net', p_skins -> 'net', 'carryover', p_skins -> 'carryover'),
    pairs = jsonb_build_object('on', p_pairs -> 'on', 'format', p_pairs -> 'format', 'net', p_pairs -> 'net', 'segments', (p_pairs ->> 'segments')::integer,
      'rule', p_pairs -> 'rule', 'locked', p_pairs -> 'locked', 'teams', p_pairs -> 'teams')
  where id = p_league;
end $$;

-- The organizer sets the tee times: [{ time "HH:MM" | "", hole, scorer, players [ids] }], in order. Each group is 1–5 of
-- the league's players, nobody in two groups; the scorer is one of the group. A group whose players change starts its
-- own game over (its teams are by position). Groups past the new last one are removed.
create or replace function public.set_league_groups(p_organizer uuid, p_league uuid, p_groups jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_group jsonb; v_number integer := 0; v_players uuid[]; v_scorer uuid; v_all uuid[] := '{}';
begin
  perform league_check_organizer(p_organizer, p_league, true);
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 60 then raise exception 'A league has up to 60 groups.' using errcode = '22023'; end if;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    v_number := v_number + 1;
    if jsonb_typeof(v_group -> 'players') <> 'array' then raise exception 'Each group needs its players.' using errcode = '22023'; end if;
    select array_agg(x::uuid) into v_players from jsonb_array_elements_text(v_group -> 'players') x;
    if coalesce(cardinality(v_players), 0) not between 1 and 5 then raise exception 'Each group has 1 to 5 players.' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_players) x where not exists (select 1 from league_players p where p.league_id = p_league and p.profile_id = x)) then
      raise exception 'Groups can only have the league''s own players.' using errcode = '22023';
    end if;
    if v_all && v_players or cardinality(v_players) <> (select count(distinct x) from unnest(v_players) x) then raise exception 'A player can only be in one group.' using errcode = '22023'; end if;
    v_all := v_all || v_players;
    v_scorer := nullif(v_group ->> 'scorer', '')::uuid;
    if v_scorer is null or not v_scorer = any(v_players) then v_scorer := v_players[1]; end if;
    insert into league_groups (league_id, number, tee_time, start_hole, scorer, players)
    values (p_league, v_number, coalesce(v_group ->> 'time', ''), coalesce((v_group ->> 'hole')::integer, 1), v_scorer, v_players)
    on conflict (league_id, number) do update set tee_time = excluded.tee_time, start_hole = excluded.start_hole, scorer = excluded.scorer, players = excluded.players,
      game = case when league_groups.players = excluded.players then league_groups.game end,
      inputs = case when league_groups.players = excluded.players then league_groups.inputs else '[]'::jsonb end;
  end loop;
  delete from league_groups where league_id = p_league and number > v_number;
end $$;

-- Who may keep a player's card: the scorer of the player's group (until the group's card is submitted), or the organizer.
create or replace function public.league_check_scorer(p_profile uuid, p_league uuid, p_player uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_scorer uuid; v_submitted timestamptz;
begin
  if not exists (select 1 from leagues where id = p_league and status = 'live') then raise exception 'This league has ended.' using errcode = '22023'; end if;
  if not exists (select 1 from league_players where league_id = p_league and profile_id = p_player) then raise exception 'That player isn''t in this league.' using errcode = '22023'; end if;
  -- A player in no group yet has no scorer: only the organizer can keep their card.
  select scorer, submitted_at into v_scorer, v_submitted from league_groups where league_id = p_league and p_player = any(players);
  if v_submitted is not null then raise exception 'This group''s card has been submitted.' using errcode = '22023'; end if;
  if not (exists (select 1 from leagues where id = p_league and organizer = p_profile) or coalesce(v_scorer = p_profile, false)) then
    raise exception 'Only your group''s scorer can enter these scores.' using errcode = '42501';
  end if;
end $$;

-- One player's strokes on one hole (null clears it).
create or replace function public.set_league_strokes(p_profile uuid, p_league uuid, p_player uuid, p_hole integer, p_strokes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform league_check_scorer(p_profile, p_league, p_player);
  if p_hole not between 1 and 18 then raise exception 'That hole isn''t on the card.' using errcode = '22023'; end if;
  if p_strokes is null then
    delete from league_holes where league_id = p_league and profile_id = p_player and hole = p_hole;
  else
    insert into league_holes (league_id, profile_id, hole, strokes) values (p_league, p_player, p_hole, p_strokes)
    on conflict (league_id, profile_id, hole) do update set strokes = excluded.strokes, updated_at = now();
  end if;
end $$;

-- The group's own game (Play a round's GameConfig, or null for none) and its per-hole picks (up to 18).
create or replace function public.set_league_group_game(p_profile uuid, p_league uuid, p_group integer, p_game jsonb, p_inputs jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_first uuid;
begin
  select players[1] into v_first from league_groups where league_id = p_league and number = p_group;
  if v_first is null then raise exception 'That group isn''t in this league.' using errcode = '22023'; end if;
  perform league_check_scorer(p_profile, p_league, v_first);
  if p_game is not null and (jsonb_typeof(p_game) <> 'object' or jsonb_typeof(p_game -> 'id') <> 'string') then raise exception 'That game isn''t valid.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_inputs, '[]')) <> 'array' or jsonb_array_length(coalesce(p_inputs, '[]')) > 18 then raise exception 'Those picks aren''t valid.' using errcode = '22023'; end if;
  update league_groups set game = p_game, inputs = coalesce(p_inputs, '[]') where league_id = p_league and number = p_group;
end $$;

-- The scorer submits the group's card once everyone in the group has all 18 holes; the group's scores then lock.
create or replace function public.submit_league_group(p_profile uuid, p_league uuid, p_group integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_players uuid[];
begin
  select players into v_players from league_groups where league_id = p_league and number = p_group;
  if v_players is null then raise exception 'That group isn''t in this league.' using errcode = '22023'; end if;
  perform league_check_scorer(p_profile, p_league, v_players[1]);
  if exists (select 1 from unnest(v_players) x where (select count(*) from league_holes h where h.league_id = p_league and h.profile_id = x) < 18) then
    raise exception 'Enter a score on every hole for everyone in the group first.' using errcode = '22023';
  end if;
  update league_groups set submitted_at = now() where league_id = p_league and number = p_group;
end $$;

-- The organizer ends the league (scores lock; it moves to Past on the Leagues tab).
create or replace function public.end_league(p_organizer uuid, p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform league_check_organizer(p_organizer, p_league, false);
  update leagues set status = 'ended', ended_at = coalesce(ended_at, now()) where id = p_league;
end $$;

-- The organizer deletes the league for everyone.
create or replace function public.delete_league(p_organizer uuid, p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform league_check_organizer(p_organizer, p_league, false);
  delete from leagues where id = p_league;
end $$;

-- Copy this league: a new live league on p_date with the same name, course, settings and players (with their
-- handicaps). Tee times and pairs start fresh. Returns { id, code }.
create or replace function public.copy_league(p_organizer uuid, p_league uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from leagues; v_id uuid; v_code text;
begin
  perform league_check_organizer(p_organizer, p_league, false);
  if p_date is null then raise exception 'Pick the new league''s date.' using errcode = '22023'; end if;
  select * into v_from from leagues where id = p_league;
  v_code := league_new_code();
  insert into leagues (code, name, organizer, course, round_date, scoring, skins, pairs)
  values (v_code, v_from.name, p_organizer, v_from.course, p_date, v_from.scoring, v_from.skins, v_from.pairs || '{"locked": false, "teams": []}'::jsonb)
  returning id into v_id;
  insert into league_players (league_id, profile_id, handicap) select v_id, profile_id, handicap from league_players where league_id = p_league;
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'league_clean_code(text)', 'league_is_member(uuid, uuid)', 'league_check_course(jsonb)', 'league_new_code()',
    'create_league(uuid, text, jsonb, date, text, boolean, numeric)', 'find_league(uuid, text)', 'join_league(uuid, text, numeric)',
    'get_league(uuid, uuid)', 'list_my_leagues(uuid)', 'league_check_organizer(uuid, uuid, boolean)',
    'set_league_settings(uuid, uuid, text, jsonb, jsonb)', 'set_league_groups(uuid, uuid, jsonb)', 'league_check_scorer(uuid, uuid, uuid)',
    'set_league_strokes(uuid, uuid, uuid, integer, integer)', 'set_league_group_game(uuid, uuid, integer, jsonb, jsonb)',
    'submit_league_group(uuid, uuid, integer)', 'end_league(uuid, uuid)', 'delete_league(uuid, uuid)', 'copy_league(uuid, uuid, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
