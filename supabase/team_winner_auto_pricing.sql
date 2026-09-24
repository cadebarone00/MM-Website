-- === Team Winner: automatic pricing =======================================
-- Replaces Tiger's "Price Team Winner" button. Matchup odds are now priced in
-- the background, in chunks, and re-priced whenever a player's Career
-- Archive data changes: after every confirmed hole, every submitted handicap
-- round, and on Wagers Futures tab views. See refreshTeamWinnerOdds in
-- lib/wagers/teamWinnerPricing.ts.
--
-- Run once in the Supabase SQL editor, AFTER team_winner_future.sql. Safe to
-- re-run.

-- A matchup the model can't price (e.g. a player with no Career Archive
-- history on that course) is remembered so the background worker doesn't
-- retry it forever. Its probabilities are null.
alter table team_winner_pair_odds alter column maroon_win_probability drop not null;
alter table team_winner_pair_odds alter column tie_probability drop not null;
alter table team_winner_pair_odds alter column white_win_probability drop not null;
alter table team_winner_pair_odds add column if not exists unpriceable boolean not null default false;

-- Fingerprint of the Career Archive data each matchup was priced from. When a
-- player gets a new hole (live scoring, a Tiger correction, or a submitted
-- handicap round) their matchups no longer match and are re-priced in the
-- background, keeping the previous price until the new one lands.
alter table team_winner_pair_odds add column if not exists input_signature text;

-- One pricing worker per season at a time: concurrent page views would
-- otherwise all run the same expensive matchups.
create table if not exists team_winner_pricing_lease (
  season_year integer primary key check (season_year between 2027 and 2034),
  locked_until timestamptz not null default now()
);
alter table team_winner_pricing_lease enable row level security;
-- No policies: only the service role (and the function below) touch it.

-- Returns true and holds the lease for p_seconds if nobody else holds it.
create or replace function claim_team_winner_pricing(p_year integer, p_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_claimed boolean;
begin
  insert into team_winner_pricing_lease (season_year, locked_until)
  values (p_year, now() - interval '1 second')
  on conflict (season_year) do nothing;

  update team_winner_pricing_lease
    set locked_until = now() + make_interval(secs => p_seconds)
    where season_year = p_year and locked_until < now()
    returning true into v_claimed;
  return coalesce(v_claimed, false);
end $$;
revoke all on function claim_team_winner_pricing(integer, integer) from public, anon, authenticated;
grant execute on function claim_team_winner_pricing(integer, integer) to service_role;
