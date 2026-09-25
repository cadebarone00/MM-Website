# Verbatim source companion for the Google Sheet backup

Repository reference: 8d2d84c331fd61d7d26eaad952a049cc4fc2968d. Exported from the working tree. No database rows or credentials.

**Reference only. Do not run this document as SQL.** These are incremental source files, not a flattened production schema. Follow the handoff for effective keys and limitations. Later migrations supersede older definitions; comments can describe older workflows.

## supabase/schema.sql

```sql
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New
-- query -> paste this whole file -> Run). Safe to run more than once.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  username text not null unique,
  is_host boolean not null default false,
  player_slug text,
  created_at timestamptz not null default now()
);

create table if not exists player_slots (
  player_slug text primary key,
  username text unique,
  claimed_by uuid references profiles(id) on delete set null,
  claimed_at timestamptz
);

-- profiles.player_slug references player_slots, so player_slots must exist
-- first — recreate profiles' FK now that both tables are defined.
alter table profiles
  drop constraint if exists profiles_player_slug_fkey,
  add constraint profiles_player_slug_fkey foreign key (player_slug) references player_slots(player_slug);

-- Case-insensitive uniqueness (plain `unique` above is case-sensitive, so
-- "Kyle" and "kyle" wouldn't otherwise collide).
create unique index if not exists profiles_username_lower_idx on profiles (lower(username));
create unique index if not exists player_slots_username_lower_idx on player_slots (lower(username)) where username is not null;

alter table profiles enable row level security;
alter table player_slots enable row level security;

-- Users may read only their own profile row. Every insert/update to
-- profiles happens server-side with the service-role key (bypasses RLS) —
-- there is deliberately no insert/update policy here.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (auth.uid() = id);

-- player_slots has NO policies — only the service-role key (which bypasses
-- RLS entirely) may ever touch it. This keeps player usernames and claim
-- status invisible to the anon key.

-- Seed the 13 known players (mirrors lib/data/players/index.ts) with their
-- deterministically computed usernames (see lib/portal/computePlayerUsername.ts).
-- Re-running is safe: existing rows are left untouched.
insert into player_slots (player_slug, username) values
  ('cade-barone', 'MMCADBAR'),
  ('cam-latto', 'MMCAMLAT'),
  ('collin-ross', 'MMCOLROS'),
  ('dalton-spriggs', 'MMDALSPR'),
  ('drew-weisser', 'MMDREWEI'),
  ('hugo-moebel', 'MMHUGMOE'),
  ('jackson-collins', 'MMJACCOL'),
  ('kyle-schnabel', 'MMKYLSCH'),
  ('luke-sherrell', 'MMLUKSHE'),
  ('nate-wojciechowski', 'MMNATWOJ'),
  ('pete-peabody', 'MMPETPEA'),
  ('peyton-vos', 'MMPEYVOS'),
  ('quez-currier', 'MMQUECUR')
on conflict (player_slug) do nothing;

-- === MM Coins (Wagers) ===================================================

create table if not exists wagers_accounts (
  profile_id uuid primary key references profiles(id) on delete cascade,
  mm_coins_balance numeric not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists mm_coin_bets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  market_key text not null,
  selection_key text not null,
  selection_label text not null,
  odds integer not null,
  stake numeric not null,
  potential_payout numeric not null,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost')),
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists mm_coin_bets_profile_idx on mm_coin_bets (profile_id, placed_at desc);
create index if not exists mm_coin_bets_market_idx on mm_coin_bets (market_key);

create table if not exists wagers_market_settlements (
  market_key text primary key,
  winning_selection_key text not null,
  settled_by uuid not null references profiles(id),
  settled_at timestamptz not null default now()
);

-- The host-managed definition of a reusable wager market. Individual odds,
-- selections, and bets are built from these rulebooks; this table deliberately
-- stores no calculated odds so a market can be recalculated/audited later.
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

alter table wagers_accounts enable row level security;
alter table mm_coin_bets enable row level security;
alter table wagers_market_settlements enable row level security;
alter table wager_types enable row level security;

-- === Career Stats workbook source ========================================
-- The raw-hole table is the calculation source of truth. Each upload also
-- snapshots every worksheet as JSON so no information from the workbook is
-- lost, even when a sheet is a derived report rather than raw data.
create table if not exists career_stat_holes (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2024 and 2034),
  player text not null,
  round integer not null check (round > 0),
  day text,
  course text not null,
  hole integer not null check (hole between 1 and 18),
  par integer not null check (par between 3 and 6),
  yards integer not null check (yards > 0),
  hole_type text,
  hole_length_bucket text,
  course_length numeric,
  course_length_bucket text,
  score integer not null check (score > 0),
  diff_vs_par integer,
  score_type text,
  format text,
  created_at timestamptz not null default now()
);
create index if not exists career_stat_holes_player_year_idx on career_stat_holes (player, year);
create index if not exists career_stat_holes_format_idx on career_stat_holes (format);

create table if not exists career_stat_partnerships (
  id uuid primary key default gen_random_uuid(),
  player text not null,
  partner text not null,
  year integer not null check (year between 2024 and 2034),
  format text,
  result text not null check (result in ('win', 'loss', 'halve')),
  created_at timestamptz not null default now()
);
create index if not exists career_stat_partnerships_player_idx on career_stat_partnerships (player, year);

create table if not exists career_stats_workbook_sheets (
  id uuid primary key default gen_random_uuid(),
  sheet_name text not null,
  source_file text not null,
  imported_by uuid references profiles(id) on delete set null,
  imported_at timestamptz not null default now(),
  sheet_data jsonb not null
);

alter table career_stat_holes enable row level security;
alter table career_stat_partnerships enable row level security;
alter table career_stats_workbook_sheets enable row level security;

-- Career data model v2: mirrors the validated Career Data & Odds Model
-- workbook. The original raw rows remain immutable after import; format-aware
-- team/match tables stop Fourball and Alternate Shot scores corrupting an
-- individual's stroke-play history.
alter table career_stat_holes add column if not exists event_id text;
alter table career_stat_holes add column if not exists tournament text;
alter table career_stat_holes add column if not exists played_on date;
alter table career_stat_holes add column if not exists round_holes integer;
alter table career_stat_holes add column if not exists match_id text;
alter table career_stat_holes add column if not exists team text;
alter table career_stat_holes add column if not exists partner_1 text;
alter table career_stat_holes add column if not exists partner_2 text;
alter table career_stat_holes add column if not exists opponent_1 text;
alter table career_stat_holes add column if not exists opponent_2 text;
alter table career_stat_holes add column if not exists tee text;
alter table career_stat_holes add column if not exists putts integer;
alter table career_stat_holes add column if not exists fairway_in_regulation boolean;
alter table career_stat_holes add column if not exists green_in_regulation boolean;
alter table career_stat_holes add column if not exists penalties integer;
alter table career_stat_holes add column if not exists entered_at timestamptz;
alter table career_stat_holes add column if not exists entered_by text;
alter table career_stat_holes add column if not exists source_record_id text;
alter table career_stat_holes add column if not exists google_sheet_row_id text;
alter table career_stat_holes add column if not exists sync_status text;
alter table career_stat_holes add column if not exists source_workbook text;
alter table career_stat_holes add column if not exists source_sheet text;
alter table career_stat_holes add column if not exists source_cell text;
alter table career_stat_holes add column if not exists data_quality_flags text;
create unique index if not exists career_stat_holes_source_record_id_idx on career_stat_holes (source_record_id) where source_record_id is not null;

create table if not exists career_stat_team_holes (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  year integer not null check (year between 2024 and 2034),
  round integer not null,
  format text not null,
  match_id text not null,
  team_id text not null,
  player_1 text not null,
  player_2 text,
  opponent_team_id text,
  course text not null,
  hole integer not null check (hole between 1 and 18),
  par integer not null,
  yards integer not null,
  team_score integer not null,
  team_score_to_par integer,
  team_score_type text,
  best_ball_score integer,
  winning_side text,
  result_text text,
  source_record_id text not null unique,
  source_workbook text,
  source_sheet text,
  source_cell text,
  data_quality_flags text,
  created_at timestamptz not null default now()
);

create table if not exists career_stat_matches (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  year integer not null check (year between 2024 and 2034),
  round integer not null,
  played_on date,
  format text not null,
  match_id text not null,
  maroon_players text,
  white_players text,
  winning_side text,
  result_text text,
  holes_played integer,
  final_status text,
  team_points numeric,
  match_notes text,
  source_workbook text,
  source_sheet text,
  source_cell text,
  data_quality_flags text,
  created_at timestamptz not null default now(),
  unique (event_id, match_id)
);

create table if not exists career_match_participants (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  year integer not null check (year between 2024 and 2034),
  round integer not null,
  format text not null,
  match_id text not null,
  team_id text,
  player text not null,
  partner text,
  opponent_1 text,
  opponent_2 text,
  winning_side text,
  result_text text,
  source_workbook text,
  source_sheet text,
  source_cell text,
  data_quality_flags text,
  created_at timestamptz not null default now(),
  unique (event_id, match_id, player)
);
create index if not exists career_match_participants_player_idx on career_match_participants (player, year, format);

create table if not exists career_stat_imports (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  imported_by uuid references profiles(id) on delete set null,
  imported_at timestamptz not null default now(),
  individual_hole_count integer not null,
  team_hole_count integer not null,
  match_count integer not null,
  participant_count integer not null,
  status text not null default 'complete'
);

alter table career_stat_team_holes enable row level security;
alter table career_stat_matches enable row level security;
alter table career_match_participants enable row level security;
alter table career_stat_imports enable row level security;

-- === Tiger Center Odds Model =============================================
-- The model reads normalized Career Stats rows; workbook sheets are never
-- queried by calculations. Each preview is reproducible/auditable through
-- this persisted settings record and the run history below.
create table if not exists odds_model_settings (
  id boolean primary key default true,
  model_version text not null default 'MM-1.0',
  simulation_count integer not null default 10000 check (simulation_count between 1000 and 100000),
  career_weight numeric not null default 0.75 check (career_weight between 0 and 1),
  recent_form_weight numeric not null default 0.25 check (recent_form_weight between 0 and 1),
  house_margin numeric not null default 0.05 check (house_margin between 0 and 0.25),
  updated_at timestamptz not null default now(),
  constraint odds_model_settings_singleton check (id),
  constraint odds_model_settings_weights_check check (career_weight + recent_form_weight = 1)
);
insert into odds_model_settings (id) values (true) on conflict (id) do nothing;

create table if not exists odds_model_runs (
  id uuid primary key default gen_random_uuid(),
  wager_type_slug text not null,
  player text,
  line numeric,
  settings jsonb not null,
  input_summary jsonb not null,
  result jsonb not null,
  run_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists odds_model_runs_created_idx on odds_model_runs (created_at desc);

alter table odds_model_settings enable row level security;
alter table odds_model_runs enable row level security;

drop policy if exists wagers_accounts_select_own on wagers_accounts;
create policy wagers_accounts_select_own on wagers_accounts for select using (auth.uid() = profile_id);

drop policy if exists mm_coin_bets_select_own on mm_coin_bets;
create policy mm_coin_bets_select_own on mm_coin_bets for select using (auth.uid() = profile_id);

-- Readable by any signed-in user — this is just "which markets have closed
-- and who won," not sensitive, and the client needs it to show settled
-- state. Nothing writes through this policy; only the SECURITY DEFINER
-- settle_mm_coin_market() function below ever inserts a row here.
drop policy if exists wagers_market_settlements_select_all on wagers_market_settlements;
create policy wagers_market_settlements_select_all on wagers_market_settlements for select using (auth.uid() is not null);

-- Seeds the calling user's wagers_accounts row if it doesn't exist yet,
-- then returns it. Called on every account read so a brand-new visitor
-- sees their starting balance immediately, without needing to place a bet
-- first.
create or replace function ensure_wagers_account() returns wagers_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account wagers_accounts;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into wagers_accounts (profile_id) values (auth.uid())
    on conflict (profile_id) do nothing;

  select * into v_account from wagers_accounts where profile_id = auth.uid();
  return v_account;
end;
$$;
grant execute on function ensure_wagers_account to authenticated;

-- Atomically checks balance, deducts the stake, and records the bet. Locks
-- the caller's own account row for the duration (`for update`) so two
-- rapid submissions can't both pass the balance check before either
-- deducts. Rejects betting on an already-settled market.
create or replace function place_mm_coin_bet(
  p_market_key text,
  p_selection_key text,
  p_selection_label text,
  p_odds integer,
  p_stake numeric
) returns mm_coin_bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_balance numeric;
  v_payout numeric;
  v_bet mm_coin_bets;
begin
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_stake <= 0 then
    raise exception 'Stake must be greater than zero';
  end if;

  -- Serializes against settle_mm_coin_market() for this same market_key —
  -- without this, a bet could be accepted in the narrow window between
  -- settlement's "not already settled" check and its INSERT committing,
  -- leaving that bet permanently unresolved (settlement never re-runs for
  -- an already-settled market). Released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext(p_market_key));

  if exists (select 1 from wagers_market_settlements where market_key = p_market_key) then
    raise exception 'This market has already settled';
  end if;

  insert into wagers_accounts (profile_id) values (v_profile_id)
    on conflict (profile_id) do nothing;

  select mm_coins_balance into v_balance from wagers_accounts where profile_id = v_profile_id for update;

  if p_stake > v_balance then
    raise exception 'Stake exceeds current balance';
  end if;

  v_payout := round(
    case when p_odds > 0 then p_stake + p_stake * (p_odds / 100.0)
         else p_stake + p_stake * (100.0 / abs(p_odds))
    end,
    2
  );

  update wagers_accounts set mm_coins_balance = mm_coins_balance - p_stake where profile_id = v_profile_id;

  insert into mm_coin_bets (profile_id, market_key, selection_key, selection_label, odds, stake, potential_payout)
  values (v_profile_id, p_market_key, p_selection_key, p_selection_label, p_odds, p_stake, v_payout)
  returning * into v_bet;

  return v_bet;
end;
$$;
grant execute on function place_mm_coin_bet to authenticated;

-- Host-only. Records the winning selection for a market (idempotent guard:
-- raises if already settled), credits every pending winning bet's payout,
-- then marks all of that market's pending bets won/lost. Credits balances
-- BEFORE flipping bet status to 'won', so the join in the credit step only
-- matches bets still in 'pending' — avoids any ordering ambiguity.
create or replace function settle_mm_coin_market(
  p_market_key text,
  p_winning_selection_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_host from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized';
  end if;

  -- Same market_key-keyed lock place_mm_coin_bet() takes — see the comment
  -- there for why.
  perform pg_advisory_xact_lock(hashtext(p_market_key));

  if exists (select 1 from wagers_market_settlements where market_key = p_market_key) then
    raise exception 'Market already settled';
  end if;

  insert into wagers_market_settlements (market_key, winning_selection_key, settled_by)
  values (p_market_key, p_winning_selection_key, auth.uid());

  update wagers_accounts a
    set mm_coins_balance = mm_coins_balance + w.total_payout
    from (
      select profile_id, sum(potential_payout) as total_payout
      from mm_coin_bets
      where market_key = p_market_key
        and selection_key = p_winning_selection_key
        and status = 'pending'
      group by profile_id
    ) w
    where w.profile_id = a.profile_id;

  update mm_coin_bets
    set status = 'won', settled_at = now()
    where market_key = p_market_key and selection_key = p_winning_selection_key and status = 'pending';

  update mm_coin_bets
    set status = 'lost', settled_at = now()
    where market_key = p_market_key and selection_key <> p_winning_selection_key and status = 'pending';
end;
$$;
grant execute on function settle_mm_coin_market to authenticated;

-- === Native Live Platform ================================================
-- Live tournament data (current/upcoming year only — past years stay as
-- static lib/data/*.ts files, never written here). Every player reference
-- uses player_slug, the same canonical identifier profiles/player_slots
-- already use — never a bare first name.

create table if not exists live_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holes jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists live_match_boxes (
  id uuid primary key default gen_random_uuid(),
  tournament_year integer not null,
  day integer not null check (day between 1 and 4),
  session text not null check (session in ('Morning', 'Afternoon')),
  box_number integer not null check (box_number between 1 and 3),
  format text not null check (format in ('Fourball', 'Scramble', 'Alternate Shot', 'Singles')),
  tee_time timestamptz not null,
  maroon_players text[] not null,
  white_players text[] not null,
  state text not null default 'Scheduled' check (state in ('Scheduled', 'Armed', 'Live', 'Final')),
  started boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tournament_year, day, session, box_number)
);
create index if not exists live_match_boxes_year_day_session_idx on live_match_boxes (tournament_year, day, session);

create table if not exists live_hole_scores (
  id uuid primary key default gen_random_uuid(),
  player_slug text not null references player_slots(player_slug),
  round integer not null,
  hole integer not null check (hole between 1 and 18),
  score integer,
  putts integer,
  fir boolean,
  gir boolean,
  -- Fourball only: player did not finish, so the official score is double
  -- par. It remains a match/leaderboard fact but is excluded from player
  -- stats and historical odds samples.
  did_not_finish boolean not null default false,
  host_edited boolean not null default false,
  -- Set once the player's round partner confirms this entry matches their
  -- own count. Null means "entered, not yet confirmed" — the confirmation
  -- flow itself is a later phase, this column just makes room for it now.
  confirmed_by text references player_slots(player_slug),
  updated_at timestamptz not null default now(),
  unique (player_slug, round, hole)
);
create index if not exists live_hole_scores_round_idx on live_hole_scores (round);

create table if not exists live_round_state (
  round integer primary key,
  started boolean not null default false,
  course_id uuid references live_courses(id)
);

alter table live_courses enable row level security;
alter table live_match_boxes enable row level security;
alter table live_hole_scores enable row level security;
alter table live_round_state enable row level security;

-- All four are readable by anyone, signed in or not — matches the public
-- site's existing behavior (players and fans alike see live tournament
-- state, and nothing here is sensitive). Writes happen server-side with the
-- service-role key (bypasses RLS), same pattern as profiles — there is
-- deliberately no insert/update policy on any of these.
drop policy if exists live_courses_select_all on live_courses;
create policy live_courses_select_all on live_courses for select using (true);

drop policy if exists live_match_boxes_select_all on live_match_boxes;
create policy live_match_boxes_select_all on live_match_boxes for select using (true);

drop policy if exists live_hole_scores_select_all on live_hole_scores;
create policy live_hole_scores_select_all on live_hole_scores for select using (true);

drop policy if exists live_round_state_select_all on live_round_state;
create policy live_round_state_select_all on live_round_state for select using (true);

-- === Tiger Center: Setup (roster, round scheduling) =====================
-- Extends the Native Live Platform section above. Adds the pieces Tiger
-- needs to set up a tournament: how many rounds, who's on which team, and
-- each round's date/course/format with independent lock states.

create table if not exists live_tournament_settings (
  id boolean primary key default true,
  round_count integer check (round_count between 6 and 10),
  completed_at timestamptz,
  constraint live_tournament_settings_singleton check (id)
);

create table if not exists live_roster (
  player_slug text primary key references player_slots(player_slug),
  team text not null check (team in ('maroon', 'white'))
);

alter table live_round_state
  add column if not exists date date,
  add column if not exists format text check (format in ('Fourball', 'Foursome', 'Singles')),
  add column if not exists course_locked boolean not null default false,
  add column if not exists matchups_locked boolean not null default false;

-- Formats are three going forward (Foursome replaces the Scramble/Alternate
-- Shot split — see the Tiger Center Operations spec). Postgres names an
-- inline column check "<table>_<column>_check" by default, so this is the
-- real name of the constraint the Native Live Platform section created.
alter table live_match_boxes drop constraint if exists live_match_boxes_format_check;
alter table live_match_boxes add constraint live_match_boxes_format_check check (format in ('Fourball', 'Foursome', 'Singles'));

alter table live_tournament_settings enable row level security;
alter table live_roster enable row level security;

-- Same "public read, service-role writes" pattern as the rest of the live
-- tables — this is tournament setup info, not sensitive, and the public
-- site/Player Portal both need to read it.
drop policy if exists live_tournament_settings_select_all on live_tournament_settings;
create policy live_tournament_settings_select_all on live_tournament_settings for select using (true);

drop policy if exists live_roster_select_all on live_roster;
create policy live_roster_select_all on live_roster for select using (true);

-- === Tiger Center: Matchups ==============================================
-- Flattens live_match_boxes off the original 4-day/2-session/3-box grid
-- (ported from MM-Scorekeeper's Python model in the Native Live Platform
-- section above) onto the flexible round model Tiger Center Setup already
-- shipped (round_count 6-10, one flat live_round_state row per round) — the
-- old grid can only reach round 8 (4 days x 2 sessions) and caps at 3
-- boxes, which doesn't fit Singles' 6 boxes (12 players / 2 per box). See
-- the Tiger Center Operations spec's Matchups section.

alter table live_match_boxes add column if not exists round integer references live_round_state(round);

-- No real tournament has used this table yet (Matchups didn't exist until
-- this plan) — delete instead of guessing a day/session -> round backfill
-- mapping for any row that predates the round column.
delete from live_match_boxes where round is null;
alter table live_match_boxes alter column round set not null;

-- Dropping a column automatically drops any table constraint that
-- references it (check or unique) — no CASCADE needed, and this takes the
-- old (tournament_year, day, session, box_number) unique constraint and the
-- day/session check constraints with it.
alter table live_match_boxes drop column if exists day;
alter table live_match_boxes drop column if exists session;
alter table live_match_boxes drop column if exists tournament_year;

drop index if exists live_match_boxes_year_day_session_idx;
create index if not exists live_match_boxes_round_idx on live_match_boxes (round);

alter table live_match_boxes drop constraint if exists live_match_boxes_round_box_number_key;
alter table live_match_boxes add constraint live_match_boxes_round_box_number_key unique (round, box_number);

-- Singles is 12 players / 2 per box = 6 boxes; Fourball/Foursome stays 3.
alter table live_match_boxes drop constraint if exists live_match_boxes_box_number_check;
alter table live_match_boxes add constraint live_match_boxes_box_number_check check (box_number between 1 and 6);

-- === Tiger Center: Player Live Scoring ====================================
-- Tracks each player's own final submission for a match box (the ops
-- spec's "Submit Scores" action — one row per player once they've entered
-- everything they're responsible for and hit Submit). `on delete cascade`
-- is included from the start this time — the Matchups migration shipped
-- without one on `live_match_boxes.round` and it took two real bugs
-- (a stuck "Remove round" and a stale-format hazard) to fix; this table
-- inherits that lesson.

create table if not exists live_match_box_submissions (
  match_box_id uuid not null references live_match_boxes(id) on delete cascade,
  player_slug text not null references player_slots(player_slug),
  submitted_at timestamptz not null default now(),
  primary key (match_box_id, player_slug)
);

alter table live_match_box_submissions enable row level security;

drop policy if exists live_match_box_submissions_select_all on live_match_box_submissions;
create policy live_match_box_submissions_select_all on live_match_box_submissions for select using (true);

-- Postgres has no "add table if not exists" for publications, so this is
-- guarded manually — safe to re-run. Both tables need to be in this
-- publication for the scoring screen's Supabase Realtime subscriptions
-- (Task 9) to receive any events at all; RLS alone does not enable that.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_hole_scores'
  ) then
    alter publication supabase_realtime add table live_hole_scores;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_match_box_submissions'
  ) then
    alter publication supabase_realtime add table live_match_box_submissions;
  end if;
end $$;

-- === Tiger Center: Player Live Scoring — agreement indicator ==============
-- The `confirmed_by` column on live_hole_scores was reserved back in the
-- native-live-platform build for exactly this: "the confirmation flow
-- itself is a later phase, this column just makes room for it now." This
-- is that later phase, for Fourball/Singles: a player's own self-reported
-- stroke count (new column below) gets compared against the officially
-- entered score (written by their assigned scoring opponent); when they
-- agree, confirmed_by is set to that player's own slug.

alter table live_hole_scores add column if not exists self_reported_score integer;

-- === Player Bio Portal ===================================================
-- Lets a player edit their own public bio; every change needs Tiger's
-- approval before it's live (email isn't part of this — that's a Supabase
-- Auth setting). player_profile_edits is the pending queue a player writes
-- to and Tiger clears; player_profile_overrides is what the public bio page
-- reads on top of the static lib/data/players/*.ts baseline once approved.

create table if not exists player_profile_edits (
  player_slug text not null references player_slots(player_slug),
  field text not null,
  proposed_value jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (player_slug, field)
);

create table if not exists player_profile_overrides (
  player_slug text not null references player_slots(player_slug),
  field text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (player_slug, field)
);

alter table player_profile_edits enable row level security;
alter table player_profile_overrides enable row level security;

-- Both readable by anyone — matches the live_* tables' existing pattern.
-- The public bio page reads overrides with no auth. player_profile_edits
-- has NO select policy (see below) — it's not public.
drop policy if exists player_profile_edits_select_all on player_profile_edits;
-- player_profile_edits intentionally has NO policies — only the
-- service-role key (which bypasses RLS entirely) may read it. Pending
-- edits are unmoderated content; they shouldn't be publicly queryable
-- before Tiger has reviewed them. Same pattern as player_slots above.

drop policy if exists player_profile_overrides_select_all on player_profile_overrides;
create policy player_profile_overrides_select_all on player_profile_overrides for select using (true);

-- Approving is one atomic statement (move the value to overrides, remove
-- the pending row) — a SECURITY DEFINER function, same atomicity reasoning
-- as settle_mm_coin_market above. It takes p_submitted_at and matches it
-- against the stored row so it only ever approves the exact proposal Tiger
-- saw: if the player resubmitted after Tiger loaded the page but before
-- Tiger clicked Approve, the delete's WHERE won't match, GET DIAGNOSTICS
-- sees 0 rows, and this raises instead of silently promoting or discarding
-- content nobody reviewed. The DELETE...RETURNING feeding the INSERT (one
-- statement, not a SELECT then a separate DELETE) closes the earlier
-- version's race: a resubmission arriving between a read and a delete could
-- previously be deleted-but-never-applied. The UPSERT's ON CONFLICT still
-- matters because a player can have an older override for a field that's
-- now being re-approved after a second edit.
--
-- REVOKE EXECUTE FROM PUBLIC matters as much as the function body: Postgres
-- grants EXECUTE on a new function to PUBLIC by default, and PostgREST
-- exposes every public-schema function as an RPC callable by the anon key
-- shipped to the browser. Without the revoke, anyone could call this
-- directly over HTTP and skip approve/route.ts's requireHost() check
-- entirely — self-approving their own edits, or approving anyone's.
-- service_role (the only caller — see approve/route.ts) keeps access via
-- Supabase's own project-level grants, not anything in this file.
drop function if exists approve_profile_edit(text, text);
create or replace function approve_profile_edit(p_player_slug text, p_field text, p_submitted_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  with removed as (
    delete from player_profile_edits
    where player_slug = p_player_slug
      and field = p_field
      and submitted_at = p_submitted_at
    returning player_slug, field, proposed_value
  )
  insert into player_profile_overrides (player_slug, field, value, updated_at)
  select player_slug, field, proposed_value, now() from removed
  on conflict (player_slug, field) do update set value = excluded.value, updated_at = excluded.updated_at;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'No matching pending edit for % / % — it may have already been approved or the player resubmitted since this was loaded', p_player_slug, p_field;
  end if;
end;
$$;

revoke execute on function approve_profile_edit(text, text, timestamptz) from public;

-- === Tiger Center: Course rating & slope (for handicap calculations) ======
-- One rating/slope per course (not per tee box — this app has no tee-box
-- concept yet). Course Rating is a decimal (e.g. 72.4); Slope Rating is a
-- whole number, USGA range 55-155. Both nullable — existing courses saved
-- before this migration won't have them until someone edits/re-adds them.

alter table live_courses add column if not exists rating numeric;
alter table live_courses add column if not exists slope integer check (slope between 55 and 155);

-- === Tiger Center: Archived Scorecards & Shot Video ========================
-- Historical (already-played) tournaments' hole-by-hole scorecards, editable
-- by Tiger from the "Scorecards & Video" screen. Deliberately separate from
-- the live_* tables above — those track the *current/future* tournament's
-- live round cycle and have no year dimension; these are keyed by
-- tournament_slug because multiple past years coexist. player_slug here is
-- a PlayerProfile.slug (lib/data/players), NOT a player_slots foreign key —
-- historical data must be enterable for a player whether or not they've
-- ever claimed a site account.

create table if not exists archived_scorecard_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_slug text not null,
  player_slug text not null,
  round integer not null,
  course text not null,
  format text,
  created_at timestamptz not null default now(),
  unique (tournament_slug, player_slug, round)
);
create index if not exists archived_scorecard_rounds_tournament_idx on archived_scorecard_rounds (tournament_slug);

-- Added by supabase/archived_handicap_tees.sql, repeated here (idempotently)
-- so schema.sql stops drifting from what's actually needed in production —
-- this repo has hit the "migration file exists but wasn't captured in
-- schema.sql" gap before (the Courses & Format phase). Verified historical
-- course/tee snapshot for a round, set via the Tiger Center's "Assign tees
-- for handicap tracking" panel — independent of later course-library edits.
alter table archived_scorecard_rounds add column if not exists handicap_setup jsonb;
alter table archived_scorecard_rounds add column if not exists played_on date;

create table if not exists archived_scorecard_holes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references archived_scorecard_rounds(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  par integer not null,
  yards integer not null,
  score integer not null,
  putts integer not null,
  -- '0' | '1' | 'X' — 'X' means "not applicable" (a par-3 has no fairway),
  -- the same three-state convention lib/data/types.ts's HoleStat.fir
  -- already uses, kept as text here so that convention carries through
  -- unchanged rather than needing a translation layer on every read.
  fir text not null check (fir in ('0', '1', 'X')),
  gir boolean not null,
  -- Set whenever Tiger changes a value here from its migrated original —
  -- same convention live_hole_scores.host_edited already established.
  host_edited boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (round_id, hole)
);

create table if not exists archived_shot_videos (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references archived_scorecard_rounds(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  shot_number integer not null check (shot_number >= 1),
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  unique (round_id, hole, shot_number)
);

alter table archived_scorecard_rounds enable row level security;
alter table archived_scorecard_holes enable row level security;
alter table archived_shot_videos enable row level security;

-- Public read (fans/players see these on the real scorecard pages), no
-- write policy at all — every write goes through a host-only Route Handler
-- using the service-role key, same pattern as every other table above.
drop policy if exists archived_scorecard_rounds_select_all on archived_scorecard_rounds;
create policy archived_scorecard_rounds_select_all on archived_scorecard_rounds for select using (true);

drop policy if exists archived_scorecard_holes_select_all on archived_scorecard_holes;
create policy archived_scorecard_holes_select_all on archived_scorecard_holes for select using (true);

drop policy if exists archived_shot_videos_select_all on archived_shot_videos;
create policy archived_shot_videos_select_all on archived_shot_videos for select using (true);

-- Storage bucket for shot video. Public-read (so a fan's browser can just
-- play the file straight from its public URL), no write policy on
-- storage.objects for this bucket — uploads go through a host-only Route
-- Handler using the service-role key, which bypasses Storage RLS the same
-- way it bypasses table RLS.
insert into storage.buckets (id, name, public)
values ('shot-videos', 'shot-videos', true)
on conflict (id) do nothing;

-- === Watch Live Broadcast: Foundation (Phase 1) ==========================
-- See docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md.
-- Singleton tables, same shape as live_tournament_settings — there is no
-- season_year concept anywhere else in this schema yet (Master Settings is
-- still just a spec), so these don't invent one either. The event queue
-- (broadcast_events) is Phase 2 work, added once there's a rules engine to
-- write to it.

create table if not exists broadcast_config (
  id boolean primary key default true,
  scene_durations_ms jsonb not null default '{"individual_leaderboard":12000,"match_play":12000,"holding":10000}',
  priorities jsonb not null default '{}',
  overlay_duration_ms integer not null default 6000,
  audio jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint broadcast_config_singleton check (id)
);

create table if not exists broadcast_state (
  id boolean primary key default true,
  current_scene text not null default 'holding'
    check (current_scene in ('holding', 'individual_leaderboard', 'match_play')),
  scene_started_at timestamptz not null default now(),
  -- References broadcast_events(id) once that table exists (Phase 2).
  active_event_id uuid,
  automation_mode text not null default 'auto' check (automation_mode in ('auto', 'producer')),
  paused boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint broadcast_state_singleton check (id)
);

alter table broadcast_config enable row level security;
alter table broadcast_state enable row level security;

-- Public read, no write policy — the /broadcast page has no login, and
-- writes go through a host-only Route Handler with the service-role key,
-- same pattern as every table above.
drop policy if exists broadcast_config_select_all on broadcast_config;
create policy broadcast_config_select_all on broadcast_config for select using (true);

drop policy if exists broadcast_state_select_all on broadcast_state;
create policy broadcast_state_select_all on broadcast_state for select using (true);

insert into broadcast_config (id) values (true) on conflict (id) do nothing;
insert into broadcast_state (id) values (true) on conflict (id) do nothing;

-- === Tiger Center: Master Settings (multi-year) ==========================
-- Every table below moves from "one live tournament, implicitly 2027" to
-- "one row per season_year, 2027-2034." Existing real rows (the 2027
-- tournament actually being set up) are backfilled to season_year = 2027
-- before any not-null/key constraint is added, so nothing is lost. See
-- docs/superpowers/specs/2026-09-01-tiger-center-master-settings-design.md.

-- live_tournament_settings: singleton -> one row per year, gains venue/dates
alter table live_tournament_settings drop constraint if exists live_tournament_settings_singleton;
alter table live_tournament_settings add column if not exists season_year integer;
update live_tournament_settings set season_year = 2027 where season_year is null;
alter table live_tournament_settings alter column season_year set not null;
alter table live_tournament_settings drop constraint if exists live_tournament_settings_pkey;
alter table live_tournament_settings drop column if exists id;
alter table live_tournament_settings add constraint live_tournament_settings_season_year_check check (season_year between 2027 and 2034);
alter table live_tournament_settings add primary key (season_year);

alter table live_tournament_settings add column if not exists venue_name text;
alter table live_tournament_settings add column if not exists venue_locked boolean not null default false;
alter table live_tournament_settings add column if not exists begin_date date;
alter table live_tournament_settings add column if not exists end_date date;
alter table live_tournament_settings add column if not exists dates_locked boolean not null default false;

-- Seed 2027's row with what the static files already say, so the public
-- site shows the same thing before and after this migration.
update live_tournament_settings
  set venue_name = coalesce(venue_name, 'Mission Hills CC'),
      begin_date = coalesce(begin_date, '2027-01-06'),
      end_date = coalesce(end_date, '2027-01-09')
  where season_year = 2027;

-- live_round_state: round -> (season_year, round)
alter table live_round_state add column if not exists season_year integer;
update live_round_state set season_year = 2027 where season_year is null;
alter table live_round_state alter column season_year set not null;
-- live_match_boxes.round still references live_round_state(round) here —
-- that FK must be dropped before live_round_state's primary key below, or
-- Postgres refuses to drop a PK a live FK still depends on. It's
-- re-created against the new composite key once both tables have one (see
-- the live_match_boxes block further down).
alter table live_match_boxes drop constraint if exists live_match_boxes_round_fkey;
alter table live_round_state drop constraint if exists live_round_state_pkey;
alter table live_round_state add constraint live_round_state_season_year_check check (season_year between 2027 and 2034);
alter table live_round_state add primary key (season_year, round);

-- live_roster: player_slug -> (season_year, player_slug)
alter table live_roster add column if not exists season_year integer;
update live_roster set season_year = 2027 where season_year is null;
alter table live_roster alter column season_year set not null;
alter table live_roster drop constraint if exists live_roster_pkey;
alter table live_roster add constraint live_roster_season_year_check check (season_year between 2027 and 2034);
alter table live_roster add primary key (season_year, player_slug);

-- live_match_boxes: gains season_year, FK repointed at the new composite key
-- (the old round_fkey was already dropped above, before live_round_state's
-- old primary key was)
alter table live_match_boxes add column if not exists season_year integer;
update live_match_boxes set season_year = 2027 where season_year is null;
alter table live_match_boxes alter column season_year set not null;
alter table live_match_boxes add constraint live_match_boxes_season_year_round_fkey
  foreign key (season_year, round) references live_round_state (season_year, round);
alter table live_match_boxes drop constraint if exists live_match_boxes_round_box_number_key;
alter table live_match_boxes add constraint live_match_boxes_season_round_box_number_key
  unique (season_year, round, box_number);
drop index if exists live_match_boxes_round_idx;
create index if not exists live_match_boxes_season_round_idx on live_match_boxes (season_year, round);

-- live_hole_scores: gains season_year, widens the unique key. Unlike
-- live_match_boxes (indirectly bounded via its FK to the now-checked
-- live_round_state), this table has no FK on round/season_year at all —
-- matching its own pre-existing looseness — so it needs its own explicit
-- range check to keep every season_year column in this migration bounded
-- the same way.
alter table live_hole_scores add column if not exists season_year integer;
update live_hole_scores set season_year = 2027 where season_year is null;
alter table live_hole_scores alter column season_year set not null;
alter table live_hole_scores add constraint live_hole_scores_season_year_check check (season_year between 2027 and 2034);
alter table live_hole_scores drop constraint if exists live_hole_scores_player_slug_round_hole_key;
alter table live_hole_scores add constraint live_hole_scores_season_year_player_slug_round_hole_key
  unique (season_year, player_slug, round, hole);
drop index if exists live_hole_scores_round_idx;
create index if not exists live_hole_scores_season_round_idx on live_hole_scores (season_year, round);

-- New: which year is actually live for the public site / player scoring —
-- independent of whichever year Tiger happens to be viewing in Master
-- Settings.
create table if not exists live_active_season (
  id boolean primary key default true,
  season_year integer not null check (season_year between 2027 and 2034),
  constraint live_active_season_singleton check (id)
);
insert into live_active_season (id, season_year) values (true, 2027) on conflict (id) do nothing;

alter table live_active_season enable row level security;
drop policy if exists live_active_season_select_all on live_active_season;
create policy live_active_season_select_all on live_active_season for select using (true);

-- === Watch Live Broadcast: catch up to season_year ========================
-- broadcast_config/broadcast_state were built singleton (see their create
-- table statements above) because at the time Master Settings hadn't shipped
-- yet. It has now (see the section above this one), so these two follow the
-- exact same singleton -> one-row-per-year migration every live_* table
-- just went through, backfilled to season_year = 2027 the same way.

-- broadcast_state needs to be in the Realtime publication for Tiger's scene
-- overrides (Broadcast Controls) to reach an open /broadcast tab instantly.
-- live_match_boxes was never added despite components/portal/ScoringPanel.tsx-
-- style code elsewhere subscribing to it — fixed here too, since Watch Live
-- Broadcast's own live-update wiring depends on it actually firing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'broadcast_state'
  ) then
    alter publication supabase_realtime add table broadcast_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_match_boxes'
  ) then
    alter publication supabase_realtime add table live_match_boxes;
  end if;
end $$;

alter table broadcast_config drop constraint if exists broadcast_config_singleton;
alter table broadcast_config add column if not exists season_year integer;
update broadcast_config set season_year = 2027 where season_year is null;
alter table broadcast_config alter column season_year set not null;
alter table broadcast_config drop constraint if exists broadcast_config_pkey;
alter table broadcast_config drop column if exists id;
alter table broadcast_config add constraint broadcast_config_season_year_check check (season_year between 2027 and 2034);
alter table broadcast_config add primary key (season_year);

alter table broadcast_state drop constraint if exists broadcast_state_singleton;
alter table broadcast_state add column if not exists season_year integer;
update broadcast_state set season_year = 2027 where season_year is null;
alter table broadcast_state alter column season_year set not null;
alter table broadcast_state drop constraint if exists broadcast_state_pkey;
alter table broadcast_state drop column if exists id;
alter table broadcast_state add constraint broadcast_state_season_year_check check (season_year between 2027 and 2034);
alter table broadcast_state add primary key (season_year);

-- Host-triggered announcement banner (a manual overlay, not the full
-- broadcast_events queue — that's a bigger Phase 2 build for once real
-- score-confirmation events exist to feed it; a single at-a-time overlay
-- doesn't need a queue). null overlay_text means "nothing to show."
alter table broadcast_state add column if not exists overlay_text text;
alter table broadcast_state add column if not exists overlay_expires_at timestamptz;

-- === Watch Live Broadcast: display year + Go Live ========================
-- Broadcast Controls now lives on the main Tiger Center page (not nested
-- inside a per-year Master Settings screen), so /broadcast needs its own
-- notion of "which year's data is showing" — deliberately independent of
-- live_active_season (that flag still governs the real scoring system;
-- picking an old year here to look at is just a display choice, it must
-- never affect what players are actually scoring against).

create table if not exists broadcast_display_year (
  id boolean primary key default true,
  season_year integer not null default 2027 check (season_year between 2024 and 2034),
  constraint broadcast_display_year_singleton check (id)
);
insert into broadcast_display_year (id, season_year) values (true, 2027) on conflict (id) do nothing;

alter table broadcast_display_year enable row level security;
drop policy if exists broadcast_display_year_select_all on broadcast_display_year;
create policy broadcast_display_year_select_all on broadcast_display_year for select using (true);

-- "Go Live" — before this, /broadcast always shows the Holding scene
-- regardless of rotation/producer mode, same as a real broadcast's
-- pre-show hold. Per season_year, same as every other broadcast_state
-- column (Tiger could go live on 2026 just to demo the look, independent
-- of 2027's real state).
alter table broadcast_state add column if not exists tournament_live boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'broadcast_display_year'
  ) then
    alter publication supabase_realtime add table broadcast_display_year;
  end if;
end $$;

-- Fix: "Go Live" while previewing 2026 (a valid DISPLAY_YEARS entry — see
-- lib/broadcast/displayYears.ts) was failing with "Could not go live."
-- because this table's season_year check only allowed 2027-2034, while
-- broadcast_display_year (the year picker's source of truth) allows
-- 2024-2034. Widen this one to match so any previewable year can go live,
-- per the comment above ("Tiger could go live on 2026 just to demo the look").
alter table broadcast_state drop constraint if exists broadcast_state_season_year_check;
alter table broadcast_state add constraint broadcast_state_season_year_check check (season_year between 2024 and 2034);

-- === Watch Live Broadcast: Phase 2 (Event Queue) ==========================
-- See docs/superpowers/specs/2026-09-04-broadcast-event-queue-design.md.

create table if not exists broadcast_events (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2027 and 2034),
  kind text not null check (kind in (
    'SCORE_POSTED', 'MATCH_STATE_CHANGED', 'MATCH_WON', 'ROUND_STARTED', 'ROUND_FINAL'
  )),
  priority integer not null,
  status text not null default 'pending' check (status in (
    'pending', 'queued', 'ready', 'playing', 'played', 'expired', 'dismissed'
  )),
  payload jsonb not null default '{}',
  match_box_id uuid,
  player_slug text,
  round integer,
  hole integer,
  source text not null default 'system' check (source in ('system', 'host')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcast_events_queue_idx
  on broadcast_events (season_year, status, priority desc, created_at asc);

alter table broadcast_events enable row level security;
drop policy if exists broadcast_events_select_all on broadcast_events;
create policy broadcast_events_select_all on broadcast_events for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'broadcast_events'
  ) then
    alter publication supabase_realtime add table broadcast_events;
  end if;
end $$;

-- === Watch Live Broadcast: Phase 4a (Overlay/Takeover UI) =================
-- See docs/superpowers/specs/2026-09-04-broadcast-overlay-takeover-design.md.
-- overlay_duration_ms already exists (Phase 1) — this is its takeover-class
-- counterpart, same shape.
alter table broadcast_config add column if not exists takeover_duration_ms integer not null default 8000;

-- === Watch Live Broadcast: Playlist ========================================
-- See docs/superpowers/specs/2026-09-04-watch-live-player-playlist-design.md.
-- Host-uploaded audio for /watch-live's player, tied to Go Live/End
-- Broadcast (no separate on/off switch). Same season_year-scoped,
-- public-read/service-role-write convention as every broadcast_* table.

create table if not exists broadcast_playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2024 and 2034),
  title text not null,
  storage_path text not null,
  duration_seconds numeric not null check (duration_seconds > 0),
  uploaded_at timestamptz not null default now()
);
create index if not exists broadcast_playlist_tracks_season_idx on broadcast_playlist_tracks (season_year, uploaded_at);

alter table broadcast_playlist_tracks enable row level security;
drop policy if exists broadcast_playlist_tracks_select_all on broadcast_playlist_tracks;
create policy broadcast_playlist_tracks_select_all on broadcast_playlist_tracks for select using (true);

-- Which track anchors playback, when it started (offset 0), and whether it
-- loops alone or cycles through the whole playlist — every client derives
-- "which track, how far into it" from these via
-- lib/broadcast/playlistPlayback.ts's playlistTickAt(), the same anchor-
-- timestamp approach broadcast_state.scene_started_at already uses for
-- scene rotation.
alter table broadcast_state add column if not exists audio_track_id uuid references broadcast_playlist_tracks(id) on delete set null;
alter table broadcast_state add column if not exists audio_started_at timestamptz;
alter table broadcast_state add column if not exists audio_loop_mode text not null default 'all' check (audio_loop_mode in ('one', 'all'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'broadcast_playlist_tracks'
  ) then
    alter publication supabase_realtime add table broadcast_playlist_tracks;
  end if;
end $$;

-- Shuffle toggle for loop_mode 'all' — see lib/broadcast/playlistPlayback.ts's
-- playlistTickAt(), which derives a deterministic shuffle from
-- audio_track_id + audio_started_at, so every viewer computes the same
-- order without a new random-order column. Ignored entirely when
-- audio_loop_mode is 'one'.
alter table broadcast_state add column if not exists audio_shuffle boolean not null default false;

-- === Player Handicap Tracker ================================================
-- Personal (non-tournament) rounds a player logs from /portal to build a real
-- WHS handicap index. Deliberately separate from live_hole_scores (tournament
-- rounds) and archived_scorecard_rounds (Tiger-entered historical tournament
-- scorecards) — this is player-entered, not tournament-tied, and private to
-- the player (plus Tiger) rather than publicly readable.
--
-- Depends on live_courses.tee_sets (jsonb), added by
-- supabase/course_library_tee_setups.sql. Repeated here (idempotently) so
-- schema.sql stops being out of sync with what this feature needs — this
-- repo has hit exactly this "migration file exists but wasn't captured in
-- schema.sql, and might not have been run in production" gap before (the
-- Courses & Format phase).
alter table live_courses add column if not exists tee_sets jsonb not null default '[]'::jsonb;

create table if not exists handicap_rounds (
  id uuid primary key default gen_random_uuid(),
  player_slug text not null references player_slots(player_slug),
  course_id uuid not null references live_courses(id),
  tee_set_id text not null,
  tee_set_name text not null,       -- snapshot: a later course-library edit must never change a past round's math
  rating numeric not null,
  slope integer not null check (slope between 55 and 155),
  date_played date not null,
  tee_time text,                    -- freeform "HH:MM", no timezone concerns for a personal round
  total_score integer not null,
  differential numeric not null,    -- (total_score - rating) * 113 / slope, rounded to 1 decimal
  created_at timestamptz not null default now()
);
create index if not exists handicap_rounds_player_idx on handicap_rounds (player_slug, date_played desc);

create table if not exists handicap_round_holes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references handicap_rounds(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  par integer not null,
  yards integer not null,
  score integer not null,
  putts integer not null,
  fir text not null check (fir in ('0', '1', 'X')),
  gir boolean not null,
  unique (round_id, hole)
);

alter table handicap_rounds enable row level security;
alter table handicap_round_holes enable row level security;

-- Private to the player (plus service-role, which bypasses RLS entirely for
-- every write and for the Route Handlers' own reads) — unlike live_courses/
-- live_hole_scores, this is not public tournament data. Matches
-- profiles_select_own's auth.uid()-based pattern rather than the
-- "select using (true)" pattern used for public live_* tables.
drop policy if exists handicap_rounds_select_own on handicap_rounds;
create policy handicap_rounds_select_own on handicap_rounds for select
  using (player_slug = (select player_slug from profiles where id = auth.uid()));

drop policy if exists handicap_round_holes_select_own on handicap_round_holes;
create policy handicap_round_holes_select_own on handicap_round_holes for select
  using (round_id in (select id from handicap_rounds where player_slug = (select player_slug from profiles where id = auth.uid())));
```

