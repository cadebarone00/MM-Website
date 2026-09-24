-- === Hole in One future ===================================================
-- Will anyone make a hole in one during the event? Odds are computed on the
-- fly (lib/wagers/holeInOneFuture.ts), so there is no odds table — only
-- settlement lives here.
--
-- Run once in the Supabase SQL editor, AFTER team_winner_future.sql and
-- low_individual_future.sql (this file replaces their shared closeout
-- trigger function so it settles all three markets). Safe to re-run.

-- Settles hole-in-one:<year> once every round is locked and every match is
-- closed out: 'yes' if any confirmed score of 1 exists that season, else
-- 'no'. Safe to call repeatedly; a no-op until final and after settling.
create or replace function settle_hole_in_one_if_final(p_year integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_market text := 'hole-in-one:' || p_year;
  v_round_count integer;
  v_locked_rounds integer;
  v_boxes integer;
  v_closed integer;
begin
  select round_count into v_round_count from live_tournament_settings where season_year = p_year;
  if v_round_count is null then return; end if;

  select count(*) into v_locked_rounds
  from live_round_state r
  where r.season_year = p_year and r.round between 1 and v_round_count and r.matchups_locked
    and exists (select 1 from live_match_boxes b where b.season_year = p_year and b.round = r.round);
  if v_locked_rounds < v_round_count then return; end if;

  select count(*), count(*) filter (where s.closed_out_at is not null)
    into v_boxes, v_closed
  from live_match_boxes b
  left join live_match_official_state s on s.match_box_id = b.id
  where b.season_year = p_year and b.round between 1 and v_round_count;
  if v_boxes = 0 or v_closed < v_boxes then return; end if;

  perform pg_advisory_xact_lock(hashtext(v_market));
  if exists (select 1 from wagers_market_settlements where market_key = v_market) then return; end if;
  perform settle_mm_coin_market(
    v_market,
    case when exists (
      select 1 from live_hole_scores
      where season_year = p_year and round between 1 and v_round_count and confirmed_by is not null and score = 1
    ) then 'yes' else 'no' end
  );
end $$;
revoke all on function settle_hole_in_one_if_final(integer) from public, anon, authenticated;

-- Replaces the shared closeout trigger function: every match closeout
-- (inside Tiger's Close Out Match transaction) now checks all three futures.
create or replace function live_official_state_settle_team_winner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.closed_out_at is not null and (tg_op = 'INSERT' or old.closed_out_at is null) then
    perform settle_team_winner_if_final(new.season_year);
    perform settle_low_individual_if_final(new.season_year);
    perform settle_hole_in_one_if_final(new.season_year);
  end if;
  return new;
end $$;
