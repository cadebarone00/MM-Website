-- === Team Winner future (Maroon vs White) =================================
-- Which team finishes the whole event with more points (1 per match, 0.5
-- each for a halved match). See lib/wagers/teamWinnerFuture.ts.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

-- Per-matchup fair odds from the canonical match model, for matchups that
-- could be posted in rounds whose pairings aren't locked yet. Expensive to
-- produce, so Tiger's "Price Team Winner" action fills this table once and
-- every later odds refresh reuses it.
create table if not exists team_winner_pair_odds (
  season_year integer not null check (season_year between 2027 and 2034),
  pair_key text not null,
  maroon_win_probability numeric not null check (maroon_win_probability between 0 and 1),
  tie_probability numeric not null check (tie_probability between 0 and 1),
  white_win_probability numeric not null check (white_win_probability between 0 and 1),
  model_version text not null,
  computed_at timestamptz not null default now(),
  primary key (season_year, pair_key)
);

-- Every published Team Winner price. The newest row per season is the live
-- market; probabilities are null while the market isn't ready (blockers
-- lists why). inputs_as_of is the newest match odds/official state the
-- simulation saw — bets are refused while newer match data exists.
create table if not exists team_winner_odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2027 and 2034),
  model_version text not null,
  maroon_win_probability numeric check (maroon_win_probability between 0 and 1),
  tie_probability numeric check (tie_probability between 0 and 1),
  white_win_probability numeric check (white_win_probability between 0 and 1),
  maroon_american_odds integer,
  tie_american_odds integer,
  white_american_odds integer,
  maroon_points numeric not null default 0,
  white_points numeric not null default 0,
  points_remaining numeric not null default 0,
  decided_result text check (decided_result in ('maroon', 'white', 'tie')),
  blockers jsonb not null default '[]',
  inputs_as_of timestamptz,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists team_winner_odds_snapshots_current_idx
  on team_winner_odds_snapshots (season_year, created_at desc);

alter table team_winner_pair_odds enable row level security;
alter table team_winner_odds_snapshots enable row level security;
drop policy if exists team_winner_pair_odds_select_all on team_winner_pair_odds;
create policy team_winner_pair_odds_select_all on team_winner_pair_odds for select using (true);
drop policy if exists team_winner_odds_snapshots_select_all on team_winner_odds_snapshots;
create policy team_winner_odds_snapshots_select_all on team_winner_odds_snapshots for select using (true);
-- Writes happen server-side with the service-role key only.

-- Settles team-winner:<year> once every scheduled match is closed out. Does
-- nothing while any round is unset/unlocked or any match is still open, and
-- nothing if the market already settled — so it is safe to call repeatedly.
create or replace function settle_team_winner_if_final(p_year integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_market text := 'team-winner:' || p_year;
  v_round_count integer;
  v_locked_rounds integer;
  v_boxes integer;
  v_closed integer;
  v_maroon numeric;
  v_white numeric;
begin
  select round_count into v_round_count from live_tournament_settings where season_year = p_year;
  if v_round_count is null then return; end if;

  select count(*) into v_locked_rounds
  from live_round_state r
  where r.season_year = p_year and r.round between 1 and v_round_count and r.matchups_locked
    and exists (select 1 from live_match_boxes b where b.season_year = p_year and b.round = r.round);
  if v_locked_rounds < v_round_count then return; end if;

  select count(*), count(*) filter (where s.closed_out_at is not null and s.official_result is not null),
         coalesce(sum(case s.official_result when 'maroon' then 1 when 'tie' then 0.5 else 0 end), 0),
         coalesce(sum(case s.official_result when 'white' then 1 when 'tie' then 0.5 else 0 end), 0)
    into v_boxes, v_closed, v_maroon, v_white
  from live_match_boxes b
  left join live_match_official_state s on s.match_box_id = b.id
  where b.season_year = p_year and b.round between 1 and v_round_count;
  if v_boxes = 0 or v_closed < v_boxes then return; end if;

  -- Same market-keyed lock settle_mm_coin_market()/place_mm_coin_bet() use;
  -- taken first so the "already settled" check can't race another closeout.
  perform pg_advisory_xact_lock(hashtext(v_market));
  if exists (select 1 from wagers_market_settlements where market_key = v_market) then return; end if;
  perform settle_mm_coin_market(v_market, case when v_maroon > v_white then 'maroon' when v_white > v_maroon then 'white' else 'tie' end);
end $$;
revoke all on function settle_team_winner_if_final(integer) from public, anon, authenticated;

-- Runs inside Tiger's Close Out Match transaction (close_live_match_atomic),
-- so the last closeout and the Team Winner payout commit together.
create or replace function live_official_state_settle_team_winner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.closed_out_at is not null and (tg_op = 'INSERT' or old.closed_out_at is null) then
    perform settle_team_winner_if_final(new.season_year);
  end if;
  return new;
end $$;

drop trigger if exists live_official_state_settle_team_winner on live_match_official_state;
create trigger live_official_state_settle_team_winner
  after insert or update on live_match_official_state
  for each row execute function live_official_state_settle_team_winner();