## supabase/player_slots_email.sql

```sql
-- Run once in Supabase after schema.sql.
-- Remembers the email address Tiger last sent a player's invite to, so
-- "Send Invite" can pre-fill it instead of asking again on a resend.
-- Same RLS posture as the rest of player_slots (no policies — only the
-- service-role key ever reads/writes it).
alter table player_slots add column if not exists email text;

comment on column player_slots.email is 'Address Tiger sent the invite to. Optional — null until a first invite is sent.';
```

## supabase/career_live_archive.sql

```sql
-- Run once in the Supabase SQL Editor. This is the live extension of the
-- Career Archive: matchups create the round shells; a trigger mirrors every
-- player score/stat edit into its canonical archived hole row.

create table if not exists career_archive_rounds (
  season_year integer not null check (season_year between 2027 and 2034),
  round integer not null,
  player_slug text not null references player_slots(player_slug),
  course text not null,
  played_on date,
  format text not null,
  match_box_id uuid references live_match_boxes(id) on delete set null,
  partner_slug text references player_slots(player_slug),
  opponent_slugs text[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  holes jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_year, round, player_slug)
);

create table if not exists career_archive_live_holes (
  season_year integer not null check (season_year between 2027 and 2034),
  round integer not null,
  player_slug text not null references player_slots(player_slug),
  hole integer not null check (hole between 1 and 18),
  score integer,
  putts integer,
  fir boolean,
  gir boolean,
  did_not_finish boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (season_year, round, player_slug, hole),
  foreign key (season_year, round, player_slug) references career_archive_rounds(season_year, round, player_slug) on delete cascade
);

alter table career_archive_rounds enable row level security;
alter table career_archive_live_holes enable row level security;
create policy career_archive_rounds_select_all on career_archive_rounds for select using (true);
create policy career_archive_live_holes_select_all on career_archive_live_holes for select using (true);

create or replace function mirror_live_score_to_career_archive() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into career_archive_live_holes (season_year, round, player_slug, hole, score, putts, fir, gir, updated_at)
  values (new.season_year, new.round, new.player_slug, new.hole, new.score, new.putts, new.fir, new.gir, now())
  on conflict (season_year, round, player_slug, hole) do update set score = excluded.score, putts = excluded.putts, fir = excluded.fir, gir = excluded.gir, updated_at = now();
  update career_archive_rounds set status = 'live', updated_at = now() where season_year = new.season_year and round = new.round and player_slug = new.player_slug;
  return new;
end;
$$;
drop trigger if exists mirror_live_score_to_career_archive_trigger on live_hole_scores;
create trigger mirror_live_score_to_career_archive_trigger after insert or update on live_hole_scores for each row execute function mirror_live_score_to_career_archive();
```

