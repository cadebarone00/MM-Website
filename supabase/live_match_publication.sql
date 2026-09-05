-- Run once in the Supabase SQL Editor after career_live_archive.sql.
-- This is the publication foundation: Career Archive contains only confirmed
-- individual scores, and official match state/odds/audit records have a
-- durable home. Route handlers will be the only writers (service role).

-- Compatibility bridge for a project created before the multi-year live
-- migration. The application and archive use season_year everywhere; seed
-- any pre-existing live rows as the original 2027 tournament before this
-- file references the column below.
alter table live_hole_scores add column if not exists season_year integer;
update live_hole_scores set season_year = 2027 where season_year is null;
alter table live_hole_scores alter column season_year set not null;

alter table live_match_boxes add column if not exists season_year integer;
update live_match_boxes set season_year = 2027 where season_year is null;
alter table live_match_boxes alter column season_year set not null;

alter table live_round_state add column if not exists season_year integer;
update live_round_state set season_year = 2027 where season_year is null;
alter table live_round_state alter column season_year set not null;

alter table live_roster add column if not exists season_year integer;
update live_roster set season_year = 2027 where season_year is null;
alter table live_roster alter column season_year set not null;

-- A season column alone is not enough: the legacy tables used `round` or
-- `player_slug` as a global key. Re-key them by season so a 2034 rehearsal
-- can coexist with the real 2027 tournament. These operations are safe to
-- re-run; any dependent round FK is dropped and recreated as a composite FK.
alter table live_match_boxes drop constraint if exists live_match_boxes_round_fkey;
alter table live_match_boxes drop constraint if exists live_match_boxes_season_year_round_fkey;
alter table live_round_state drop constraint if exists live_round_state_pkey;
alter table live_round_state add primary key (season_year, round);

alter table live_roster drop constraint if exists live_roster_pkey;
alter table live_roster add primary key (season_year, player_slug);

-- Team choices may be locked one player at a time. A separate table lets
-- Tiger lock an explicit "Unassigned" choice without creating an invalid
-- roster entry (live_roster itself contains active team assignments only).
create table if not exists live_roster_assignment_locks (
  season_year integer not null check (season_year between 2027 and 2034),
  player_slug text not null references player_slots(player_slug) on delete cascade,
  locked_at timestamptz not null default now(),
  primary key (season_year, player_slug)
);
alter table live_roster_assignment_locks enable row level security;
drop policy if exists live_roster_assignment_locks_select_all on live_roster_assignment_locks;
create policy live_roster_assignment_locks_select_all on live_roster_assignment_locks for select using (true);

alter table live_match_boxes drop constraint if exists live_match_boxes_round_box_number_key;
alter table live_match_boxes drop constraint if exists live_match_boxes_season_round_box_number_key;
alter table live_match_boxes add constraint live_match_boxes_season_year_round_fkey
  foreign key (season_year, round) references live_round_state (season_year, round);
alter table live_match_boxes add constraint live_match_boxes_season_round_box_number_key
  unique (season_year, round, box_number);

alter table live_hole_scores drop constraint if exists live_hole_scores_player_slug_round_hole_key;
alter table live_hole_scores drop constraint if exists live_hole_scores_season_year_player_slug_round_hole_key;
alter table live_hole_scores add constraint live_hole_scores_season_year_player_slug_round_hole_key
  unique (season_year, player_slug, round, hole);

-- Master Settings and Broadcast must also have one row per season; otherwise
-- creating the 2034 setup would overwrite the real tournament's settings.
alter table live_tournament_settings add column if not exists season_year integer;
update live_tournament_settings set season_year = 2027 where season_year is null;
alter table live_tournament_settings alter column season_year set not null;
alter table live_tournament_settings drop constraint if exists live_tournament_settings_singleton;
alter table live_tournament_settings drop constraint if exists live_tournament_settings_pkey;
alter table live_tournament_settings drop column if exists id;
alter table live_tournament_settings add primary key (season_year);
-- Master Settings fields are kept with the season record. These were added
-- to schema.sql before this publication file existed, so include them here
-- as well for projects whose database was migrated incrementally.
alter table live_tournament_settings add column if not exists venue_name text;
alter table live_tournament_settings add column if not exists venue_locked boolean not null default false;
alter table live_tournament_settings add column if not exists begin_date date;
alter table live_tournament_settings add column if not exists end_date date;
alter table live_tournament_settings add column if not exists dates_locked boolean not null default false;

