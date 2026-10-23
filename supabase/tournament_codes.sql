-- supabase/tournament_codes.sql
-- Tournaments by code (project_specs.md, "Feature: Tournaments by code"). An organizer creates a stroke-play tournament
-- with one or more rounds and gets a short code; players type the code in the app to join. Each player keeps their own
-- card per round (strokes only); everyone in the tournament reads the same leaderboard.
--
-- round setup = { course: { ref, name, place, par[], strokeIndex[] }, tee: { name, rating, slope } | null } (the same
-- shapes as Play a round, lib/platform/personalRound.ts).
--
-- Access: nobody reads or writes the tables directly (RLS on, no policies). The server calls the functions below with
-- the signed-in user's id, using the service-role key (lib/platform/codeTournamentsServer.ts):
--   - anyone signed in can look a tournament up by its code (name, rounds, organizer) and join it while it's live
--   - only the organizer and joined players read the whole tournament
--   - a player writes only their own strokes, in a live tournament, on a round whose card they haven't submitted
--   - only the organizer adds rounds or ends the tournament
--
-- Prerequisite: schema.sql (profiles). Safe to run more than once.
-- Undo: drop table public.code_tournament_cards, public.code_tournament_holes, public.code_tournament_players,
--       public.code_tournament_rounds, public.code_tournaments cascade;

begin;