## supabase/live_match_publication.sql

```sql
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
      cross join lateral jsonb_array_elements(coalesce(round_state.course_setup -> 'holes', course.holes)) hole_data
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
```

## supabase/course_library_location.sql

```sql
-- Run once in Supabase after course_library_tee_setups.sql.
-- Optional location fields for a course. City/state are shown to players
-- (e.g. "The Colony, TX"); zip is stored for a future "nearby courses"
-- lookup and is never displayed.
alter table live_courses add column if not exists city text;
alter table live_courses add column if not exists state text;
alter table live_courses add column if not exists zip_code text;

comment on column live_courses.city is 'Display-only, e.g. "The Colony". Optional.';
comment on column live_courses.state is 'Two-letter US state code, e.g. "TX". Optional.';
comment on column live_courses.zip_code is 'Optional. Reserved for a future nearby-courses lookup; never shown in the UI.';
```

## supabase/course_library_tee_setups.sql

```sql
-- Run once in Supabase after live_match_publication.sql.
-- A course is global. A tee set is a named 18-hole yardage/rating/slope
-- configuration within that course. A round snapshots its selected tee set
-- plus any hole-by-hole override, so “Palmer” never becomes Palmer 1/2/3.
-- Older projects may have the original live_courses shape without these
-- optional rating fields, so make this migration self-contained.
alter table live_courses add column if not exists rating numeric;
alter table live_courses add column if not exists slope integer check (slope between 55 and 155);
alter table live_courses add column if not exists tee_sets jsonb not null default '[]'::jsonb;
alter table live_round_state add column if not exists course_setup jsonb;

-- Turn every pre-existing course row into a first editable tee set.
update live_courses
set tee_sets = jsonb_build_array(jsonb_build_object(
  'id', 'standard',
  'name', 'Standard',
  'holes', holes,
  'rating', rating,
  'slope', slope
))
where tee_sets = '[]'::jsonb;

comment on column live_courses.tee_sets is 'Named tee configurations with 18 hole par/yardage values and rating/slope.';
comment on column live_round_state.course_setup is 'Immutable round setup: selected tee set plus hole-by-hole tee overrides.';
```