alter table broadcast_config add column if not exists season_year integer;
update broadcast_config set season_year = 2027 where season_year is null;
alter table broadcast_config alter column season_year set not null;
alter table broadcast_config drop constraint if exists broadcast_config_singleton;
alter table broadcast_config drop constraint if exists broadcast_config_pkey;
alter table broadcast_config drop column if exists id;
alter table broadcast_config add primary key (season_year);

alter table broadcast_state add column if not exists season_year integer;
update broadcast_state set season_year = 2027 where season_year is null;
alter table broadcast_state alter column season_year set not null;
alter table broadcast_state drop constraint if exists broadcast_state_singleton;
alter table broadcast_state drop constraint if exists broadcast_state_pkey;
alter table broadcast_state drop column if exists id;
alter table broadcast_state add primary key (season_year);

-- Tiger's public Wager board records which of the code-defined models have
-- been submitted. The model definitions remain in code; this table stores
-- publication state and the immutable rulebook shown to the public.
create table if not exists wager_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  scope text not null check (scope in ('player', 'team', 'match', 'tournament')),
  market_kind text not null check (market_kind in ('yes_no', 'over_under', 'winner', 'head_to_head')),
  stat_key text not null,
  calculation_rule text not null,
  settlement_rule text not null,
  is_active boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists wager_types_active_idx on wager_types (is_active, created_at desc);
alter table wager_types enable row level security;

-- Foursome/Alternate Shot is a single shared ball per side. It belongs in a
-- team archive, never twice in two players' individual score histories.
-- These confirmed observations are the live counterpart to
-- career_stat_team_holes and feed only the Alternate Shot calibration model.
create table if not exists career_archive_team_holes (
  season_year integer not null check (season_year between 2027 and 2034),
  round integer not null,
  match_box_id uuid not null references live_match_boxes(id) on delete cascade,
  team text not null check (team in ('maroon', 'white')),
  player_1 text not null references player_slots(player_slug),
  player_2 text not null references player_slots(player_slug),
  course text not null,
  played_on date,
  hole integer not null check (hole between 1 and 18),
  par integer not null,
  yards integer not null,
  team_score integer not null check (team_score > 0),
  updated_at timestamptz not null default now(),
  primary key (season_year, round, match_box_id, team, hole)
);
create index if not exists career_archive_team_holes_pair_idx
  on career_archive_team_holes (player_1, player_2, season_year);

alter table career_archive_team_holes enable row level security;
drop policy if exists career_archive_team_holes_select_all on career_archive_team_holes;
create policy career_archive_team_holes_select_all on career_archive_team_holes for select using (true);

-- A Fourball X is an actual double-par result for the match, but not a
-- completed individual performance. Keep the marker through the raw score
-- and archive layers so the odds loader can exclude it without guessing.
alter table live_hole_scores add column if not exists did_not_finish boolean not null default false;
alter table career_archive_live_holes add column if not exists did_not_finish boolean not null default false;

-- Earlier archive wiring mirrored every live_hole_scores write. A draft or
-- disagreement must not enter the archive/model pool. Remove any legacy
-- unconfirmed copies before replacing the trigger.
delete from career_archive_live_holes archive
using live_hole_scores live
where archive.season_year = live.season_year
  and archive.round = live.round
  and archive.player_slug = live.player_slug
  and archive.hole = live.hole
  and live.confirmed_by is null;

-- Remove any individual copies from a previous version of the trigger.
delete from career_archive_live_holes archive
using live_match_boxes box
where archive.season_year = box.season_year
  and archive.round = box.round
  and archive.player_slug = any(box.maroon_players || box.white_players)
  and box.format = 'Foursome';

-- A round can be armed while individual boxes remain upcoming until tee time.
-- `state = 'Live'` plus this timestamp is Tiger's per-match Start Match
-- override; tee-time activation does not need to mutate the database.
alter table live_match_boxes add column if not exists started_at timestamptz;

