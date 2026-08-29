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

alter table wagers_accounts enable row level security;
alter table mm_coin_bets enable row level security;
alter table wagers_market_settlements enable row level security;

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