## supabase/archived_handicap_tees.sql

```sql
-- Run once before deploying archived tee assignment.
alter table public.archived_scorecard_rounds add column if not exists handicap_setup jsonb;
alter table public.archived_scorecard_rounds add column if not exists played_on date;
alter table public.career_archive_rounds add column if not exists handicap_setup jsonb;
comment on column public.archived_scorecard_rounds.handicap_setup is 'Verified historical course/tee snapshot, independent of later library edits.';
comment on column public.career_archive_rounds.handicap_setup is 'Tiger locked course setup copied to each player archive before play.';
```

## supabase/round_format_setups.sql

```sql
-- Run after archived_handicap_tees.sql and course_library_tee_setups.sql.
begin;
create table if not exists public.round_format_setups (
  season_year integer not null check (season_year between 2000 and 2200),
  round integer not null check (round >= 0),
  course_name text not null,
  played_on date not null,
  tee_setup jsonb not null,
  source text not null default 'archive' check (source in ('archive','live')),
  updated_at timestamptz not null default now(),
  primary key (season_year, round)
);
alter table public.round_format_setups enable row level security;
grant select on public.round_format_setups to anon, authenticated;
grant all on public.round_format_setups to service_role;
drop policy if exists round_format_setups_read on public.round_format_setups;
create policy round_format_setups_read on public.round_format_setups for select using (true);

-- Preserve prior assignments only when the field agrees on the setup/date.
insert into public.round_format_setups(season_year, round, course_name, played_on, tee_setup)
select substring(tournament_slug from 1 for 4)::integer, round, min(course), min(played_on), (array_agg(handicap_setup))[1]
from public.archived_scorecard_rounds
where tournament_slug ~ '^[0-9]{4}-' and handicap_setup is not null and played_on is not null
group by substring(tournament_slug from 1 for 4)::integer, round
having count(distinct handicap_setup) = 1 and count(distinct played_on) = 1
on conflict (season_year, round) do nothing;

create or replace function public.archive_locked_round_setup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Once play starts, library edits must not change the historical snapshot.
  if tg_op = 'UPDATE' and old.started then return new; end if;
  if new.course_locked and new.matchups_locked and new.course_setup is not null and new.date is not null then
    insert into round_format_setups(season_year, round, course_name, played_on, tee_setup, source)
    select new.season_year, new.round, name, new.date,
      new.course_setup || jsonb_build_object('courseId',new.course_id), 'live'
    from live_courses where id = new.course_id
    on conflict (season_year, round) do update set course_name = excluded.course_name,
      played_on = excluded.played_on, tee_setup = excluded.tee_setup, updated_at = now()
    where round_format_setups.source = 'live';
  end if;
  return new;
end;
$$;
drop trigger if exists archive_locked_round_setup_trigger on public.live_round_state;
create trigger archive_locked_round_setup_trigger after insert or update on public.live_round_state
for each row execute function public.archive_locked_round_setup();

-- Existing locked live rounds already have verified snapshots.
insert into public.round_format_setups(season_year, round, course_name, played_on, tee_setup, source)
select r.season_year, r.round, c.name, r.date, r.course_setup || jsonb_build_object('courseId',r.course_id), 'live'
from public.live_round_state r join public.live_courses c on c.id = r.course_id
where r.course_locked and r.matchups_locked and r.course_setup is not null and r.date is not null
on conflict (season_year, round) do nothing;
commit;
```

## supabase/hole_shot_directions.sql

```sql
-- Run once in Supabase after schema.sql. Adds optional miss-direction
-- tracking alongside the existing fir/gir hit-or-miss columns — purely
-- additive, doesn't change what fir/gir mean or touch the handicap formula.
alter table handicap_round_holes add column if not exists fir_direction text check (fir_direction in ('left', 'right', 'short', 'long'));
alter table handicap_round_holes add column if not exists gir_direction text check (gir_direction in ('left', 'right', 'short', 'long'));
alter table live_hole_scores add column if not exists fir_direction text check (fir_direction in ('left', 'right', 'short', 'long'));
alter table live_hole_scores add column if not exists gir_direction text check (gir_direction in ('left', 'right', 'short', 'long'));

comment on column handicap_round_holes.fir_direction is 'Which way the fairway shot missed, if it missed. Null = hit, or not recorded.';
comment on column handicap_round_holes.gir_direction is 'Which way the approach missed the green, if it missed. Null = hit, or not recorded.';
comment on column live_hole_scores.fir_direction is 'Which way the fairway shot missed, if it missed. Null = hit, or not recorded.';
comment on column live_hole_scores.gir_direction is 'Which way the approach missed the green, if it missed. Null = hit, or not recorded.';
```

## supabase/hole_shot_directions_penalty.sql

```sql
-- Run once in Supabase after hole_shot_directions.sql. Adds "penalty" as a
-- valid gir_direction value — a missed green because of a penalty stroke or
-- lost ball, not a directional miss. Fairway direction is untouched; penalty
-- is GIR-only. Postgres names an unnamed inline check constraint
-- "<table>_<column>_check" by default, which is what the original
-- hole_shot_directions.sql migration left behind — this drops and replaces
-- just that constraint, the column itself already exists.
alter table handicap_round_holes drop constraint if exists handicap_round_holes_gir_direction_check;
alter table handicap_round_holes add constraint handicap_round_holes_gir_direction_check check (gir_direction in ('left', 'right', 'short', 'long', 'penalty'));
alter table live_hole_scores drop constraint if exists live_hole_scores_gir_direction_check;
alter table live_hole_scores add constraint live_hole_scores_gir_direction_check check (gir_direction in ('left', 'right', 'short', 'long', 'penalty'));
```

## supabase/live_hole_submissions.sql

```sql
-- Apply after live_match_publication.sql and course_library_tee_setups.sql.
-- Submit Score is one atomic transaction. Deploy this before the scoring UI.
begin;

create table if not exists public.live_hole_submissions (
  match_box_id uuid not null references public.live_match_boxes(id) on delete cascade,
  player_slug text not null references public.player_slots(player_slug),
  hole integer not null check (hole between 1 and 18),
  payload jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (match_box_id, player_slug, hole)
);
alter table public.live_hole_submissions enable row level security;
grant select on public.live_hole_submissions to authenticated;
grant all on public.live_hole_submissions to service_role;
drop policy if exists live_hole_submissions_read on public.live_hole_submissions;
create policy live_hole_submissions_read on public.live_hole_submissions for select to authenticated
using (exists (
  select 1 from public.live_match_boxes b join public.profiles p on p.id = auth.uid()
  where b.id = match_box_id and (p.is_host or p.player_slug = any(b.maroon_players || b.white_players))
));

create or replace function public.submit_live_hole(p_year integer, p_round integer, p_hole integer, p_player text, p_actor uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b live_match_boxes%rowtype;
  r live_round_state%rowtype;
  h jsonb;
  v_player text;
  v_own text[];
  v_other text[];
  v_mine jsonb;
  v_theirs jsonb;
  v_confirmed boolean;
  v_par integer;
  v_result jsonb;
begin
  if not exists (select 1 from profiles where id = p_actor and player_slug = p_player) then
    raise exception 'Not authorized.';
  end if;
  if p_hole is null or p_hole not between 1 and 18 then raise exception 'Invalid hole.'; end if;
  -- Serialize both scorers and simultaneous retries on the match row.
  select * into b from live_match_boxes where season_year = p_year and round = p_round
    and p_player = any(maroon_players || white_players) for update;
  if not found then raise exception 'No assigned match.'; end if;
  if not b.started or b.state = 'Final' or (b.state <> 'Live' and b.tee_time > now()) then
    raise exception 'This match is not open for scoring.';
  end if;
  select * into r from live_round_state where season_year = p_year and round = p_round;
  if not found or not r.started or not r.course_locked or not r.matchups_locked then
    raise exception 'This round is not open for scoring.';
  end if;
  select item into h from jsonb_array_elements(coalesce(r.course_setup->'holes', (select holes from live_courses where id = r.course_id), '[]'::jsonb)) item
    where (item->>'number')::integer = p_hole;
  v_par := (h->>'par')::integer;
  if v_par is null then raise exception 'Hole setup is missing.'; end if;
  if coalesce(jsonb_typeof(p_payload->'ownScore'), '') <> 'number'
    or coalesce(jsonb_typeof(p_payload->'opponentScore'), '') <> 'number'
    or coalesce(p_payload->>'ownScore', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_payload->>'opponentScore', '') !~ '^[1-9][0-9]*$' then
    raise exception 'Both scores are required.';
  end if;
  if b.format <> 'Foursome' then
    if coalesce(jsonb_typeof(p_payload->'putts'), '') <> 'number'
      or coalesce(p_payload->>'putts', '') !~ '^[0-9]+$'
      or (p_payload->>'putts')::integer > (p_payload->>'ownScore')::integer
      or coalesce(p_payload->>'green', '') not in ('hit','long','short','left','right','penalty')
      or (v_par <> 3 and coalesce(p_payload->>'fairway', '') not in ('hit','long','short','left','right','penalty')) then
      raise exception 'Not all information is complete. Enter putts, fairway, and green results.';
    end if;
  end if;
  if v_par = 3 or b.format = 'Foursome' then p_payload := jsonb_set(p_payload, '{fairway}', 'null'); end if;
  if b.format = 'Foursome' then
    p_payload := p_payload || '{"putts":null,"green":null}'::jsonb;
  end if;
  insert into live_hole_submissions(match_box_id, player_slug, hole, payload, submitted_at)
    values (b.id, p_player, p_hole, p_payload, clock_timestamp())
    on conflict (match_box_id, player_slug, hole) do update set payload = excluded.payload, submitted_at = excluded.submitted_at;

  foreach v_player in array (b.maroon_players || b.white_players) loop
    if v_player = any(b.maroon_players) then v_own := b.maroon_players; v_other := b.white_players;
    else v_own := b.white_players; v_other := b.maroon_players; end if;
    if b.format <> 'Foursome' then
      v_other := array[v_other[array_position(v_own, v_player)]];
      v_own := array[v_player];
    end if;
    select payload into v_mine from live_hole_submissions where match_box_id = b.id and hole = p_hole and player_slug = any(v_own)
      order by submitted_at desc, player_slug limit 1;
    select payload into v_theirs from live_hole_submissions where match_box_id = b.id and hole = p_hole and player_slug = any(v_other)
      order by submitted_at desc, player_slug limit 1;
    if v_mine is null and v_theirs is null then continue; end if;
    -- Both comparisons must agree. One disagreement retracts BOTH sides of the pair.
    v_confirmed := coalesce(v_mine->>'ownScore' = v_theirs->>'opponentScore'
      and v_mine->>'opponentScore' = v_theirs->>'ownScore', false);
    insert into live_hole_scores(season_year, round, hole, player_slug, score, self_reported_score, putts, fir, gir, fir_direction, gir_direction, confirmed_by, did_not_finish, updated_at)
    values (p_year, p_round, p_hole, v_player, (v_theirs->>'opponentScore')::integer, (v_mine->>'ownScore')::integer,
      (v_mine->>'putts')::integer, case when v_mine->>'fairway' is null then null else v_mine->>'fairway' = 'hit' end,
      case when v_mine->>'green' is null then null else v_mine->>'green' = 'hit' end,
      nullif(v_mine->>'fairway','hit'), nullif(v_mine->>'green','hit'), case when v_confirmed then v_player else null end, false, now())
    on conflict (season_year, player_slug, round, hole) do update set
      score = excluded.score, self_reported_score = excluded.self_reported_score, putts = excluded.putts,
      fir = excluded.fir, gir = excluded.gir, fir_direction = excluded.fir_direction, gir_direction = excluded.gir_direction,
      confirmed_by = excluded.confirmed_by, did_not_finish = false, updated_at = now();
    -- The existing mirror trigger publishes confirmed rows and retracts disputed ones.
    if (select count(*) from live_hole_scores where season_year = p_year and round = p_round and player_slug = v_player and confirmed_by is not null) = 18 then
      insert into live_match_box_submissions(match_box_id, player_slug) values (b.id, v_player)
        on conflict (match_box_id, player_slug) do update set submitted_at = now();
    else
      delete from live_match_box_submissions where match_box_id = b.id and player_slug = v_player;
    end if;
  end loop;
  insert into live_score_audit_events(season_year, match_box_id, round, hole, player_slug, actor_profile_id, kind, payload)
    values(p_year, b.id, p_round, p_hole, p_player, p_actor, 'score_entered', p_payload);
  select coalesce(jsonb_agg(payload || jsonb_build_object('player',player_slug,'hole',hole,'submittedAt',submitted_at) order by submitted_at), '[]'::jsonb)
    into v_result from live_hole_submissions where match_box_id = b.id;
  return jsonb_build_object('matchBoxId', b.id, 'submissions', v_result);
end;
$$;
revoke all on function public.submit_live_hole(integer,integer,integer,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.submit_live_hole(integer,integer,integer,text,uuid,jsonb) to service_role;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'live_hole_submissions'
  ) then alter publication supabase_realtime add table public.live_hole_submissions; end if;
end $$;
commit;
```

## supabase/scoring_reliability.sql