create or replace function mirror_live_score_to_career_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_box_id uuid;
  v_team text;
  v_team_players text[];
  v_played_on date;
  v_course text;
  v_hole jsonb;
  v_confirmed_count integer;
  v_distinct_scores integer;
  v_team_score integer;
begin
  -- Foursome has one shared score for a side. After both duplicated player
  -- rows agree, preserve one team observation; any later dispute retracts
  -- it. It must never become an individual performance sample.
  select
    box.id,
    case when new.player_slug = any(box.maroon_players) then 'maroon' else 'white' end,
    case when new.player_slug = any(box.maroon_players) then box.maroon_players else box.white_players end
  into v_match_box_id, v_team, v_team_players
  from live_match_boxes box
  where box.season_year = new.season_year
    and box.round = new.round
    and box.format = 'Foursome'
    and new.player_slug = any(box.maroon_players || box.white_players)
  limit 1;

  if found then
    delete from career_archive_live_holes
    where season_year = new.season_year
      and round = new.round
      and player_slug = new.player_slug
      and hole = new.hole;

    select count(*), count(distinct score), min(score)
    into v_confirmed_count, v_distinct_scores, v_team_score
    from live_hole_scores
    where season_year = new.season_year
      and round = new.round
      and hole = new.hole
      and player_slug = any(v_team_players)
      and confirmed_by is not null
      and score is not null
      and score > 0;

    if v_confirmed_count = cardinality(v_team_players) and v_distinct_scores = 1 then
      select round_state.date, course.name, hole_data
      into v_played_on, v_course, v_hole
      from live_round_state round_state
      join live_courses course on course.id = round_state.course_id
      cross join lateral jsonb_array_elements(course.holes) hole_data
      where round_state.season_year = new.season_year
        and round_state.round = new.round
        and (hole_data ->> 'number')::integer = new.hole;

      if v_course is not null and v_hole is not null then
        insert into career_archive_team_holes
          (season_year, round, match_box_id, team, player_1, player_2, course, played_on, hole, par, yards, team_score, updated_at)
        values
          (new.season_year, new.round, v_match_box_id, v_team, v_team_players[1], v_team_players[2], v_course, v_played_on,
           new.hole, (v_hole ->> 'par')::integer, (v_hole ->> 'yards')::integer, v_team_score, now())
        on conflict (season_year, round, match_box_id, team, hole) do update
          set team_score = excluded.team_score,
              course = excluded.course,
              played_on = excluded.played_on,
              par = excluded.par,
              yards = excluded.yards,
              updated_at = now();
      end if;
    else
      delete from career_archive_team_holes
      where season_year = new.season_year
        and round = new.round
        and match_box_id = v_match_box_id
        and team = v_team
        and hole = new.hole;
    end if;

    update career_archive_rounds
      set status = 'live', updated_at = now()
      where season_year = new.season_year
        and round = new.round
        and player_slug = new.player_slug;
    return new;
  end if;

  -- A score can become disputed again after an edit. Retraction is essential:
  -- no stale official value may remain in the Career Archive.
  if new.confirmed_by is null then
    delete from career_archive_live_holes
    where season_year = new.season_year
      and round = new.round
      and player_slug = new.player_slug
      and hole = new.hole;
    return new;
  end if;

  insert into career_archive_live_holes
    (season_year, round, player_slug, hole, score, putts, fir, gir, did_not_finish, updated_at)
  values
    (new.season_year, new.round, new.player_slug, new.hole, new.score,
     new.putts, new.fir, new.gir, new.did_not_finish, now())
  on conflict (season_year, round, player_slug, hole) do update
    set score = excluded.score,
        putts = excluded.putts,
        fir = excluded.fir,
        gir = excluded.gir,
        did_not_finish = excluded.did_not_finish,
        updated_at = now();

  update career_archive_rounds
    set status = 'live', updated_at = now()
    where season_year = new.season_year
      and round = new.round
      and player_slug = new.player_slug;
  return new;
end;
$$;