create table if not exists public.code_tournaments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  organizer uuid not null references public.profiles(id) on delete cascade,
  organizer_plays boolean not null default true,
  scoring text not null default 'Gross' check (scoring in ('Gross', 'Net')),
  status text not null default 'live' check (status in ('live', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.code_tournament_rounds (
  tournament_id uuid not null references public.code_tournaments(id) on delete cascade,
  number integer not null check (number between 1 and 10),
  setup jsonb not null,
  round_date date not null,
  primary key (tournament_id, number)
);

create table if not exists public.code_tournament_players (
  tournament_id uuid not null references public.code_tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  handicap numeric(4, 1) check (handicap between -10 and 54),
  joined_at timestamptz not null default now(),
  primary key (tournament_id, profile_id)
);

create table if not exists public.code_tournament_holes (
  tournament_id uuid not null,
  round integer not null,
  profile_id uuid not null,
  hole integer not null check (hole between 1 and 18),
  strokes integer not null check (strokes between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, round, profile_id, hole),
  foreign key (tournament_id, round) references public.code_tournament_rounds(tournament_id, number) on delete cascade,
  foreign key (tournament_id, profile_id) references public.code_tournament_players(tournament_id, profile_id) on delete cascade
);

create table if not exists public.code_tournament_cards (
  tournament_id uuid not null,
  round integer not null,
  profile_id uuid not null,
  submitted_at timestamptz not null default now(),
  primary key (tournament_id, round, profile_id),
  foreign key (tournament_id, round) references public.code_tournament_rounds(tournament_id, number) on delete cascade,
  foreign key (tournament_id, profile_id) references public.code_tournament_players(tournament_id, profile_id) on delete cascade
);

alter table public.code_tournaments enable row level security;
alter table public.code_tournament_rounds enable row level security;
alter table public.code_tournament_players enable row level security;
alter table public.code_tournament_holes enable row level security;
alter table public.code_tournament_cards enable row level security;
revoke all on public.code_tournaments, public.code_tournament_rounds, public.code_tournament_players, public.code_tournament_holes,
  public.code_tournament_cards from anon, authenticated;

-- A code as typed ("k7q-4mz ") → as stored ("K7Q4MZ").
create or replace function public.code_tournament_clean_code(p_code text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.code_tournament_is_member(p_profile uuid, p_tournament uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from code_tournaments where id = p_tournament and organizer = p_profile)
      or exists (select 1 from code_tournament_players where tournament_id = p_tournament and profile_id = p_profile);
$$;

-- One round's setup must name a course with 9 or 18 pars (3–6) and come with a date.
create or replace function public.code_tournament_check_round(p_setup jsonb, p_date date)
returns void language plpgsql immutable set search_path = public as $$
declare v_par jsonb := p_setup #> '{course,par}';
begin
  if jsonb_typeof(p_setup) <> 'object' or jsonb_typeof(v_par) <> 'array' or jsonb_array_length(v_par) not in (9, 18) then
    raise exception 'Each round needs a course with a 9 or 18 hole scorecard.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_par) p where jsonb_typeof(p) <> 'number' or (p #>> '{}')::integer not between 3 and 6) then
    raise exception 'Each hole''s par must be 3 to 6.' using errcode = '22023';
  end if;
  if p_date is null then raise exception 'Each round needs a date.' using errcode = '22023'; end if;
end $$;

-- The organizer creates the tournament with its rounds ([{ setup, date }], in order). Returns { id, code }.
create or replace function public.create_code_tournament(p_organizer uuid, p_name text, p_scoring text, p_plays boolean, p_handicap numeric, p_rounds jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_code text;
  v_round jsonb;
  v_number integer := 0;
  v_letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Give the tournament a name (up to 60 characters).' using errcode = '22023'; end if;
  if p_scoring not in ('Gross', 'Net') then raise exception 'Pick Gross or Net.' using errcode = '22023'; end if;
  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) not between 1 and 10 then raise exception 'Add 1 to 10 rounds.' using errcode = '22023'; end if;
  for v_round in select value from jsonb_array_elements(p_rounds) loop
    perform code_tournament_check_round(v_round -> 'setup', (v_round ->> 'date')::date);
  end loop;
  -- 6 characters with no look-alikes (no 0 / O, 1 / I / L); try again on the rare clash.
  loop
    v_code := (select string_agg(substr(v_letters, 1 + floor(random() * length(v_letters))::integer, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from code_tournaments where code = v_code);
  end loop;
  insert into code_tournaments (code, name, organizer, organizer_plays, scoring) values (v_code, btrim(p_name), p_organizer, coalesce(p_plays, true), p_scoring)
  returning id into v_id;
  for v_round in select value from jsonb_array_elements(p_rounds) loop
    v_number := v_number + 1;
    insert into code_tournament_rounds (tournament_id, number, setup, round_date) values (v_id, v_number, v_round -> 'setup', (v_round ->> 'date')::date);
  end loop;
  if coalesce(p_plays, true) then insert into code_tournament_players (tournament_id, profile_id, handicap) values (v_id, p_organizer, p_handicap); end if;
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

-- The organizer adds another round at the end while the tournament is live.
create or replace function public.add_code_tournament_round(p_organizer uuid, p_tournament uuid, p_setup jsonb, p_date date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_number integer;
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then raise exception 'Only the organizer can add rounds.' using errcode = '42501'; end if;
  if not exists (select 1 from code_tournaments where id = p_tournament and status = 'live') then raise exception 'This tournament has ended.' using errcode = '22023'; end if;
  perform code_tournament_check_round(p_setup, p_date);
  select coalesce(max(number), 0) + 1 into v_number from code_tournament_rounds where tournament_id = p_tournament;
  if v_number > 10 then raise exception 'A tournament has up to 10 rounds.' using errcode = '22023'; end if;
  insert into code_tournament_rounds (tournament_id, number, setup, round_date) values (p_tournament, v_number, p_setup, p_date);
  return v_number;
end $$;

-- Look a tournament up by its code, before joining: what it is and whether I'm already in. Null = no such code.
create or replace function public.find_code_tournament(p_profile uuid, p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status, 'scoring', t.scoring, 'organizerName', o.display_name,
    'member', code_tournament_is_member(p_profile, t.id),
    'playerCount', (select count(*) from code_tournament_players p where p.tournament_id = t.id),
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'course', r.setup #>> '{course,name}', 'date', r.round_date) order by r.number), '[]'::jsonb)
               from code_tournament_rounds r where r.tournament_id = t.id))
  from code_tournaments t join profiles o on o.id = t.organizer
  where t.code = code_tournament_clean_code(p_code);
$$;

-- Join with the code (handicap index for net tournaments). Joining again just updates the handicap. Returns the id.
create or replace function public.join_code_tournament(p_profile uuid, p_code text, p_handicap numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text;
begin
  select id, status into v_id, v_status from code_tournaments where code = code_tournament_clean_code(p_code);
  if v_id is null then raise exception 'No tournament has that code. Check it and try again.' using errcode = '22023'; end if;
  if v_status <> 'live' then raise exception 'This tournament has ended.' using errcode = '22023'; end if;
  if (select count(*) from code_tournament_players where tournament_id = v_id) >= 200 then raise exception 'This tournament is full (200 players).' using errcode = '22023'; end if;
  insert into code_tournament_players (tournament_id, profile_id, handicap) values (v_id, p_profile, p_handicap)
  on conflict (tournament_id, profile_id) do update set handicap = coalesce(excluded.handicap, code_tournament_players.handicap);
  return v_id;
end $$;

-- The whole tournament for the organizer or a player: settings, rounds, players, strokes and submitted cards. Null for anyone else.
create or replace function public.get_code_tournament(p_profile uuid, p_tournament uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not code_tournament_is_member(p_profile, t.id) then null else jsonb_build_object(
    'id', t.id, 'code', t.code, 'name', t.name, 'organizer', t.organizer, 'organizerPlays', t.organizer_plays, 'scoring', t.scoring,
    'status', t.status, 'createdAt', t.created_at,
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'setup', r.setup, 'date', r.round_date) order by r.number), '[]'::jsonb)
               from code_tournament_rounds r where r.tournament_id = t.id),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'name', pr.display_name, 'username', pr.username, 'handicap', p.handicap) order by p.joined_at), '[]'::jsonb)
                from code_tournament_players p join profiles pr on pr.id = p.profile_id where p.tournament_id = t.id),
    'holes', (select coalesce(jsonb_agg(jsonb_build_object('profileId', h.profile_id, 'round', h.round, 'hole', h.hole, 'strokes', h.strokes)), '[]'::jsonb)
              from code_tournament_holes h where h.tournament_id = t.id),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('profileId', c.profile_id, 'round', c.round, 'submittedAt', c.submitted_at)), '[]'::jsonb)
              from code_tournament_cards c where c.tournament_id = t.id))
  end
  from code_tournaments t where t.id = p_tournament;