```sql
-- Apply after live_hole_submissions.sql, round_format_setups.sql and hole_shot_directions_penalty.sql.
begin;
alter table handicap_rounds add column if not exists submission_id uuid;
alter table handicap_rounds add column if not exists submission_payload jsonb;
create unique index if not exists handicap_rounds_submission_key on handicap_rounds(player_slug, submission_id);

create or replace function save_handicap_round_atomic(p_player text, p_request uuid, p_round jsonb, p_holes jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_payload jsonb; h jsonb;
begin
  if p_request is null then raise exception 'Refresh the page before submitting.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_player || p_request::text));
  select id,submission_payload into v_id,v_payload from handicap_rounds where player_slug=p_player and submission_id=p_request;
  if found then
    if v_payload is distinct from jsonb_build_object('round',p_round,'holes',p_holes) then raise exception 'This round was already submitted with different entries.'; end if;
    return v_id;
  end if;
  if jsonb_array_length(p_holes)<>18 or (select count(distinct (x->>'hole')::int) from jsonb_array_elements(p_holes) x)<>18 then raise exception 'Complete all 18 holes.'; end if;
  for h in select * from jsonb_array_elements(p_holes) loop
    if (h->>'hole')::int not between 1 and 18 or (h->>'score')::int<1 or (h->>'putts')::int not between 0 and (h->>'score')::int then raise exception 'Invalid hole entries.'; end if;
  end loop;
  insert into handicap_rounds(player_slug,course_id,tee_set_id,tee_set_name,rating,slope,date_played,tee_time,total_score,differential,submission_id,submission_payload)
  values(p_player,(p_round->>'course_id')::uuid,p_round->>'tee_set_id',p_round->>'tee_set_name',(p_round->>'rating')::numeric,(p_round->>'slope')::int,(p_round->>'date_played')::date,p_round->>'tee_time',(p_round->>'total_score')::int,(p_round->>'differential')::numeric,p_request,jsonb_build_object('round',p_round,'holes',p_holes)) returning id into v_id;
  insert into handicap_round_holes(round_id,hole,par,yards,score,putts,fir,gir,fir_direction,gir_direction)
  select v_id,(x->>'hole')::int,(x->>'par')::int,(x->>'yards')::int,(x->>'score')::int,(x->>'putts')::int,x->>'fir',(x->>'gir')::boolean,x->>'fir_direction',x->>'gir_direction' from jsonb_array_elements(p_holes) x;
  return v_id;
end $$;
revoke all on function save_handicap_round_atomic(text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function save_handicap_round_atomic(text,uuid,jsonb,jsonb) to service_role;

create table if not exists live_submission_receipts (
  player_slug text not null, request_id uuid not null, payload jsonb not null, result jsonb not null,
  primary key(player_slug,request_id)
);
alter table live_submission_receipts enable row level security;
grant all on live_submission_receipts to service_role;
create table if not exists live_publication_jobs (
  match_box_id uuid primary key references live_match_boxes(id) on delete cascade,
  season_year int not null, revision bigint not null default 1, completed boolean not null default false, updated_at timestamptz not null default now()
);
alter table live_publication_jobs enable row level security;
grant all on live_publication_jobs to service_role;
create or replace function queue_live_publication() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into live_publication_jobs(match_box_id,season_year)
  select id,season_year from live_match_boxes where season_year=new.season_year and round=new.round and new.player_slug=any(maroon_players||white_players)
  on conflict(match_box_id) do update set revision=live_publication_jobs.revision+1,completed=false,updated_at=now();
  return new;
end $$;
drop trigger if exists queue_live_publication_trigger on live_hole_scores;
create trigger queue_live_publication_trigger after insert or update on live_hole_scores for each row execute function queue_live_publication();

create or replace function submit_live_hole_reliable(p_year int,p_round int,p_hole int,p_player text,p_actor uuid,p_payload jsonb,p_request uuid,p_box uuid,p_expected timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old live_submission_receipts%rowtype; v_result jsonb; v_payload jsonb; v_saved timestamptz; b live_match_boxes%rowtype; own_players text[];
begin
  if not exists(select 1 from profiles where id=p_actor and player_slug=p_player) then raise exception 'Not authorized.'; end if;
  if p_request is null then raise exception 'Refresh scoring before submitting.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_player || p_request::text));
  v_payload:=jsonb_build_object('box',p_box,'year',p_year,'round',p_round,'hole',p_hole,'entry',p_payload);
  select * into v_old from live_submission_receipts where player_slug=p_player and request_id=p_request;
  if found then
    if v_old.payload<>v_payload then raise exception 'Submission identifier already used.'; end if;
    return v_old.result;
  end if;
  select * into b from live_match_boxes where id=p_box and season_year=p_year and round=p_round and p_player=any(maroon_players||white_players) for update;
  if not found then raise exception 'This saved submission belongs to a different match. Reopen your assigned match.'; end if;
  own_players:=array[p_player];
  if b.format='Foursome' then own_players:=case when p_player=any(b.maroon_players) then b.maroon_players else b.white_players end; end if;
  select max(submitted_at) into v_saved from live_hole_submissions where match_box_id=p_box and hole=p_hole and player_slug=any(own_players);
  if v_saved is distinct from p_expected then raise exception 'This hole changed on another device. Review the saved entries before resubmitting.'; end if;
  v_result:=submit_live_hole(p_year,p_round,p_hole,p_player,p_actor,p_payload);
  insert into live_submission_receipts values(p_player,p_request,v_payload,v_result);
  return v_result;
end $$;
revoke all on function submit_live_hole_reliable(int,int,int,text,uuid,jsonb,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function submit_live_hole_reliable(int,int,int,text,uuid,jsonb,uuid,uuid,timestamptz) to service_role;

-- Compare the revision while holding the same match lock as score submission.
create or replace function publish_match_revision(p_box uuid,p_revision bigint,p_state jsonb,p_odds jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare b live_match_boxes%rowtype; v_revision bigint;
begin
  select * into b from live_match_boxes where id=p_box for update;
  select revision into v_revision from live_publication_jobs where match_box_id=p_box;
  if coalesce(v_revision,0)<>p_revision then return false; end if;
  if b.state='Final' then update live_publication_jobs set completed=true where match_box_id=p_box; return true; end if;
  insert into live_match_official_state(match_box_id,season_year,round,status,thru,maroon_holes,white_holes,leader,margin,mathematically_complete,official_result,updated_at)
  values(p_box,b.season_year,b.round,p_state->>'status',(p_state->>'thru')::int,(p_state->>'maroonHoles')::int,(p_state->>'whiteHoles')::int,p_state->>'leader',(p_state->>'margin')::int,(p_state->>'mathematicallyComplete')::boolean,p_state->>'officialResult',now())
  on conflict(match_box_id) do update set status=excluded.status,thru=excluded.thru,maroon_holes=excluded.maroon_holes,white_holes=excluded.white_holes,leader=excluded.leader,margin=excluded.margin,mathematically_complete=excluded.mathematically_complete,official_result=excluded.official_result,updated_at=now();
  if p_odds is not null then
    insert into live_match_odds_snapshots(match_box_id,season_year,model_version,state_thru,maroon_lead,maroon_win_probability,tie_probability,white_win_probability,maroon_american_odds,tie_american_odds,white_american_odds,details)
    values(p_box,b.season_year,p_odds->>'model_version',(p_odds->>'state_thru')::int,(p_odds->>'maroon_lead')::int,(p_odds->>'maroon_win_probability')::numeric,(p_odds->>'tie_probability')::numeric,(p_odds->>'white_win_probability')::numeric,(p_odds->>'maroon_american_odds')::int,(p_odds->>'tie_american_odds')::int,(p_odds->>'white_american_odds')::int,p_odds->'details');
  end if;
  update live_publication_jobs set completed=true where match_box_id=p_box and revision=p_revision;
  return true;
end $$;
revoke all on function publish_match_revision(uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function publish_match_revision(uuid,bigint,jsonb,jsonb) to service_role;
create or replace function close_live_match_atomic(p_box uuid) returns text
language plpgsql security definer set search_path=public as $$
declare b live_match_boxes%rowtype; result text; h int; played int:=0; a_wins int:=0; w_wins int:=0; a_score int; w_score int; v_count int; market text;
begin
  if not coalesce((select is_host from profiles where id=auth.uid()),false) then raise exception 'Not authorized.'; end if;
  select * into b from live_match_boxes where id=p_box for update;
  if not found then raise exception 'Match not found.'; end if;
  select official_result into result from live_match_official_state where match_box_id=p_box and closed_out_at is not null;
  if result is null then
    for h in 1..18 loop
      select count(*),min(score) filter(where player_slug=any(b.maroon_players)),min(score) filter(where player_slug=any(b.white_players))
      into v_count,a_score,w_score from live_hole_scores where season_year=b.season_year and round=b.round and hole=h and player_slug=any(b.maroon_players||b.white_players) and confirmed_by is not null and score>0;
      exit when v_count<>cardinality(b.maroon_players||b.white_players);
      played:=h;
      if a_score<w_score then a_wins:=a_wins+1; elsif w_score<a_score then w_wins:=w_wins+1; end if;
      exit when abs(a_wins-w_wins)>18-h;
    end loop;
    if played<>18 and abs(a_wins-w_wins)<=18-played then raise exception 'This match has not reached a confirmed final result.'; end if;
    result:=case when a_wins>w_wins then 'maroon' when w_wins>a_wins then 'white' else 'tie' end;
    insert into live_match_official_state(match_box_id,season_year,round,status,thru,maroon_holes,white_holes,leader,margin,mathematically_complete,official_result,closed_out_at,closed_out_by)
    values(p_box,b.season_year,b.round,'closed_out',played,a_wins,w_wins,result,abs(a_wins-w_wins),true,result,now(),auth.uid())
    on conflict(match_box_id) do update set status='closed_out',thru=excluded.thru,maroon_holes=excluded.maroon_holes,white_holes=excluded.white_holes,leader=excluded.leader,margin=excluded.margin,mathematically_complete=true,official_result=excluded.official_result,closed_out_at=now(),closed_out_by=auth.uid(),updated_at=now();
    update live_match_boxes set state='Final' where id=p_box;
    update career_archive_rounds set status='final',updated_at=now() where match_box_id=p_box;
    insert into live_score_audit_events(season_year,match_box_id,round,actor_profile_id,kind,payload) values(b.season_year,p_box,b.round,auth.uid(),'match_closed_out',jsonb_build_object('result',result,'holesPlayed',played));
  end if;
  market:='live-match:'||p_box::text;
  perform pg_advisory_xact_lock(hashtext(market));
  if not exists(select 1 from wagers_market_settlements where market_key=market) then
    perform settle_mm_coin_market(market,result);
  elsif not exists(select 1 from wagers_market_settlements where market_key=market and winning_selection_key=result) then
    raise exception 'Existing settlement disagrees with match result.';
  end if;
  update live_publication_jobs set completed=true where match_box_id=p_box;
  return result;
end $$;
revoke all on function close_live_match_atomic(uuid) from public,anon;
grant execute on function close_live_match_atomic(uuid) to authenticated;

create or replace function start_live_round_atomic(p_year int,p_round int) returns void
language plpgsql security definer set search_path=public as $$
declare r live_round_state%rowtype;
begin
  if not coalesce((select is_host from profiles where id=auth.uid()),false) then raise exception 'Not authorized.'; end if;
  select * into r from live_round_state where season_year=p_year and round=p_round for update;
  if not found or not r.course_locked or not r.matchups_locked then raise exception 'Lock the course and matchups first.'; end if;
  if not exists(select 1 from live_match_boxes where season_year=p_year and round=p_round) then raise exception 'No matchups are assigned.'; end if;
  update live_round_state set started=true where season_year=p_year and round=p_round;
  update live_match_boxes set started=true where season_year=p_year and round=p_round;
end $$;
revoke all on function start_live_round_atomic(int,int) from public,anon;
grant execute on function start_live_round_atomic(int,int) to authenticated;
-- Historical corrections must update the entire edited card or nothing.
create or replace function save_archived_scorecard_atomic(p_round uuid,p_holes jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare h jsonb;
begin
  perform 1 from archived_scorecard_rounds where id=p_round for update;
  if not found then raise exception 'Archived round not found.'; end if;
  if jsonb_array_length(p_holes)=0 or jsonb_array_length(p_holes)<>(select count(distinct x->>'hole') from jsonb_array_elements(p_holes) x) then raise exception 'Invalid hole list.'; end if;
  for h in select * from jsonb_array_elements(p_holes) loop
    if (h->>'hole')::int not between 1 and 18 or (h->>'score')::int<1 or (h->>'putts')::int not between 0 and (h->>'score')::int then raise exception 'Invalid hole entries.'; end if;
    update archived_scorecard_holes set score=(h->>'score')::int,putts=(h->>'putts')::int,fir=h->>'fir',gir=(h->>'gir')::boolean,host_edited=true,updated_at=now()
    where round_id=p_round and hole=(h->>'hole')::int;
    if not found then raise exception 'Archived hole not found.'; end if;
  end loop;
end $$;
revoke all on function save_archived_scorecard_atomic(uuid,jsonb) from public,anon,authenticated;
grant execute on function save_archived_scorecard_atomic(uuid,jsonb) to service_role;
commit;
```

## lib/live/types.ts

```typescript
// lib/live/types.ts
export type Team = "maroon" | "white";
export type MatchFormat = "Fourball" | "Foursome" | "Singles";
export type MatchState = "Scheduled" | "Armed" | "Live" | "Final";

export interface LiveHole {
  number: number;
  par: number;
  yards: number;
}

export interface LiveTeeSet {
  apiSource?: {
    provider?: "golfcore";
    courseId: string;
    teeId: string;
    syncedAt: string;
    baseline: { name: string; color?: string; rating: number | null; slope: number | null; holes: LiveHole[] };
  };
  color?: string;
  locked?: boolean;
  id: string;
  name: string;
  holes: LiveHole[];
  rating: number | null;
  slope: number | null;
}

export interface LiveCourse {
  id: string;
  name: string;
  holes: LiveHole[];
  teeSets?: LiveTeeSet[];
  rating: number | null; // e.g. 72.4 — null until set
  slope: number | null; // USGA range 55-155 — null until set
  city?: string | null;
  state?: string | null; // two-letter code, e.g. "TX"
  zipCode?: string | null; // optional; never displayed, reserved for a nearby-courses lookup
}

export interface LiveHoleScore {
  seasonYear: number;
  player: string; // player_slug
  round: number;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  hostEdited: boolean;
}

export interface LiveMatch {
  id: string | null;
  seasonYear: number;
  session: number;
  matchNumber: number;
  format: MatchFormat;
  teeTime: Date;
  maroonPlayers: string[]; // player_slug[]
  whitePlayers: string[]; // player_slug[]
  state: MatchState;
  started: boolean;
}

export interface TournamentSettings {
  sessionCount: number | null;
  completedAt: string | null; // ISO timestamp, null until the tournament is done
  venueName: string | null;
  venueLocked: boolean;
  beginDate: string | null; // ISO date (YYYY-MM-DD)
  endDate: string | null; // ISO date (YYYY-MM-DD)
  datesLocked: boolean;
}

export interface RosterEntry {
  seasonYear: number;
  playerSlug: string;
  team: Team;
  displayName?: string;
  avatarSrc?: string | null;
}

export interface LiveSessionState {
  seasonYear: number;
  session: number;
  started: boolean;
  courseId: string | null;
  courseSetup?: { teeSetId: string; teeSetName: string; holes: LiveHole[]; rating: number | null; slope: number | null; holeTeeSetIds?: Record<string, string> } | null;
  date: string | null; // ISO date (YYYY-MM-DD)
  format: MatchFormat | null;
  /** 3 "HH:MM" Pacific wall-clock times, or null where not yet set. Fourball/Foursome: one per match. Singles: shared 1&2 / 3&4 / 5&6. See lib/live/sessionTeeTimes.ts. */
  matchTeeTimes: (string | null)[];
  courseLocked: boolean;
  matchupsLocked: boolean;
}

/**
 * The in-memory shape scoring.ts/orchestration.ts operate on — mirrors
 * Python's Tournament dataclass, trimmed to what this phase needs. Building
 * one of these from real Supabase rows is a later phase's job (this phase
 * only proves the rules that operate on it are correct).
 */
export interface LiveTournamentSnapshot {
  players: Record<string, { team: Team }>; // keyed by player_slug
  courses: Record<string, LiveCourse>; // keyed by course id
  roundCourses: Record<number, string>; // session -> course id
  scores: Map<string, LiveHoleScore>; // keyed by `${player}:${round}:${hole}`
  matchBoxes: LiveMatch[];
}

export function scoreKey(player: string, round: number, hole: number): string {
  return `${player}:${round}:${hole}`;
}

export function scoreFor(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  const existing = snapshot.scores.get(key);
  if (existing) return existing;
  const blank: LiveHoleScore = { seasonYear: 0, player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false };
  snapshot.scores.set(key, blank);
  return blank;
}

export function readScore(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  return (
    snapshot.scores.get(key) ?? { seasonYear: 0, player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false }
  );
}

export function courseForRound(snapshot: LiveTournamentSnapshot, round: number): LiveCourse | null {
  const courseId = snapshot.roundCourses[round];
  if (courseId && snapshot.courses[courseId]) return snapshot.courses[courseId];
  const first = Object.values(snapshot.courses)[0];
  return first ?? null;
}
```

## lib/live/orchestration.ts

```typescript
import { readScore, type LiveMatch, type LiveTournamentSnapshot, type MatchFormat, type MatchState, type Team } from "./types.ts";

const ROSTER_SIZE = 12; // 6 Maroon + 6 White — fixed roster size across formats

export function matchesPerSession(format: MatchFormat): number {
  return format === "Singles" ? 6 : 3;
}

export function playersPerTeamPerMatch(format: MatchFormat): number {
  return format === "Singles" ? 1 : 2;
}

export function validateMatchBox(snapshot: LiveTournamentSnapshot, matchBox: LiveMatch): string[] {
  const errors: string[] = [];
  const maxBoxes = matchesPerSession(matchBox.format);
  if (matchBox.matchNumber < 1 || matchBox.matchNumber > maxBoxes) {
    errors.push(`Match box must be between 1 and ${maxBoxes} for ${matchBox.format}.`);
  }

  const perTeam = playersPerTeamPerMatch(matchBox.format);
  if (matchBox.maroonPlayers.length !== perTeam) errors.push(`Pick exactly ${perTeam} Maroon player${perTeam === 1 ? "" : "s"}.`);
  if (matchBox.whitePlayers.length !== perTeam) errors.push(`Pick exactly ${perTeam} White player${perTeam === 1 ? "" : "s"}.`);

  for (const player of matchBox.maroonPlayers) {
    if (snapshot.players[player]?.team !== "maroon") errors.push(`${player} is not on Team Maroon.`);
  }
  for (const player of matchBox.whitePlayers) {
    if (snapshot.players[player]?.team !== "white") errors.push(`${player} is not on Team White.`);
  }

  const roundBoxes = snapshot.matchBoxes.filter((box) => box.session === matchBox.session && box.matchNumber !== matchBox.matchNumber);
  const used = new Set(roundBoxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]));
  const duplicates = [...matchBox.maroonPlayers, ...matchBox.whitePlayers].filter((player) => used.has(player));
  if (duplicates.length > 0) errors.push(`Players already assigned in this round: ${[...new Set(duplicates)].sort().join(", ")}.`);

  return errors;
}

/**
 * Whether `scorerSlug` is allowed to enter `targetSlugs`' shared stroke
 * count for a hole in this match box. Fourball/Singles: `scorerSlug` and
 * the sole entry in `targetSlugs` must be the direct opposing pair at the
 * same box position (maroonPlayers[i] <-> whitePlayers[i] — Tiger already
 * sets this just by the order players are picked in Matchups). Foursome:
 * `targetSlugs` must be exactly the whole opposing side (either player on
 * your side may enter it, since it's one shared real-world number).
 */
export function canScoreStrokesFor(
  matchBox: Pick<LiveMatch, "format" | "maroonPlayers" | "whitePlayers">,
  scorerSlug: string,
  targetSlugs: string[]
): boolean {
  const onMaroon = matchBox.maroonPlayers.includes(scorerSlug);
  const onWhite = matchBox.whitePlayers.includes(scorerSlug);
  if (!onMaroon && !onWhite) return false;

  const opposingSide = onMaroon ? matchBox.whitePlayers : matchBox.maroonPlayers;

  if (matchBox.format === "Foursome") {
    return targetSlugs.length === opposingSide.length && opposingSide.every((slug) => targetSlugs.includes(slug));
  }

  const ownSide = onMaroon ? matchBox.maroonPlayers : matchBox.whitePlayers;
  const position = ownSide.indexOf(scorerSlug);
  const expectedTarget = opposingSide[position];
  return targetSlugs.length === 1 && targetSlugs[0] === expectedTarget;
}

/**
 * Whether a player's self-reported stroke count for a hole agrees with
 * what their assigned scoring opponent officially entered — the live
 * agreement indicator's underlying check. Both values must be present
 * (a still-pending entry is never treated as "agreed").
 */
export function scoresAgree(officialScore: number | null, selfReportedScore: number | null): boolean {
  return officialScore !== null && selfReportedScore !== null && officialScore === selfReportedScore;
}

export function sessionIsComplete(snapshot: LiveTournamentSnapshot, round: number, format: MatchFormat): boolean {
  const boxes = snapshot.matchBoxes.filter((box) => box.session === round);
  if (boxes.length !== matchesPerSession(format)) return false;
  const players = boxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]);
  return players.length === ROSTER_SIZE && new Set(players).size === ROSTER_SIZE;
}

export function effectiveMatchState(snapshot: LiveTournamentSnapshot, matchBox: LiveMatch, now?: Date): MatchState {
  if (matchBox.state === "Final") return "Final";
  if (matchBoxStartedThru(snapshot, matchBox) === 18) return "Final";
  if (!matchBox.started) return "Scheduled";

  const current = now ?? new Date();
  return current >= matchBox.teeTime ? "Live" : "Armed";
}

export function matchBoxStartedThru(snapshot: LiveTournamentSnapshot, matchBox: LiveMatch): number {
  let completed = 0;
  for (let hole = 1; hole <= 18; hole++) {
    if (!holeComplete(snapshot, matchBox, hole)) break;
    completed = hole;
  }
  return completed;
}

export function thruLabel(snapshot: LiveTournamentSnapshot, matchBox: LiveMatch): string {
  const thru = matchBoxStartedThru(snapshot, matchBox);
  if (thru === 0) return "Thru";
  if (thru >= 18) return "Final";
  return `Thru ${thru}`;
}

export function holeComplete(snapshot: LiveTournamentSnapshot, matchBox: LiveMatch, hole: number): boolean {
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];
  return players.every((player) => {
    const score = readScore(snapshot, player, matchBox.session, hole);
    return score.score !== null && score.score > 0;
  });
}

export interface MatchBoxResult {
  /** Hole wins are populated by matchBoxResult; optional preserves legacy
   * event fixtures that only need lead/margin. */
  maroonHoles?: number;
  whiteHoles?: number;
  maroonPts: number;
  whitePts: number;
  leader: Team | "tie";
  margin: number;
  holesRemaining: number;
}

export function matchBoxResult(snapshot: LiveTournamentSnapshot, matchBox: LiveMatch): MatchBoxResult {
  const round = matchBox.session;
  let maroonHoles = 0;
  let whiteHoles = 0;
  let completed = 0;

  for (let hole = 1; hole <= 18; hole++) {
    if (!holeComplete(snapshot, matchBox, hole)) break;
    completed = hole;
    const maroonBest = Math.min(...matchBox.maroonPlayers.map((player) => readScore(snapshot, player, round, hole).score ?? 0));
    const whiteBest = Math.min(...matchBox.whitePlayers.map((player) => readScore(snapshot, player, round, hole).score ?? 0));
    if (maroonBest < whiteBest) maroonHoles++;
    else if (whiteBest < maroonBest) whiteHoles++;
    // Scores after a match is won belong to the individual round, not its result.
    if (Math.abs(maroonHoles - whiteHoles) > 18 - completed) break;
  }

  const holesRemaining = 18 - completed;
  const margin = Math.abs(maroonHoles - whiteHoles);
  const leader: Team | "tie" = maroonHoles > whiteHoles ? "maroon" : whiteHoles > maroonHoles ? "white" : "tie";

  const matchClosed = completed === 18 || margin > holesRemaining;
  let maroonPts = 0;
  let whitePts = 0;
  if (matchClosed) {
    if (maroonHoles > whiteHoles) maroonPts = 1;
    else if (whiteHoles > maroonHoles) whitePts = 1;
    else {
      maroonPts = 0.5;
      whitePts = 0.5;
    }
  }

  return { maroonHoles, whiteHoles, maroonPts, whitePts, leader, margin, holesRemaining };
}

/** A round may be armed while this box is waiting for tee time. Tiger can
 * override that wait by setting the persisted box state to Live. */
export function matchIsScoreable(matchBox: Pick<LiveMatch, "state" | "started" | "teeTime">, now = new Date()): boolean {
  return matchBox.started && matchBox.state !== "Final" && (matchBox.state === "Live" || now >= matchBox.teeTime);
}

export function matchBoxPayload(snapshot: LiveTournamentSnapshot, matchBox: LiveMatch, now?: Date): Record<string, unknown> {
  const state = effectiveMatchState(snapshot, matchBox, now);
  const result = matchBoxResult(snapshot, matchBox);
  return {
    id: matchBox.id,
    round: matchBox.session,
    boxNumber: matchBox.matchNumber,
    format: matchBox.format,
    teeTime: matchBox.teeTime.toISOString(),
    state,
    thru: state === "Scheduled" ? "" : thruLabel(snapshot, matchBox),
    maroonPlayers: matchBox.maroonPlayers,
    whitePlayers: matchBox.whitePlayers,
    ...result,
  };
}
```