drop trigger if exists mirror_live_score_to_career_archive_trigger on live_hole_scores;
create trigger mirror_live_score_to_career_archive_trigger
after insert or update on live_hole_scores
for each row execute function mirror_live_score_to_career_archive();

-- One authoritative, derived state per match. Its values are recalculated
-- from confirmed holes only; clients consume it rather than recomputing a
-- potentially different scorecard/match result locally.
create table if not exists live_match_official_state (
  match_box_id uuid primary key references live_match_boxes(id) on delete cascade,
  season_year integer not null check (season_year between 2027 and 2034),
  round integer not null,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'live', 'complete', 'closed_out')),
  thru integer not null default 0 check (thru between 0 and 18),
  maroon_holes integer not null default 0 check (maroon_holes >= 0),
  white_holes integer not null default 0 check (white_holes >= 0),
  leader text not null default 'tie' check (leader in ('maroon', 'white', 'tie')),
  margin integer not null default 0 check (margin >= 0),
  mathematically_complete boolean not null default false,
  official_result text check (official_result in ('maroon', 'white', 'tie')),
  closed_out_at timestamptz,
  closed_out_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists live_match_official_state_season_round_idx
  on live_match_official_state (season_year, round);

-- Append-only audit trail for entries, disagreements, confirmations, Tiger
-- corrections, lifecycle transitions, closeout, and settlement activity.
create table if not exists live_score_audit_events (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2027 and 2034),
  match_box_id uuid references live_match_boxes(id) on delete cascade,
  round integer not null,
  hole integer check (hole between 1 and 18),
  player_slug text references player_slots(player_slug) on delete set null,
  actor_profile_id uuid references profiles(id) on delete set null,
  kind text not null check (kind in (
    'match_locked', 'match_updated', 'round_armed', 'match_started',
    'score_entered', 'score_disputed', 'score_confirmed', 'score_retracted',
    'double_par_recorded', 'tiger_correction', 'player_submitted',
    'match_closed_out', 'odds_snapshot_created', 'wager_settled'
  )),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists live_score_audit_events_match_created_idx
  on live_score_audit_events (match_box_id, created_at desc);

-- Each recomputation is retained so Wagers, broadcasts, and future
-- probability visualizations can explain the price they displayed.
create table if not exists live_match_odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_box_id uuid not null references live_match_boxes(id) on delete cascade,
  season_year integer not null check (season_year between 2027 and 2034),
  model_version text not null,
  state_thru integer not null check (state_thru between 0 and 18),
  maroon_lead integer not null,
  inputs_as_of timestamptz not null default now(),
  maroon_win_probability numeric not null check (maroon_win_probability between 0 and 1),
  tie_probability numeric not null check (tie_probability between 0 and 1),
  white_win_probability numeric not null check (white_win_probability between 0 and 1),
  maroon_american_odds integer,
  tie_american_odds integer,
  white_american_odds integer,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (round(maroon_win_probability + tie_probability + white_win_probability, 6) = 1)
);
create index if not exists live_match_odds_snapshots_current_idx
  on live_match_odds_snapshots (match_box_id, created_at desc);

alter table live_match_official_state enable row level security;
alter table live_score_audit_events enable row level security;
alter table live_match_odds_snapshots enable row level security;

drop policy if exists live_match_official_state_select_all on live_match_official_state;
create policy live_match_official_state_select_all on live_match_official_state for select using (true);
-- Audit payloads can contain correction context and actor details. There is
-- intentionally no select policy here: Tiger/service-role tooling reads it,
-- while public clients receive only official state and odds snapshots.
drop policy if exists live_score_audit_events_select_all on live_score_audit_events;
drop policy if exists live_match_odds_snapshots_select_all on live_match_odds_snapshots;
create policy live_match_odds_snapshots_select_all on live_match_odds_snapshots for select using (true);

-- Required for instant official-score and odds refreshes in public/portal
-- clients. Guarded because publication membership has no IF NOT EXISTS form.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_match_official_state'
  ) then
    alter publication supabase_realtime add table live_match_official_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_match_odds_snapshots'
  ) then
    alter publication supabase_realtime add table live_match_odds_snapshots;
  end if;
end $$;
