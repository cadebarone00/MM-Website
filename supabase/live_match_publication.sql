-- Run once in the Supabase SQL Editor after career_live_archive.sql.
-- This is the publication foundation: Career Archive contains only confirmed
-- individual scores, and official match state/odds/audit records have a
-- durable home. Route handlers will be the only writers (service role).

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
begin
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
    (season_year, round, player_slug, hole, score, putts, fir, gir, updated_at)
  values
    (new.season_year, new.round, new.player_slug, new.hole, new.score,
     new.putts, new.fir, new.gir, now())
  on conflict (season_year, round, player_slug, hole) do update
    set score = excluded.score,
        putts = excluded.putts,
        fir = excluded.fir,
        gir = excluded.gir,
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