## lib/live/officialMatchState.ts

```typescript
import { effectiveMatchState, matchBoxResult, matchBoxStartedThru } from "@/lib/live/orchestration";
import type { LiveMatch, LiveTournamentSnapshot } from "@/lib/live/types";

export type OfficialMatchStatus = "upcoming" | "live" | "complete" | "closed_out";

export type OfficialMatchState = {
  status: OfficialMatchStatus;
  thru: number;
  maroonHoles: number;
  whiteHoles: number;
  leader: "maroon" | "white" | "tie";
  margin: number;
  mathematicallyComplete: boolean;
  officialResult: "maroon" | "white" | "tie" | null;
};

/**
 * Derives the sole public match-state payload from a snapshot containing
 * confirmed scores only. It deliberately knows nothing about drafts or
 * scorer devices: callers must filter those before invoking it.
 */
export function buildOfficialMatchState(snapshot: LiveTournamentSnapshot, box: LiveMatch, now = new Date()): OfficialMatchState {
  const startedState = effectiveMatchState(snapshot, box, now);
  const result = matchBoxResult(snapshot, box);
  const thru = matchBoxStartedThru(snapshot, box);
  const mathematicallyComplete = result.margin > result.holesRemaining || thru === 18;
  const officialResult = mathematicallyComplete ? result.leader : null;
  const status: OfficialMatchStatus = mathematicallyComplete ? "complete" : startedState === "Live" ? "live" : "upcoming";

  return {
    status,
    thru: mathematicallyComplete ? 18 - result.holesRemaining : thru,
    maroonHoles: result.maroonHoles ?? 0,
    whiteHoles: result.whiteHoles ?? 0,
    leader: result.leader,
    margin: result.margin,
    mathematicallyComplete,
    officialResult,
  };
}
```

## lib/live/holeSubmission.ts

```typescript
import type { MatchFormat } from "./types";
import type { ScorecardHoleRow } from "@/lib/portal/scorecard";

export type ShotChoice = "hit" | "long" | "short" | "left" | "right" | "penalty";
export type HoleDraft = { ownScore: number; opponentScore: number; putts: number | null; fairway: ShotChoice | null; green: ShotChoice | null };
export type HoleSubmission = HoleDraft & { player: string; hole: number; submittedAt: string };
export type ScoringPair = { format: MatchFormat; maroonPlayers: string[]; whitePlayers: string[] };
export type HoleSubmissionStatus = "empty" | "submitted" | "confirmed" | "disputed";

export function validHoleDraft(value: unknown, par: number, format: MatchFormat): value is HoleDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as HoleDraft;
  if (![d.ownScore, d.opponentScore].every((n) => Number.isInteger(n) && n > 0)) return false;
  if (format === "Foursome") return true;
  const directions = ["hit", "long", "short", "left", "right", "penalty"];
  return d.putts !== null && Number.isInteger(d.putts) && d.putts >= 0 && d.putts <= d.ownScore
    && (par === 3 || directions.includes(d.fairway ?? "")) && directions.includes(d.green ?? "");
}

export function scoringSides(box: ScoringPair, player: string) {
  const maroon = box.maroonPlayers.includes(player);
  const own = maroon ? box.maroonPlayers : box.whitePlayers;
  const other = maroon ? box.whitePlayers : box.maroonPlayers;
  const index = own.indexOf(player);
  return { maroon, own, opponents: index < 0 ? [] : box.format === "Foursome" ? other : other.slice(index, index + 1) };
}

export function submittedPair(box: ScoringPair, player: string, hole: number, submissions: HoleSubmission[]) {
  const { own, opponents } = scoringSides(box, player);
  const latest = (players: string[]) => submissions.filter((s) => s.hole === hole && players.includes(s.player))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  return { mine: latest(box.format === "Foursome" ? own : [player]), other: latest(opponents) };
}

export function holeSubmissionStatus(box: ScoringPair, player: string, hole: number, submissions: HoleSubmission[]): HoleSubmissionStatus {
  const { mine, other } = submittedPair(box, player, hole, submissions);
  if (!mine) return "empty";
  if (!other) return "submitted";
  return mine.ownScore === other.opponentScore && mine.opponentScore === other.ownScore ? "confirmed" : "disputed";
}

export function sameHoleDraft(a: HoleDraft, b: HoleDraft, par: number, format: MatchFormat) {
  return a.ownScore === b.ownScore && a.opponentScore === b.opponentScore
    && (format === "Foursome" || (a.putts === b.putts && a.green === b.green && (par === 3 || a.fairway === b.fairway)));
}

/** Maps one player's submitted holes into Scorecard rows. Alternate Shot never collects putts/fairway/green, so those come back null (not applicable) even on an entered hole; fairway is also null on a par 3. */
export function buildScorecardRows(holes: { number: number; par: number; yards: number }[], player: string, submissions: HoleSubmission[], format: MatchFormat): ScorecardHoleRow[] {
  return holes.map((hole) => {
    const entry = submissions.filter((s) => s.hole === hole.number && s.player === player).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
    const isFoursome = format === "Foursome";
    const par3 = hole.par === 3;
    const shot = (choice: ShotChoice | null): { hit: boolean | null; direction: ScorecardHoleRow["firDirection"] } =>
      choice == null ? { hit: null, direction: null } : { hit: choice === "hit", direction: choice === "hit" ? null : choice };
    const fairway = !entry || isFoursome || par3 ? { hit: null, direction: null } : shot(entry.fairway);
    const green = !entry || isFoursome ? { hit: null, direction: null } : shot(entry.green);
    return {
      hole: hole.number,
      par: hole.par,
      yards: hole.yards,
      score: entry?.ownScore ?? null,
      opponentScore: entry?.opponentScore ?? null,
      putts: !entry || isFoursome ? null : entry.putts,
      fir: fairway.hit,
      firDirection: fairway.direction,
      gir: green.hit,
      girDirection: green.direction,
    };
  });
}
```

## lib/live/useHoleQueue.ts

```typescript
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import type { HoleDraft, HoleSubmission } from "./holeSubmission";

export type QueuedHole = HoleDraft & { round: number; hole: number; matchBoxId: string; requestId: string; expectedSubmission: string | null };
export function useHoleQueue(key: string | null, onSaved: (entry: QueuedHole, submissions: HoleSubmission[]) => void) {
  const [queue, setQueue, storage] = usePersistentState<QueuedHole[]>(key, []);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const running = useRef(false);
  const callback = useRef(onSaved);
  useEffect(() => { callback.current = onSaved; }, [onSaved]);
  const send = useCallback(async (entry: QueuedHole) => {
    if (running.current) return false;
    running.current = true; setSending(true);
    try {
      const response = await fetch("/api/portal/scoring/hole", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry), signal: AbortSignal.timeout(12000) });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (response.status >= 400 && response.status < 500) {
          setQueue((current) => current.filter((item) => item.requestId !== entry.requestId));
          setMessage(result.error ?? "Review this hole and submit again.");
        } else setMessage("Saved on this device. Waiting for a connection to submit.");
        return false;
      }
      setQueue((current) => current.filter((item) => item.requestId !== entry.requestId));
      setMessage(null); callback.current(entry, result.submissions);
      return true;
    } catch {
      setMessage("Saved on this device. Waiting for a connection to submit.");
      return false;
    } finally { running.current = false; setSending(false); }
  }, [setQueue]);
  useEffect(() => {
    if (!key || !storage.ready || !queue.length) return;
    const retry = () => { if (navigator.onLine) void send(queue[0]); };
    // Retry after hydration and then on reconnect or while the page remains open.
    const initial = window.setTimeout(retry, 1000);
    const timer = window.setInterval(retry, 15000);
    window.addEventListener("online", retry);
    return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener("online", retry); };
  }, [queue, key, storage.ready, send]);
  const submit = async (entry: QueuedHole) => {
    if (!storage.ready || storage.storageError) { setMessage("Device storage is unavailable. Re-enable storage before submitting."); return false; }
    setQueue((current) => [...current.filter((item) => item.hole !== entry.hole), entry]);
    return send(entry);
  };
  return { submit, pending: queue, sending, message, ready: storage.ready, storageError: storage.storageError,
    cancel: (hole: number) => { if (!running.current) setQueue((current) => current.filter((item) => item.hole !== hole)); } };
}
```

## lib/live/publishOfficialMatchState.ts

```typescript
import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { buildOfficialMatchState, type OfficialMatchState } from "@/lib/live/officialMatchState";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { publishMatchOdds } from "@/lib/live/publishMatchOdds";
import { refreshFutures } from "@/lib/wagers/refreshFutures";

/**
 * Rebuild and publish a match using confirmed holes only. This is the shared
 * server-side handoff point for score routes, Tiger corrections, and later
 * tee-time/start-match automation. It is intentionally idempotent: a retry
 * replaces current state rather than incrementing points or settling wagers.
 */
export async function publishOfficialMatchState(
  seasonYear: number,
  matchBoxId: string,
  auditKind?: "match_locked" | "match_updated",
  { futuresPricingBudgetMs = 0 }: { futuresPricingBudgetMs?: number } = {}
): Promise<OfficialMatchState | null> {
  const service = createSupabaseServiceRoleClient();
  const { data: job, error: jobError } = await service.from("live_publication_jobs").select("revision").eq("match_box_id", matchBoxId).maybeSingle();
  if (jobError) throw jobError;
  const snapshot = await buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true });
  const box = snapshot.matchBoxes.find((candidate) => candidate.id === matchBoxId);
  if (!box) return null;

  const official = buildOfficialMatchState(snapshot, box);
  const odds = await publishMatchOdds(seasonYear, box, official, true);
  const { data: published, error } = await service.rpc("publish_match_revision", { p_box: matchBoxId, p_revision: job?.revision ?? 0, p_state: official, p_odds: odds });
  if (error) throw error;
  if (!published) throw new Error("Scores changed while publishing; queued for retry.");

  if (auditKind) {
    const { error: auditError } = await service.from("live_score_audit_events").insert({
      season_year: seasonYear,
      match_box_id: matchBoxId,
      round: box.session,
      kind: auditKind,
      payload: { thru: official.thru, leader: official.leader, margin: official.margin, mathematicallyComplete: official.mathematicallyComplete },
    });
    if (auditError) throw auditError;
  }

  // Tournament futures depend on every match and on every new hole in the
  // Career Archive; bets on them pause until this lands. A pricing budget
  // (background callers only) also re-prices affected Team Winner matchups.
  await refreshFutures(seasonYear, { teamWinnerPricingBudgetMs: futuresPricingBudgetMs });

  return official;
}
```

## lib/live/retryPublication.ts

```typescript
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { publishOfficialMatchState } from "./publishOfficialMatchState";

/** Durable jobs survive server restarts. Active score/public refreshes retry them. */
export async function retryPendingPublications(seasonYear: number, matchBoxId?: string) {
  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_publication_jobs").select("match_box_id").eq("season_year", seasonYear).eq("completed", false).order("updated_at").limit(2);
  if (matchBoxId) query = query.eq("match_box_id", matchBoxId);
  const { data, error } = await query;
  if (error) { console.error("Could not check pending publication:", error.message); return; }
  for (const job of data ?? []) {
    try { await publishOfficialMatchState(seasonYear, job.match_box_id); }
    catch (error) { console.error("Match publication remains queued:", error); }
  }
}
```

## lib/live/scoring.ts

```typescript
import { courseForRound, scoreFor, type LiveHoleScore, type LiveTournamentSnapshot, type Team } from "./types.ts";
import { compareLeaderboardOrder } from "@/lib/leaderboard/sort";

export interface PlayerSummary {
  player: string;
  team: Team;
  gross: number;
  par: number;
  toPar: number;
  played: number;
  putts: number;
  firHit: number;
  firTotal: number;
  girHit: number;
  girTotal: number;
  birdieOrBetter: number;
  doubleOrWorse: number;
}

function holeByNumber(holes: { number: number; par: number; yards: number }[]): Map<number, { number: number; par: number; yards: number }> {
  return new Map(holes.map((hole) => [hole.number, hole]));
}

/**
 * Alt-shot (Foursome) rounds have one shared score per side, not a real
 * personal gross score — they count fully toward the team match result
 * (lib/live/orchestration.ts) but never toward an individual player's own
 * stats. Derives the round's format from its match boxes rather than
 * adding a new field to LiveTournamentSnapshot — a box's format always
 * equals its round's format (the plan's own long-standing invariant).
 */
function isIndividualStatsExcluded(snapshot: LiveTournamentSnapshot, round: number): boolean {
  return snapshot.matchBoxes.find((box) => box.session === round)?.format === "Foursome";
}

export function normalizeBool(value: boolean | number | string | null | undefined): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = String(value).trim().toLowerCase();
  if (text === "x" || text === "na" || text === "n/a") return null;
  return text === "1" || text === "true" || text === "yes" || text === "y";
}

export function updateScore(
  snapshot: LiveTournamentSnapshot,
  player: string,
  round: number,
  hole: number,
  score: number,
  putts: number,
  fir: boolean | number | string | null | undefined,
  gir: boolean | number | string | null | undefined
): LiveHoleScore {
  const course = courseForRound(snapshot, round);
  const holeInfo = course ? holeByNumber(course.holes).get(hole) : undefined;
  const entry = scoreFor(snapshot, player, round, hole);
  entry.score = score;
  entry.putts = putts;
  entry.fir = holeInfo?.par === 3 ? null : normalizeBool(fir);
  entry.gir = normalizeBool(gir) ?? false;
  return entry;
}

export function playerRoundScores(snapshot: LiveTournamentSnapshot, player: string, round: number): LiveHoleScore[] {
  const course = courseForRound(snapshot, round);
  if (!course) return [];
  return course.holes.map((hole) => scoreFor(snapshot, player, round, hole.number));
}

export function summarizePlayer(snapshot: LiveTournamentSnapshot, player: string, rounds?: number[]): PlayerSummary {
  const playerInfo = snapshot.players[player];
  if (!playerInfo) throw new Error(`Unknown player: ${player}`);

  const roundFilter = rounds ? new Set(rounds) : null;
  const played: LiveHoleScore[] = [];
  for (const score of snapshot.scores.values()) {
    if (score.player !== player) continue;
    if (score.score === null || score.score <= 0) continue;
    if (roundFilter && !roundFilter.has(score.round)) continue;
    if (isIndividualStatsExcluded(snapshot, score.round)) continue;
    played.push(score);
  }

  const parFor = (score: LiveHoleScore): number => {
    const course = courseForRound(snapshot, score.round);
    const holeInfo = course ? holeByNumber(course.holes).get(score.hole) : undefined;
    return holeInfo?.par ?? 0;
  };

  const gross = played.reduce((sum, score) => sum + (score.score ?? 0), 0);
  const par = played.reduce((sum, score) => sum + parFor(score), 0);
  const putts = played.reduce((sum, score) => sum + (score.putts ?? 0), 0);
  const firScores = played.filter((score) => parFor(score) !== 3);
  const girScores = played;

  return {
    player,
    team: playerInfo.team,
    gross,
    par,
    toPar: gross - par,
    played: played.length,
    putts,
    firHit: firScores.filter((score) => score.fir === true).length,
    firTotal: firScores.length,
    girHit: girScores.filter((score) => score.gir === true).length,
    girTotal: girScores.length,
    birdieOrBetter: played.filter((score) => (score.score ?? 0) <= parFor(score) - 1).length,
    doubleOrWorse: played.filter((score) => (score.score ?? 0) >= parFor(score) + 2).length,
  };
}

export function leaderboard(snapshot: LiveTournamentSnapshot, rounds?: number[]): PlayerSummary[] {
  const summaries = Object.keys(snapshot.players).map((player) => summarizePlayer(snapshot, player, rounds));
  return summaries.sort(compareLeaderboardOrder);
}

export function teamTotals(snapshot: LiveTournamentSnapshot): Record<Team, number> {
  const totals: Record<Team, number> = { maroon: 0, white: 0 };
  for (const summary of leaderboard(snapshot)) {
    totals[summary.team] += summary.toPar;
  }
  return totals;
}
```

