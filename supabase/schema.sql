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
