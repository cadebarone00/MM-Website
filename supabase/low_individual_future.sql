-- === Low Individual future ================================================
-- The player with the fewest total strokes across every Singles and Fourball
-- round (Foursome doesn't count). Ties for first settle dead heat. See
-- lib/wagers/lowIndividualFuture.ts.
--
-- Run once in the Supabase SQL editor, AFTER team_winner_future.sql (this
-- file replaces that file's closeout trigger function so it settles both
-- markets). Safe to re-run.

-- Every published Low Individual price. The newest row per season is the
-- live market. probabilities/american_odds are {player_slug: value} maps and
-- null while the market isn't ready (blockers lists why).
create table if not exists low_individual_odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2027 and 2034),
  model_version text not null,
  probabilities jsonb,
  american_odds jsonb,
  standings jsonb not null default '[]',
  holes_remaining integer not null default 0,
  blockers jsonb not null default '[]',
  inputs_as_of timestamptz,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists low_individual_odds_snapshots_current_idx
  on low_individual_odds_snapshots (season_year, created_at desc);

alter table low_individual_odds_snapshots enable row level security;
drop policy if exists low_individual_odds_snapshots_select_all on low_individual_odds_snapshots;
create policy low_individual_odds_snapshots_select_all on low_individual_odds_snapshots for select using (true);
-- Writes happen server-side with the service-role key only.

-- Settles low-individual:<year> once every round is locked, every match is
-- closed out, and every rostered player has a confirmed score on all 18
-- holes of every Singles/Fourball round. A missing hole holds settlement
-- until Tiger enters it. Dead heat: with k players tied for the low total,
-- each winning bet is paid potential_payout / k (its stake split k ways at
-- full odds), and the bet's potential_payout is rewritten to what was paid
-- so the portfolio and test-season reversal stay exact. Safe to call
-- repeatedly; a no-op until final and after settling.
create or replace function settle_low_individual_if_final(p_year integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_market text := 'low-individual:' || p_year;
  v_round_count integer;
  v_locked_rounds integer;
  v_boxes integer;
  v_closed integer;
  v_rounds integer[];
  v_incomplete integer;
  v_best numeric;
  v_winners text[];
  v_k integer;
  v_actor uuid;
begin
  select round_count into v_round_count from live_tournament_settings where season_year = p_year;
  if v_round_count is null then return; end if;

  select count(*) into v_locked_rounds
  from live_round_state r
  where r.season_year = p_year and r.round between 1 and v_round_count and r.matchups_locked and r.format is not null
    and exists (select 1 from live_match_boxes b where b.season_year = p_year and b.round = r.round);
  if v_locked_rounds < v_round_count then return; end if;

  select count(*), count(*) filter (where s.closed_out_at is not null)
    into v_boxes, v_closed
  from live_match_boxes b
  left join live_match_official_state s on s.match_box_id = b.id
  where b.season_year = p_year and b.round between 1 and v_round_count;
  if v_boxes = 0 or v_closed < v_boxes then return; end if;

  select array_agg(round) into v_rounds
  from live_round_state
  where season_year = p_year and round between 1 and v_round_count and format in ('Singles', 'Fourball');
  if v_rounds is null then return; end if;

  with totals as (
    select r.player_slug, count(h.hole) as holes, coalesce(sum(h.score), 0) as strokes
    from live_roster r
    left join live_hole_scores h
      on h.season_year = p_year and h.player_slug = r.player_slug and h.round = any(v_rounds)
     and h.confirmed_by is not null and h.score > 0
    where r.season_year = p_year
    group by r.player_slug
  )
  select count(*) filter (where holes < 18 * cardinality(v_rounds)), min(strokes)
    into v_incomplete, v_best
  from totals;
  if v_incomplete is null or v_incomplete > 0 or v_best is null then return; end if;

  select array_agg(r.player_slug order by r.player_slug) into v_winners
  from live_roster r
  where r.season_year = p_year
    and (select sum(h.score) from live_hole_scores h
         where h.season_year = p_year and h.player_slug = r.player_slug and h.round = any(v_rounds)
           and h.confirmed_by is not null and h.score > 0) = v_best;
  v_k := cardinality(v_winners);
  if v_k is null or v_k = 0 then return; end if;

  -- Same market-keyed lock place_mm_coin_bet() takes, so no bet slips in
  -- between the "already settled" check and settling.
  perform pg_advisory_xact_lock(hashtext(v_market));
  if exists (select 1 from wagers_market_settlements where market_key = v_market) then return; end if;

  -- settled_by is required: the host closing out, or (for a server-side
  -- recheck after a late score) the first host account.
  v_actor := coalesce(auth.uid(), (select id from profiles where is_host order by created_at limit 1));
  insert into wagers_market_settlements (market_key, winning_selection_key, settled_by)
  values (v_market, array_to_string(v_winners, ','), v_actor);

  update mm_coin_bets
    set potential_payout = round(potential_payout / v_k, 2)
    where market_key = v_market and selection_key = any(v_winners) and status = 'pending';

  update wagers_accounts a
    set mm_coins_balance = mm_coins_balance + w.total_payout
    from (
      select profile_id, sum(potential_payout) as total_payout
      from mm_coin_bets
      where market_key = v_market and selection_key = any(v_winners) and status = 'pending'
      group by profile_id
    ) w
    where w.profile_id = a.profile_id;

  update mm_coin_bets
    set status = 'won', settled_at = now()
    where market_key = v_market and selection_key = any(v_winners) and status = 'pending';

  update mm_coin_bets
    set status = 'lost', settled_at = now()
    where market_key = v_market and status = 'pending';
end $$;
revoke all on function settle_low_individual_if_final(integer) from public, anon, authenticated;
grant execute on function settle_low_individual_if_final(integer) to service_role;

-- Replaces team_winner_future.sql's trigger function: every match closeout
-- (inside Tiger's Close Out Match transaction) now checks both futures.
create or replace function live_official_state_settle_team_winner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.closed_out_at is not null and (tg_op = 'INSERT' or old.closed_out_at is null) then
    perform settle_team_winner_if_final(new.season_year);
    perform settle_low_individual_if_final(new.season_year);
  end if;
  return new;
end $$;