## lib/live/teeSets.ts

```typescript
import type { LiveTeeSet } from "./types";

export function validTeeSets(value: unknown): value is LiveTeeSet[] {
  if (!Array.isArray(value) || !value.length) return false;
  const ids = new Set<string>();
  return value.every((tee) => {
    if (!tee || typeof tee.id !== "string" || !tee.id.trim() || ids.has(tee.id) || typeof tee.name !== "string" || !tee.name.trim()) return false;
    ids.add(tee.id);
    if (tee.color !== undefined && (typeof tee.color !== "string" || !/^#[0-9a-f]{6}$/i.test(tee.color))) return false;
    if (tee.locked !== undefined && typeof tee.locked !== "boolean") return false;
    if (tee.rating != null && (!Number.isFinite(tee.rating) || tee.rating <= 0)) return false;
    if (tee.slope != null && (!Number.isInteger(tee.slope) || tee.slope < 55 || tee.slope > 155)) return false;
    if (!Array.isArray(tee.holes) || tee.holes.length !== 18) return false;
    const numbers = new Set<number>();
    if (!tee.holes.every((hole: LiveTeeSet["holes"][number]) => {
      if (!hole || !Number.isInteger(hole.number) || hole.number < 1 || hole.number > 18 || numbers.has(hole.number)) return false;
      numbers.add(hole.number);
      return Number.isInteger(hole.par) && (hole.par === 0 && !tee.locked || hole.par >= 3 && hole.par <= 6) && Number.isInteger(hole.yards) && hole.yards >= 0;
    })) return false;
    return !tee.locked || (tee.rating != null && tee.slope != null && tee.holes.every((hole: LiveTeeSet["holes"][number]) => hole.yards > 0));
  });
}

export function availableTeeSets(tees: LiveTeeSet[] | undefined): LiveTeeSet[] {
  return (tees ?? []).filter((tee) => validTeeSets([tee]) && tee.locked === true);
}
```

## lib/live/syncLockedRound.ts

```typescript
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { publishOfficialMatchState } from "@/lib/live/publishOfficialMatchState";

/**
 * Re-publishes the editable locked setup into player Career Archive shells.
 * It runs at initial lock and after a pre-start matchup edit, so downstream
 * data never remains pointed at an old tee time, course, partner, or opponent.
 */
export async function syncLockedSessionToCareerArchive(seasonYear: number, session: number): Promise<void> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundState, error: roundError } = await service
    .from("live_round_state")
    .select("date, course_id, format, course_locked, matchups_locked, started, course_setup")
    .eq("season_year", seasonYear)
    .eq("round", session)
    .single();
  if (roundError || !roundState?.course_locked || !roundState.matchups_locked || roundState.started || !roundState.course_id || !roundState.format) return;

  const [{ data: course, error: courseError }, { data: boxes, error: boxesError }] = await Promise.all([
    service.from("live_courses").select("name, holes").eq("id", roundState.course_id).single(),
    service.from("live_match_boxes").select("id, format, maroon_players, white_players").eq("season_year", seasonYear).eq("round", session),
  ]);
  if (courseError || boxesError || !course) throw new Error("Could not load the locked round for archive publishing.");

  const rows = (boxes ?? []).flatMap((box) => {
    const sides = [[box.maroon_players as string[], box.white_players as string[]], [box.white_players as string[], box.maroon_players as string[]]] as const;
    return sides.flatMap(([side, opponents]) => side.map((playerSlug, index) => ({
      season_year: seasonYear,
      round: session,
      player_slug: playerSlug,
      course: course.name,
      played_on: roundState.date,
      format: box.format,
      match_box_id: box.id,
      partner_slug: side.length === 2 ? side[1 - index] : null,
      opponent_slugs: opponents,
      status: "scheduled",
      holes: roundState.course_setup?.holes ?? course.holes,
      handicap_setup: roundState.course_setup ? { ...roundState.course_setup, courseId: roundState.course_id } : null,
    })));
  });
  const activePlayers = rows.map((row) => row.player_slug);
  const { data: previous } = await service
    .from("career_archive_rounds")
    .select("player_slug")
    .eq("season_year", seasonYear)
    .eq("round", session)
    .eq("status", "scheduled");
  const stale = (previous ?? []).map((row) => row.player_slug as string).filter((playerSlug) => !activePlayers.includes(playerSlug));
  if (stale.length > 0) {
    const { error } = await service.from("career_archive_rounds").delete().eq("season_year", seasonYear).eq("round", session).eq("status", "scheduled").in("player_slug", stale);
    if (error) throw error;
  }

  if (rows.length > 0) {
    const { error } = await service.from("career_archive_rounds").upsert(rows, { onConflict: "season_year,round,player_slug" });
    if (error) throw error;
  }

  // Locking and pre-start edits both receive a canonical zero-hole state and
  // fresh pre-round odds snapshot before any player opens their portal.
  for (const box of boxes ?? []) {
    await publishOfficialMatchState(seasonYear, box.id as string, "match_locked");
  }
}
```

## lib/live/seasonYears.ts

```typescript
export const SEASON_YEARS: number[] = [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];

export function isValidSeasonYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && SEASON_YEARS.includes(value);
}
```

## lib/live/testSeason.ts

```typescript
/**
 * 2034 is reserved for end-to-end rehearsal. It deliberately uses the same
 * application workflow as a real tournament, but its archive rows are never
 * included in normal Career Stats or real-season odds calculations.
 */
export const TEST_SEASON_YEAR = 2034;
export const DEFAULT_REAL_SEASON_YEAR = 2027;

export function isTestSeason(year: number): boolean {
  return year === TEST_SEASON_YEAR;
}
```

## lib/handicap/whs.ts

```typescript
// lib/handicap/whs.ts
/**
 * USGA World Handicap System math: differential per round, and Handicap
 * Index as the (adjusted) average of the best differentials from a player's
 * most recent rounds, using the real WHS Rule 5.2a "rounds used" table.
 * Deliberately excludes the Playing Conditions Calculation (PCC) and the
 * official soft-cap/hard-cap rules that limit how fast a real GHIN index
 * can rise — see the design spec's "Out of scope". Everything else here
 * matches the real table: no index is produced with fewer than 3 rounds,
 * and no adjustment is ever positive.
 */

interface RoundsUsedRow {
  use: number;
  adjustment: number;
}

// Index 0 = 3 rounds used, index 17 = 20 rounds used. Real WHS Rule 5.2a
// table — fewer than 3 rounds produces no index at all (see
// calculateHandicapIndex's early return).
const ROUNDS_USED_TABLE: RoundsUsedRow[] = [
  { use: 1, adjustment: -2.0 }, // 3 rounds
  { use: 1, adjustment: -1.0 }, // 4
  { use: 1, adjustment: 0 },    // 5
  { use: 2, adjustment: -1.0 }, // 6
  { use: 2, adjustment: 0 },    // 7
  { use: 2, adjustment: 0 },    // 8
  { use: 3, adjustment: 0 },    // 9
  { use: 3, adjustment: 0 },    // 10
  { use: 3, adjustment: 0 },    // 11
  { use: 4, adjustment: 0 },    // 12
  { use: 4, adjustment: 0 },    // 13
  { use: 4, adjustment: 0 },    // 14
  { use: 5, adjustment: 0 },    // 15
  { use: 5, adjustment: 0 },    // 16
  { use: 6, adjustment: 0 },    // 17
  { use: 6, adjustment: 0 },    // 18
  { use: 7, adjustment: 0 },    // 19
  { use: 8, adjustment: 0 },    // 20
];

const MIN_ROUNDS_FOR_INDEX = 3;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateDifferential(totalScore: number, rating: number, slope: number): number {
  return round1(((totalScore - rating) * 113) / slope);
}

/**
 * `differentials` must already be limited by the caller to the rounds that
 * should count (most recent ones) — this function only knows counts and
 * values, never dates. Returns null with fewer than 3 rounds — real WHS
 * does not produce a Handicap Index below that minimum. Any entries past
 * 20 are dropped defensively.
 */
export function contributingDifferentialIndexes(differentials: number[]): number[] {
  if (differentials.length < MIN_ROUNDS_FOR_INDEX) return [];
  const considered = differentials.slice(0, 20);
  return considered.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
    .slice(0, ROUNDS_USED_TABLE[considered.length - MIN_ROUNDS_FOR_INDEX].use).map((entry) => entry.index);
}

export function calculateHandicapIndex(differentials: number[]): number | null {
  if (differentials.length < MIN_ROUNDS_FOR_INDEX) return null;
  const considered = differentials.slice(0, 20);
  const row = ROUNDS_USED_TABLE[considered.length - MIN_ROUNDS_FOR_INDEX];
  const lowest = contributingDifferentialIndexes(considered).map((index) => considered[index]);
  const average = lowest.reduce((sum, d) => sum + d, 0) / lowest.length;
  return round1(average + row.adjustment);
}

/**
 * `differentialsChronological` must be ALL of a player's differentials,
 * oldest first. Replays what the Handicap Index would have been after each
 * round (using only that round and the ones before it, capped at the most
 * recent 20 as of that point) and returns the lowest index ever reached.
 * Returns null until the player has logged at least 3 rounds.
 */
export function calculateLowIndex(differentialsChronological: number[]): number | null {
  let low: number | null = null;
  for (let i = 0; i < differentialsChronological.length; i++) {
    const windowStart = Math.max(0, i + 1 - 20);
    const asOfThisRound = differentialsChronological.slice(windowStart, i + 1);
    const index = calculateHandicapIndex(asOfThisRound);
    if (index !== null && (low === null || index < low)) low = index;
  }
  return low;
}
```

## lib/leaderboard/sort.ts

```typescript
/**
 * Score determines placement. Holes completed only order players within the
 * same score group, placing the player farther through first.
 */
export function compareLeaderboardOrder<T extends { toPar: number; thru?: number | null; played?: number | null; gross?: number | null; player?: string }>(a: T, b: T) {
  const aThru = a.thru ?? a.played ?? 0;
  const bThru = b.thru ?? b.played ?? 0;
  return a.toPar - b.toPar
    || bThru - aThru
    || (a.gross ?? 0) - (b.gross ?? 0)
    || (a.player ?? "").localeCompare(b.player ?? "");
}
```

## components/leaderboard/matchUtils.ts

```typescript
import type { RealMatch, Team, Tournament } from "@/lib/data/types";

export function matchStatus(match: RealMatch) {
  return match.status ?? "final";
}

export function matchLeader(match: RealMatch): Team | "tie" {
  if (match.leader) return match.leader;
  if (match.maroonPts > match.whitePts) return "maroon";
  if (match.whitePts > match.maroonPts) return "white";
  return "tie";
}

export function matchLabel(match: RealMatch): string {
  const leader = matchLeader(match);
  const status = matchStatus(match);
  const margin = match.margin ?? Math.abs(match.maroonPts - match.whitePts);
  const remaining = match.holesRemaining;

  if (status === "scheduled") return "VS";
  if (leader === "tie") return "AS";
  if (status === "final" && remaining != null && remaining > 0) return `${margin}&${remaining}`;
  return `${margin} Up`;
}

/**
 * Same as `matchLabel`, but accounts for a decided live match whose feed
 * omits `margin` — falls back to "Won" instead of computing a margin from
 * points that don't represent match-play holes. Used anywhere a match's
 * live state is shown, so it never disagrees with `matchLabel`'s callers.
 */
export function liveLabel(match: RealMatch): string {
  const status = matchStatus(match);
  const leader = matchLeader(match);
  const hasMatchPlayMargin = match.margin != null;
  const margin = match.margin ?? Math.abs(match.maroonPts - match.whitePts);
  const remaining = match.holesRemaining ?? null;

  if (status === "scheduled") return match.teeTimeCst ?? "VS";
  if (leader === "tie") return "AS";
  if (!hasMatchPlayMargin) return "Won";
  if (status === "final" && remaining != null && remaining > 0) return `${margin}&${remaining}`;
  return `${margin} Up`;
}

/** Which round (day) the Team view should default to: the day currently in progress, or the last day played if the tournament is complete. */
export function currentRoundDay(tournament: Tournament): number {
  const days = [...new Set(tournament.matches.map((m) => m.day))].sort((a, b) => a - b);
  if (days.length === 0) return 1;
  const activeDay = days.find((day) => tournament.matches.some((m) => m.day === day && matchStatus(m) !== "final"));
  return activeDay ?? days[days.length - 1];
}

export const LIVE_START_LABEL = "9:30 AM CST on January 6";

export function centralDateLabel(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 0);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";

  return `${month} ${day}${suffix} ${year}`;
}
```

## components/leaderboard/LiveLeaderboardContent.tsx

```typescript
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PointsRibbon } from "./PointsRibbon";
import { LeaderboardBoard } from "./LeaderboardBoard";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus, latestCompleted } from "@/lib/data";
import type { RealMatch, Tournament } from "@/lib/data/types";

type OfficialEntry = {
  match: { id: string; round: number; box_number: number; format: string; tee_time: string; maroon_players: string[]; white_players: string[] };
  officialState: { status: "upcoming" | "live" | "complete" | "closed_out"; thru: number; leader: "maroon" | "white" | "tie"; margin: number } | null;
  odds: { maroon_win_probability: number; tie_probability: number; white_win_probability: number } | null;
};
type OfficialStanding = { player: string; team: "maroon" | "white"; toPar: number; played: number; gross: number; par: number };

function asOfficialMatches(entries: OfficialEntry[]): RealMatch[] {
  return entries.map(({ match, officialState, odds }) => ({
    id: match.id,
    day: match.round,
    session: "Morning",
    format: match.format,
    maroonPlayers: match.maroon_players,
    whitePlayers: match.white_players,
    maroonPts: (officialState?.status === "closed_out" || officialState?.status === "complete") && officialState.leader === "maroon" ? 1 : (officialState?.status === "closed_out" || officialState?.status === "complete") && officialState?.leader === "tie" ? 0.5 : 0,
    whitePts: (officialState?.status === "closed_out" || officialState?.status === "complete") && officialState.leader === "white" ? 1 : (officialState?.status === "closed_out" || officialState?.status === "complete") && officialState?.leader === "tie" ? 0.5 : 0,
    status: officialState?.status === "closed_out" || officialState?.status === "complete" ? "final" : officialState?.status === "live" ? "live" : "scheduled",
    thru: officialState?.thru,
    leader: officialState?.leader,
    margin: officialState?.margin,
    holesRemaining: officialState ? 18 - officialState.thru : 18,
    teeTimeCst: new Date(match.tee_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    maroonWinProbability: odds?.maroon_win_probability,
    tieProbability: odds?.tie_probability,
    whiteWinProbability: odds?.white_win_probability,
  }));
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/**
 * Live 2027 data once the feed has entries; otherwise falls back to the
 * latest completed tournament (2026) so this page previews the real
 * leaderboard styling with real data instead of sitting empty — same
 * live-else-fallback pattern the home screen's strip and quick cards
 * already use. Outside the live window with no feed data, we always show
 * the 2026 preview rather than an empty 2027 shell; during the live window
 * we show the real (possibly still-empty) 2027 tournament so "no scores
 * posted yet" reads honestly if the feed hasn't caught up yet.
 */
export function LiveLeaderboardContent() {
  const { tournament, payload, error, loading } = useLiveTournament();
  const [officialEntries, setOfficialEntries] = useState<OfficialEntry[] | null>(null);
  const [officialStandings, setOfficialStandings] = useState<OfficialStanding[] | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/live/matches", { cache: "no-store" }).then((res) => res.json()).then((data) => active && setOfficialEntries(data.ok ? data.matches : [])).catch(() => active && setOfficialEntries([]));
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/live/standings", { cache: "no-store" }).then((res) => res.json()).then((data) => active && setOfficialStandings(data.ok ? data.standings : [])).catch(() => active && setOfficialStandings([]));
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const isLive = getNextTournamentStatus() === "live";
  const hasLiveData = tournament.matches.length > 0;
  const showFallback = !isLive && !hasLiveData;
  const source = showFallback ? latestCompleted : tournament;
  const officialMatches = officialEntries ? asOfficialMatches(officialEntries) : [];
  const liveSource: Tournament = officialMatches.length > 0
    ? { ...source, matches: officialMatches, individualLeaderboard: officialStandings ?? source.individualLeaderboard, maroonPts: officialMatches.reduce((sum, match) => sum + match.maroonPts, 0), whitePts: officialMatches.reduce((sum, match) => sum + match.whitePts, 0) }
    : officialStandings && officialStandings.length > 0 ? { ...source, individualLeaderboard: officialStandings } : source;

  return (
    <div>
      <div className="pt-[4vh] lg:pt-0">
        <PointsRibbon tournament={liveSource} />
      </div>

      <div className="pt-4">
        {isLive && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Badge live>Live</Badge>
            {payload?.updatedAt && <span className="font-sans text-[11px] text-ink-400">Updated {timeAgo(payload.updatedAt)}</span>}
            {error && <span className="font-sans text-[11px] text-score-under">{error}</span>}
          </div>
        )}

        {isLive && loading && !payload && officialEntries === null ? (
          <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>
        ) : (
          <LeaderboardBoard tournament={liveSource} live={isLive} liveStandings={officialStandings ?? undefined} />
        )}
      </div>
    </div>
  );
}
```

