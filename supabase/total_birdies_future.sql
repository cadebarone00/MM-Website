-- === Total Birdies future =================================================
-- Every birdie (exactly one under par) made by the whole field across every
-- Singles and Fourball round, as an Over/Under. See
-- lib/wagers/totalBirdiesFuture.ts.
--
-- Run once in the Supabase SQL editor, AFTER team_winner_future.sql,
-- low_individual_future.sql and hole_in_one_future.sql (this file replaces
-- their shared closeout trigger function so it settles all four markets).
-- Safe to re-run.

-- Every published Total Birdies line. The newest row per season is the live
-- market; line/probabilities are null while it isn't ready (blockers lists
-- why) and once every hole is in.
create table if not exists total_birdies_odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2027 and 2034),
  model_version text not null,
  line numeric,
  over_probability numeric check (over_probability between 0 and 1),
  under_probability numeric check (under_probability between 0 and 1),
  expected_total numeric,
  birdies_so_far integer not null default 0,
  holes_remaining integer not null default 0,
  blockers jsonb not null default '[]',
  inputs_as_of timestamptz,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists total_birdies_odds_snapshots_current_idx
  on total_birdies_odds_snapshots (season_year, created_at desc);

alter table total_birdies_odds_snapshots enable row level security;
drop policy if exists total_birdies_odds_snapshots_select_all on total_birdies_odds_snapshots;
create policy total_birdies_odds_snapshots_select_all on total_birdies_odds_snapshots for select using (true);
-- Writes happen server-side with the service-role key only.

-- Settles total-birdies:<year> once every round is locked, every match is
-- closed out, and every rostered player has a confirmed score on all 18
-- holes of every Singles/Fourball round (a missing hole holds settlement).
-- The line moves during the event, so each bet is graded against the line
-- in its own selection key ("over:41.5" / "under:41.5"). Half lines mean
-- there are no pushes. Safe to call repeatedly; a no-op until final and
-- after settling.
create or replace function settle_total_birdies_if_final(p_year integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_market text := 'total-birdies:' || p_year;
  v_round_count integer;
  v_locked_rounds integer;
  v_boxes integer;
  v_closed integer;
  v_rounds integer[];
  v_incomplete integer;
  v_total integer;
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

  select count(*) filter (where holes < 18 * cardinality(v_rounds)) into v_incomplete
  from (
    select r.player_slug, count(h.hole) as holes
    from live_roster r
    left join live_hole_scores h
      on h.season_year = p_year and h.player_slug = r.player_slug and h.round = any(v_rounds)
     and h.confirmed_by is not null and h.score > 0
    where r.season_year = p_year
    group by r.player_slug
  ) totals;
  if v_incomplete is null or v_incomplete > 0 then return; end if;

  -- Pars come from each round's course setup, falling back to the course's
  -- own holes — the same source the app's scoring uses.
  with setups as (
    select r.round,
           coalesce(case when jsonb_typeof(r.course_setup -> 'holes') = 'array' and jsonb_array_length(r.course_setup -> 'holes') = 18 then r.course_setup -> 'holes' end, c.holes) as holes
    from live_round_state r
    left join live_courses c on c.id = r.course_id
    where r.season_year = p_year and r.round = any(v_rounds)
  ),
  pars as (
    select s.round, (hole ->> 'number')::integer as hole, (hole ->> 'par')::integer as par
    from setups s, jsonb_array_elements(s.holes) hole
  )
  select count(*) into v_total
  from live_hole_scores h
  join pars p on p.round = h.round and p.hole = h.hole
  where h.season_year = p_year and h.confirmed_by is not null and h.score = p.par - 1
    and h.player_slug in (select player_slug from live_roster where season_year = p_year);

  perform pg_advisory_xact_lock(hashtext(v_market));
  if exists (select 1 from wagers_market_settlements where market_key = v_market) then return; end if;

  -- settled_by is required: the host closing out, or (for a server-side
  -- recheck after a late score) the first host account.
  v_actor := coalesce(auth.uid(), (select id from profiles where is_host order by created_at limit 1));
  insert into wagers_market_settlements (market_key, winning_selection_key, settled_by)
  values (v_market, 'total:' || v_total, v_actor);

  with winners as (
    select id, profile_id, potential_payout
    from mm_coin_bets
    where market_key = v_market and status = 'pending'
      and ((split_part(selection_key, ':', 1) = 'over' and v_total > split_part(selection_key, ':', 2)::numeric)
        or (split_part(selection_key, ':', 1) = 'under' and v_total < split_part(selection_key, ':', 2)::numeric))
  ),
  credited as (
    update wagers_accounts a
      set mm_coins_balance = mm_coins_balance + w.total_payout
      from (select profile_id, sum(potential_payout) as total_payout from winners group by profile_id) w
      where w.profile_id = a.profile_id
    returning a.profile_id
  )
  update mm_coin_bets
    set status = 'won', settled_at = now()
    where id in (select id from winners);

  update mm_coin_bets
    set status = 'lost', settled_at = now()
    where market_key = v_market and status = 'pending';
end $$;
revoke all on function settle_total_birdies_if_final(integer) from public, anon, authenticated;
grant execute on function settle_total_birdies_if_final(integer) to service_role;

-- Replaces the shared closeout trigger function: every match closeout
-- (inside Tiger's Close Out Match transaction) now checks all four futures.
create or replace function live_official_state_settle_team_winner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.closed_out_at is not null and (tg_op = 'INSERT' or old.closed_out_at is null) then
    perform settle_team_winner_if_final(new.season_year);
    perform settle_low_individual_if_final(new.season_year);
    perform settle_hole_in_one_if_final(new.season_year);
    perform settle_total_birdies_if_final(new.season_year);
  end if;
  return new;
end $$;