$$;

-- Tournaments I organize or play in, newest first (Tourneys → My Tournaments).
create or replace function public.list_my_code_tournaments(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status,
    'firstDate', (select min(round_date) from code_tournament_rounds r where r.tournament_id = t.id),
    'lastDate', (select max(round_date) from code_tournament_rounds r where r.tournament_id = t.id),
    'course', (select r.setup #>> '{course,name}' from code_tournament_rounds r where r.tournament_id = t.id order by r.number limit 1))
    order by t.created_at desc), '[]'::jsonb)
  from code_tournaments t where code_tournament_is_member(p_profile, t.id);
$$;

-- My strokes on one hole of one round (null clears it).
create or replace function public.set_code_tournament_strokes(p_profile uuid, p_tournament uuid, p_round integer, p_hole integer, p_strokes integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_holes integer;
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and status = 'live') then raise exception 'This tournament has ended.' using errcode = '22023'; end if;
  if not exists (select 1 from code_tournament_players where tournament_id = p_tournament and profile_id = p_profile) then
    raise exception 'You''re not playing in this tournament.' using errcode = '42501';
  end if;
  select jsonb_array_length(setup #> '{course,par}') into v_holes from code_tournament_rounds where tournament_id = p_tournament and number = p_round;
  if v_holes is null then raise exception 'That round isn''t in this tournament.' using errcode = '22023'; end if;
  if p_hole not between 1 and v_holes then raise exception 'That hole isn''t on this round''s card.' using errcode = '22023'; end if;
  if exists (select 1 from code_tournament_cards where tournament_id = p_tournament and round = p_round and profile_id = p_profile) then
    raise exception 'You''ve already submitted this round''s card.' using errcode = '22023';
  end if;
  if p_strokes is null then
    delete from code_tournament_holes where tournament_id = p_tournament and round = p_round and profile_id = p_profile and hole = p_hole;
  else
    insert into code_tournament_holes (tournament_id, round, profile_id, hole, strokes) values (p_tournament, p_round, p_profile, p_hole, p_strokes)
    on conflict (tournament_id, round, profile_id, hole) do update set strokes = excluded.strokes, updated_at = now();
  end if;
end $$;

-- Submit my card for a round once every hole has a score; it then can't change.
create or replace function public.submit_code_tournament_card(p_profile uuid, p_tournament uuid, p_round integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_holes integer;
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and status = 'live') then raise exception 'This tournament has ended.' using errcode = '22023'; end if;
  if not exists (select 1 from code_tournament_players where tournament_id = p_tournament and profile_id = p_profile) then
    raise exception 'You''re not playing in this tournament.' using errcode = '42501';
  end if;
  select jsonb_array_length(setup #> '{course,par}') into v_holes from code_tournament_rounds where tournament_id = p_tournament and number = p_round;
  if v_holes is null then raise exception 'That round isn''t in this tournament.' using errcode = '22023'; end if;
  if (select count(*) from code_tournament_holes where tournament_id = p_tournament and round = p_round and profile_id = p_profile) < v_holes then
    raise exception 'Enter a score on every hole first.' using errcode = '22023';
  end if;
  insert into code_tournament_cards (tournament_id, round, profile_id) values (p_tournament, p_round, p_profile) on conflict do nothing;
end $$;

-- The organizer ends the tournament (scores lock; it moves to Past Tournaments).
create or replace function public.end_code_tournament(p_organizer uuid, p_tournament uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then raise exception 'Only the organizer can end the tournament.' using errcode = '42501'; end if;
  update code_tournaments set status = 'ended', ended_at = coalesce(ended_at, now()) where id = p_tournament;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'code_tournament_clean_code(text)', 'code_tournament_is_member(uuid, uuid)', 'code_tournament_check_round(jsonb, date)',
    'create_code_tournament(uuid, text, text, boolean, numeric, jsonb)', 'add_code_tournament_round(uuid, uuid, jsonb, date)',
    'find_code_tournament(uuid, text)', 'join_code_tournament(uuid, text, numeric)', 'get_code_tournament(uuid, uuid)',
    'list_my_code_tournaments(uuid)', 'set_code_tournament_strokes(uuid, uuid, integer, integer, integer)',
    'submit_code_tournament_card(uuid, uuid, integer)', 'end_code_tournament(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