## lib/data/live.ts

```typescript
import { getPlayerSlug } from "./players";
import { upcoming2027 } from "./2027-upcoming";
import type { IndividualStanding, PlayerScorecard, RealMatch, Tournament } from "./types";

export interface LiveFeedPayload {
  roster?: { maroon: string[]; white: string[] };
  individualLeaderboard?: IndividualStanding[];
  leaderboard?: IndividualStanding[];
  scorecards?: PlayerScorecard[];
  matches?: RealMatch[];
  matchBoxes?: unknown[];
  maroonPts?: number;
  whitePts?: number;
  warnings?: string[];
  updatedAt?: string;
}

function matchPoints(matches: RealMatch[], team: "maroon" | "white"): number {
  return matches.reduce((total, match) => total + (team === "maroon" ? match.maroonPts : match.whitePts), 0);
}

export function mergeLiveTournament(payload: LiveFeedPayload | null): Tournament {
  const base = upcoming2027;
  const matches = (payload?.matches ?? []).map((match) => ({ ...match, maroonPlayers: match.maroonPlayers.map(getPlayerSlug), whitePlayers: match.whitePlayers.map(getPlayerSlug) }));
  const maroonPts = typeof payload?.maroonPts === "number" ? payload.maroonPts : matchPoints(matches, "maroon");
  const whitePts = typeof payload?.whitePts === "number" ? payload.whitePts : matchPoints(matches, "white");

  return {
    slug: base.slug,
    editionLabel: base.editionLabel,
    year: base.year,
    venue: base.venue,
    location: base.location,
    dateLabel: base.dateLabel,
    startDate: base.startDate,
    endDate: base.endDate,
    roster: { maroon: (payload?.roster?.maroon ?? base.roster?.maroon ?? []).map(getPlayerSlug), white: (payload?.roster?.white ?? base.roster?.white ?? []).map(getPlayerSlug) },
    maroonPts,
    whitePts,
    pointsAvailable: 33,
    pointsToWin: 17,
    matches,
    individualLeaderboard: (payload?.individualLeaderboard ?? payload?.leaderboard ?? []).map((entry) => ({ ...entry, player: getPlayerSlug(entry.player) })),
    scorecards: (payload?.scorecards ?? []).map((card) => ({ ...card, player: getPlayerSlug(card.player) })),
    notes: base.notes,
  };
}
```

## lib/data/players/index.ts

```typescript
import { createPlayerResolver } from "./resolvePlayer";
import { cadeBarone } from "./cade-barone";
import { camLatto } from "./cam-latto";
import { collinRoss } from "./collin-ross";
import { daltonSpriggs } from "./dalton-spriggs";
import { drewWeisser } from "./drew-weisser";
import { hugoMoebel } from "./hugo-moebel";
import { jacksonCollins } from "./jackson-collins";
import { kyleSchnabel } from "./kyle-schnabel";
import { lukeSherrell } from "./luke-sherrell";
import { nateWojciechowski } from "./nate-wojciechowski";
import { petePeabody } from "./pete-peabody";
import { peytonVos } from "./peyton-vos";
import { quezCurrier } from "./quez-currier";
import type { PlayerProfile } from "../types";

export const playerProfiles: PlayerProfile[] = [
  cadeBarone,
  camLatto,
  collinRoss,
  daltonSpriggs,
  drewWeisser,
  hugoMoebel,
  jacksonCollins,
  kyleSchnabel,
  lukeSherrell,
  nateWojciechowski,
  petePeabody,
  peytonVos,
  quezCurrier,
];

const resolvePlayer = createPlayerResolver(playerProfiles);
const bySlug = new Map(playerProfiles.map((profile) => [profile.slug, profile]));

export function getPlayerProfile(player: string): PlayerProfile | undefined {
  return resolvePlayer(player);
}

export function getPlayerProfileBySlug(slug: string): PlayerProfile | undefined {
  return bySlug.get(slug);
}

export function getPlayerDisplayName(player: string): string {
  return getPlayerProfile(player)?.fullName ?? player;
}

export function getPlayerAvatar(player: string): string | null {
  return getPlayerProfile(player)?.avatarSrc ?? null;
}

/** Canonical identifier for joins, URLs, and persisted player references. */
export function getPlayerSlug(player: string): string {
  return getPlayerProfile(player)?.slug ?? player.trim().toLowerCase();
}

/** Imports must not introduce an unrecognized or ambiguous player identifier. */
export function requirePlayerSlug(player: string): string {
  const profile = getPlayerProfile(player);
  if (!profile) throw new Error(`Unknown player: ${player}`);
  return profile.slug;
}

export function getPlayerFirstName(player: string): string {
  return getPlayerDisplayName(player).split(" ")[0];
}

export function getPlayerLastName(player: string): string {
  return getPlayerDisplayName(player).split(" ").at(-1) ?? player;
}
```

## app/api/portal/scoring/hole/route.ts

```typescript
import { after, NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { validHoleDraft } from "@/lib/live/holeSubmission";
import { publishOfficialMatchState } from "@/lib/live/publishOfficialMatchState";

// The background refresh after a hole (match odds, then every future,
// including re-pricing Team Winner matchups) runs within this limit.
export const maxDuration = 60;

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid submission." }, { status: 400 }); }
  const requestId = body?.requestId;
  const boxId = body?.matchBoxId;
  const expectedSubmission = body?.expectedSubmission;
  const round = body?.round;
  const hole = body?.hole;
  if (!body || typeof requestId !== "string" || typeof boxId !== "string" || !Number.isInteger(body.round) || body.round < 1 || !Number.isInteger(body.hole) || body.hole < 1 || body.hole > 18 || !validHoleDraft(body, 3, "Foursome")) {
    return NextResponse.json({ ok: false, error: "Enter both scores and a valid hole." }, { status: 400 });
  }
  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  // The RPC derives the opponent, validates stats against the locked course,
  // and saves both perspectives and archive changes in one transaction.
  const { data, error } = await service.rpc("submit_live_hole_reliable", {
    p_request: requestId, p_box: boxId, p_expected: expectedSubmission ?? null,
    p_year: seasonYear, p_round: round, p_hole: hole, p_player: player.playerSlug, p_actor: player.userId,
    p_payload: { ownScore: body.ownScore, opponentScore: body.opponentScore, putts: body.putts ?? null, fairway: body.fairway ?? null, green: body.green ?? null },
  });
  if (error) {
    console.error("Hole submission failed:", error);
    return NextResponse.json({ ok: false, error: error.code === "P0001" ? error.message : "Scoring is temporarily unavailable. Your entries have not been submitted; please try again." }, { status: error.code === "P0001" ? 400 : 503 });
  }
  // Acknowledge the committed hole immediately; model calculations must not
  // make a successful save look like a connection timeout on the phone.
  after(async () => {
    try { await publishOfficialMatchState(seasonYear, data.matchBoxId, undefined, { futuresPricingBudgetMs: 30_000 }); }
    catch (err) { console.error("Official match refresh remains queued:", err); }
  });
  return NextResponse.json({ ok: true, submissions: data.submissions });
}
```

## app/api/portal/scoring/stroke/route.ts

```typescript
import { NextResponse } from "next/server";

/** Individual autosave writes cannot bypass complete-hole validation and agreement. */
export async function POST() {
  return NextResponse.json({ ok: false, error: "Refresh the scoring page and use Submit Score to save the complete hole." }, { status: 409 });
}
```

## app/api/portal/tiger/matches/route.ts

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { validateMatchBox } from "@/lib/live/orchestration";
import { deriveMatchTeeTime, teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import { syncLockedSessionToCareerArchive } from "@/lib/live/syncLockedRound";
import type { LiveMatch, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

interface MatchRow {
  id: string;
  round: number;
  box_number: number;
  format: string;
  tee_time: string;
  maroon_players: string[];
  white_players: string[];
  state: string;
  started: boolean;
}

function rowToMatch(row: MatchRow, seasonYear: number): LiveMatch {
  return {
    id: row.id,
    seasonYear,
    session: row.round,
    matchNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  };
}

const MATCH_COLUMNS = "id, round, box_number, format, tee_time, maroon_players, white_players, state, started";

export async function GET(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  const sessionParam = url.searchParams.get("session");

  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_match_boxes").select(MATCH_COLUMNS).eq("season_year", year).order("round").order("box_number");
  if (sessionParam) query = query.eq("round", Number(sessionParam));

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the matches." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matches: (data ?? []).map((row) => rowToMatch(row, year)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session, matchNumber, maroonPlayers, whitePlayers } = await request.json();
  if (
    !isValidSeasonYear(year) ||
    typeof session !== "number" ||
    typeof matchNumber !== "number" ||
    !Array.isArray(maroonPlayers) ||
    !Array.isArray(whitePlayers)
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: sessionRow } = await service.from("live_round_state").select("format, course_locked, matchups_locked, started, date, match_tee_times").eq("season_year", year).eq("round", session).single();
  if (!sessionRow?.course_locked || !sessionRow.format) {
    return NextResponse.json({ ok: false, error: "Lock this session's course and format before building matchups." }, { status: 400 });
  }
  if (sessionRow.started) {
    return NextResponse.json({ ok: false, error: "This session is armed; use Tiger's correction flow for a live matchup." }, { status: 400 });
  }
  const format = sessionRow.format as MatchFormat;

  const teeTimes = (sessionRow.match_tee_times as (string | null)[] | null) ?? [null, null, null];
  const slot = teeTimeSlotForMatch(format, matchNumber);
  const teeTime = deriveMatchTeeTime(sessionRow.date, teeTimes[slot] ?? null);
  if (!teeTime) {
    return NextResponse.json({ ok: false, error: "This session's tee times aren't set yet — set and lock them in Courses & Format first." }, { status: 400 });
  }

  const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
  const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

  const { data: existingRows } = await service.from("live_match_boxes").select(MATCH_COLUMNS).eq("season_year", year).eq("round", session);
  const existingMatches = (existingRows as MatchRow[] | null ?? []).map((row) => rowToMatch(row, year)).filter((match) => match.matchNumber !== matchNumber);

  const candidate: LiveMatch = {
    id: null,
    seasonYear: year,
    session,
    matchNumber,
    format,
    teeTime,
    maroonPlayers,
    whitePlayers,
    state: "Scheduled",
    started: false,
  };

  const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes: [...existingMatches, candidate] };
  const errors = validateMatchBox(snapshot, candidate);
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
  }

  const { data: currentMatch } = await service.from("live_match_boxes").select("id").eq("season_year", year).eq("round", session).eq("box_number", matchNumber).maybeSingle();
  if (currentMatch) {
    const { error } = await service
      .from("live_match_boxes")
      .update({ format, tee_time: teeTime.toISOString(), maroon_players: maroonPlayers, white_players: whitePlayers })
      .eq("id", currentMatch.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that match." }, { status: 500 });
    if (sessionRow.matchups_locked) {
      try {
        await syncLockedSessionToCareerArchive(year, session);
      } catch {
        return NextResponse.json({ ok: false, error: "Match saved, but its published archive/odds update failed." }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, id: currentMatch.id });
  }

  const { data: inserted, error } = await service
    .from("live_match_boxes")
    .insert({ season_year: year, round: session, box_number: matchNumber, format, tee_time: teeTime.toISOString(), maroon_players: maroonPlayers, white_players: whitePlayers })
    .select("id")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: "Could not save that match." }, { status: 500 });
  }
  if (sessionRow.matchups_locked) {
    try {
      await syncLockedSessionToCareerArchive(year, session);
    } catch {
      return NextResponse.json({ ok: false, error: "Match saved, but its published archive/odds update failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
```

## app/api/portal/tiger/matches/closeout/route.ts

```typescript
import { after, NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { refreshFutures } from "@/lib/wagers/refreshFutures";

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string") return NextResponse.json({ ok: false, error: "Missing match." }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("close_live_match_atomic", { p_box: body.id });
  if (error) return NextResponse.json({ ok: false, error: error.code === "P0001" ? error.message : "Closeout was not completed. Retry; the score and settlement will be saved together." }, { status: 400 });
  // Closeout touches official state, which pauses futures bets until odds refresh.
  after(async () => {
    const { data: box } = await createSupabaseServiceRoleClient().from("live_match_boxes").select("season_year").eq("id", body.id).maybeSingle();
    if (box) await refreshFutures(box.season_year);
  });
  return NextResponse.json({ ok: true, result: data });
}
```

## app/api/portal/tiger/sessions/lock/route.ts

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { sessionIsComplete, validateMatchBox } from "@/lib/live/orchestration";
import { syncLockedSessionToCareerArchive } from "@/lib/live/syncLockedRound";
import { availableTeeSets } from "@/lib/live/teeSets";
import type { LiveMatch, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session, lock, value } = await request.json();
  if (!isValidSeasonYear(year) || typeof session !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (lock === "course") {
    if (value) {
      const { data: current } = await service.from("live_round_state").select("date, course_id, format, course_setup, match_tee_times").eq("season_year", year).eq("round", session).single();
      if (!current?.date || !current?.course_id || !current?.format) {
        return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this session." }, { status: 400 });
      }
      const teeTimes = (current.match_tee_times as (string | null)[] | null) ?? [null, null, null];
      if (teeTimes.length !== 3 || teeTimes.some((slot) => !slot)) {
        return NextResponse.json({ ok: false, error: "Set all 3 match tee times before locking this session." }, { status: 400 });
      }
      const { data: course } = await service.from("live_courses").select("tee_sets").eq("id", current.course_id).single();
      const availableIds = new Set(availableTeeSets(Array.isArray(course?.tee_sets) ? course.tee_sets : []).map((tee) => tee.id));
      if (!availableIds.has(current.course_setup?.teeSetId) || Object.values(current.course_setup?.holeTeeSetIds ?? {}).some((id) => typeof id !== "string" || !availableIds.has(id))) {
        return NextResponse.json({ ok: false, error: "Choose locked tee sets from the Course Library before locking this session." }, { status: 400 });
      }
    }
    const { error } = await service
      .from("live_round_state")
      .update(value ? { course_locked: value } : { course_locked: value, matchups_locked: false })
      .eq("season_year", year)
      .eq("round", session);
    if (error) {
      return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // lock === "matchups"
  if (value) {
    const { data: current } = await service.from("live_round_state").select("course_locked, format, course_id, date").eq("season_year", year).eq("round", session).single();
    if (!current?.course_locked || !current.format) {
      return NextResponse.json({ ok: false, error: "Lock this session's course and format before locking matchups." }, { status: 400 });
    }

    const { data: matchRows } = await service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", year)
      .eq("round", session);
    const matches: LiveMatch[] = (matchRows ?? []).map((row) => ({
      id: row.id,
      seasonYear: year,
      session: row.round,
      matchNumber: row.box_number,
      format: row.format as MatchFormat,
      teeTime: new Date(row.tee_time),
      maroonPlayers: row.maroon_players,
      whitePlayers: row.white_players,
      state: row.state as MatchState,
      started: row.started,
    }));
    const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
    const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

    const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes: matches };
    if (!sessionIsComplete(snapshot, session, current.format as MatchFormat)) {
      return NextResponse.json({ ok: false, error: "Every match for this session needs to be filled before locking matchups." }, { status: 400 });
    }

    const matchErrors = matches.flatMap((match) => validateMatchBox(snapshot, match).map((message) => `Match ${match.matchNumber}: ${message}`));
    if (matchErrors.length > 0) {
      return NextResponse.json({ ok: false, error: matchErrors.join(" ") }, { status: 400 });
    }
  }

  const { error } = await service.from("live_round_state").update({ matchups_locked: value }).eq("season_year", year).eq("round", session);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }
  if (value) {
    try {
      await syncLockedSessionToCareerArchive(year, session);
    } catch {
      return NextResponse.json({ ok: false, error: "Matchups locked, but Career Archive publishing failed. Run the Career Live Archive SQL first." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

## app/api/portal/tiger/sessions/start/route.ts

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { publishBroadcastEvent } from "@/lib/broadcast/publish";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session } = await request.json();
  if (!isValidSeasonYear(year) || typeof session !== "number" || !Number.isInteger(session)) {
    return NextResponse.json({ ok: false, error: "Missing session." }, { status: 400 });
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("start_live_round_atomic", { p_year: year, p_round: session });
  if (error) return NextResponse.json({ ok: false, error: error.code === "P0001" ? error.message : "Could not start this session. Retry safely." }, { status: 400 });

  try {
    await publishBroadcastEvent({ kind: "ROUND_STARTED", seasonYear: year, round: session });
  } catch (err) {
    console.error("broadcast publish failed:", err);
  }

  return NextResponse.json({ ok: true });
}
```
