-- supabase/rounds_everywhere.sql
-- Every qualifying round counts (project_specs.md, "Every qualifying round counts"). Rounds from all four ways of
-- playing reach the golfer's Profile → Rounds (player_rounds) through the one door the scoring side already uses,
-- publish_player_round, so the handicap sees them:
--   - Tourney (code tournaments): when a player submits their round card, that round is saved to their profile.
--   - League: when a group's scorer submits the group card, every player in the group gets the round (the scorer is the
--     attester, so it counts like the player's own — owner decision 2026-11-13).
--   - Golf Trip: trip rounds were always saved but never counted (no course rating). When the organizer confirms a
--     round's pars from the course with one tee, that tee's rating and slope are saved with the pars, and cards
--     submitted after that count when they qualify.
-- A round counts (the same rule as lib/platform/playerRounds.ts handicapEligibility): all 18 holes of the player's own
-- ball with a tee rating and slope (slope 55–155); differential = (score − rating) × 113 ÷ slope, one decimal. Rounds
-- that don't qualify are still saved, with the reason. A round is saved once (re-submitting never makes a second copy)
-- and stays on the profile if the tourney, league or trip is deleted.
-- Saving to the profile never stops a card being submitted: if it can't be saved, the card still goes in and the
-- database logs a warning.
--
-- Prerequisites: player_rounds.sql, tournament_codes.sql, leagues.sql, golf_trip_scoring_corrections.sql and
-- golf_trip_round_pars.sql. Safe to run more than once.
-- Undo: drop trigger code_tournament_cards_to_profile on public.code_tournament_cards;
--       drop trigger league_groups_to_profile on public.league_groups;
--       drop trigger golf_trip_round_tee_rating_reset on public.golf_trip_rounds;
--       alter table public.golf_trip_rounds drop column par_tee_rating, drop column par_tee_slope;
--       then re-run golf_trip_round_pars.sql (restores trip_submission_round) and player_rounds.sql (sources).

begin;

-- Rounds can now come from Tourneys and Leagues too.
alter table public.player_rounds drop constraint if exists player_rounds_source_check;
alter table public.player_rounds add constraint player_rounds_source_check
  check (source in ('trip', 'tournament', 'personal', 'history', 'legacy', 'tourney', 'league'));

-- A finished round's JSON for publish_player_round, worked out the same way everywhere. p_holes: [{number, par, strokes}].
create or replace function public.round_for_profile(p_source text, p_key text, p_label text, p_date date, p_course jsonb,
  p_tee jsonb, p_holes_played integer, p_holes jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_total integer := (select sum((h->>'strokes')::integer) from jsonb_array_elements(p_holes) h);
  v_rating numeric := (p_tee->>'rating')::numeric;
  v_slope integer := (p_tee->>'slope')::integer;
  v_full boolean := p_holes_played = 18 and jsonb_array_length(p_holes) = 18;
  v_rated boolean := coalesce(v_rating between 20 and 90 and v_slope between 55 and 155, false);
begin
  return jsonb_build_object(
    'source', p_source, 'sourceKey', p_key, 'sourceLabel', left(p_label, 120), 'datePlayed', p_date,
    'course', jsonb_build_object('ref', nullif(p_course->>'ref', ''), 'name', left(coalesce(nullif(trim(p_course->>'name'), ''), 'Golf course'), 200),
      'place', left(coalesce(p_course->>'place', ''), 200)),
    'tee', case when p_tee is null or jsonb_typeof(p_tee) <> 'object' then null
      else jsonb_build_object('name', left(p_tee->>'name', 60), 'rating', case when v_rated then v_rating end, 'slope', case when v_rated then v_slope end) end,
    'holesPlayed', p_holes_played, 'format', 'Stroke play',
    'holes', (select jsonb_agg(jsonb_build_object('number', (h->>'number')::integer, 'par', (h->>'par')::integer, 'strokes', (h->>'strokes')::integer,
        'putts', null, 'fairway', null, 'green', null, 'penalties', jsonb_build_object('fairway', false, 'green', false)) order by (h->>'number')::integer)
      from jsonb_array_elements(p_holes) h),
    'total', v_total,
    'countsForHandicap', v_full and v_rated,
    'notCountedReason', case when p_holes_played = 9 then '9 holes: counts when combined with another 9'
      when not v_full then 'Not every hole was scored' when not v_rated then 'No course rating for this tee' end,
    'differential', case when v_full and v_rated then round((v_total - v_rating) * 113 / v_slope, 1) end,
    'enteredBy', 'player');
end $$;

-- Saves one round to a profile; a round that can't be saved is logged, never raised (so the card still submits).
create or replace function public.publish_round_quietly(p_profile uuid, p_round jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_round is null or p_round->>'total' is null then return; end if;
  perform publish_player_round(p_profile, p_round);
exception when others then
  raise warning 'Round % not saved to profile %: %', p_round->>'sourceKey', p_profile, sqlerrm;
end $$;

-- ── Tourneys ───────────────────────────────────────────────────────────────────────────────────────────────────

-- One player's round in a code tournament, from its setup (course, pars, tee with rating + slope) and their strokes.
create or replace function public.tourney_round_for_profile(p_tournament uuid, p_round integer, p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select round_for_profile('tourney', 'tourney:' || t.id || ':' || r.number, t.name, r.round_date, r.setup->'course', r.setup->'tee',
    jsonb_array_length(r.setup #> '{course,par}'),
    coalesce((select jsonb_agg(jsonb_build_object('number', h.hole, 'par', (r.setup #>> array['course', 'par', (h.hole - 1)::text])::integer, 'strokes', h.strokes))
      from code_tournament_holes h where h.tournament_id = t.id and h.round = r.number and h.profile_id = p_profile), '[]'::jsonb))
  from code_tournaments t join code_tournament_rounds r on r.tournament_id = t.id
  where t.id = p_tournament and r.number = p_round;
$$;

create or replace function public.code_tournament_card_to_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform publish_round_quietly(new.profile_id, tourney_round_for_profile(new.tournament_id, new.round, new.profile_id));
  return new;
end $$;
drop trigger if exists code_tournament_cards_to_profile on public.code_tournament_cards;
create trigger code_tournament_cards_to_profile after insert on public.code_tournament_cards
  for each row execute function public.code_tournament_card_to_profile();

-- ── Leagues ────────────────────────────────────────────────────────────────────────────────────────────────────

-- One player's league round, from the league's course (pars, tee with rating + slope) and their strokes.
create or replace function public.league_round_for_profile(p_league uuid, p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select round_for_profile('league', 'league:' || l.id, l.name, l.round_date, l.course, l.course->'tee', jsonb_array_length(l.course->'par'),
    coalesce((select jsonb_agg(jsonb_build_object('number', h.hole, 'par', (l.course #>> array['par', (h.hole - 1)::text])::integer, 'strokes', h.strokes))
      from league_holes h where h.league_id = l.id and h.profile_id = p_profile), '[]'::jsonb))
  from leagues l where l.id = p_league;
$$;

create or replace function public.league_group_to_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_player uuid;
begin
  if old.submitted_at is null and new.submitted_at is not null then
    foreach v_player in array new.players loop
      perform publish_round_quietly(v_player, league_round_for_profile(new.league_id, v_player));
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists league_groups_to_profile on public.league_groups;
create trigger league_groups_to_profile after update of submitted_at on public.league_groups
  for each row execute function public.league_group_to_profile();

-- ── Golf Trips ─────────────────────────────────────────────────────────────────────────────────────────────────

alter table public.golf_trip_rounds add column if not exists par_tee_rating numeric(4, 1) check (par_tee_rating is null or par_tee_rating between 20 and 90);
alter table public.golf_trip_rounds add column if not exists par_tee_slope integer check (par_tee_slope is null or par_tee_slope between 55 and 155);

-- A different course, tee or set of pars means the saved rating no longer belongs to this round.
create or replace function public.reset_trip_round_tee_rating()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.par_source, new.par_course_ref, new.par_tee, new.momentum_pars) is distinct from (old.par_source, old.par_course_ref, old.par_tee, old.momentum_pars) then
    new.par_tee_rating := null;
    new.par_tee_slope := null;
  end if;
  return new;
end $$;
drop trigger if exists golf_trip_round_tee_rating_reset on public.golf_trip_rounds;
create trigger golf_trip_round_tee_rating_reset before update of par_source, par_course_ref, par_tee, momentum_pars on public.golf_trip_rounds
  for each row execute function public.reset_trip_round_tee_rating();

-- Organizer: the rating and slope of the one tee the round's course pars were confirmed from (Trip Settings → Round
-- pars). Only for pars from the course; false = refused.
create or replace function public.set_trip_round_tee_rating(p_profile uuid, p_trip uuid, p_round integer, p_rating numeric, p_slope integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer') then return false; end if;
  if p_rating is null or p_slope is null or p_rating not between 20 and 90 or p_slope not between 55 and 155 then return false; end if;
  update golf_trip_rounds set par_tee_rating = round(p_rating, 1), par_tee_slope = p_slope
  where golf_trip_id = p_trip and round_number = p_round and par_source = 'course';
  return found;
end $$;

-- The trip card → profile round, now with the tee's rating and slope when the organizer confirmed them, so it can
-- count. Everything else is as golf_trip_round_pars.sql had it.
do $do$
begin
  execute $f$
create or replace function public.trip_submission_round(s public.scorecard_submissions)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'source', 'trip',
    'sourceLabel', left(t.name, 120),
    'datePlayed', coalesce(r.play_date, (s.submitted_at at time zone 'utc')::date),
    'course', jsonb_build_object('ref', null, 'name', left(coalesce(nullif(trim(r.course_name), ''), t.destination), 200), 'place', left(t.destination, 200)),
    'tee', case when x.is_rated then jsonb_build_object('name', left(r.par_tee, 60), 'rating', r.par_tee_rating, 'slope', r.par_tee_slope) end,
    'holesPlayed', 18,
    'format', 'Stroke play',
    'holes', (select jsonb_agg(jsonb_build_object('number', (h->>'hole')::integer, 'par', r.momentum_pars[(h->>'hole')::integer], 'strokes', (h->>'strokes')::integer,
        'putts', (h->>'putts')::integer, 'fairway', h->>'fairway', 'green', h->>'green',
        'penalties', jsonb_build_object('fairway', coalesce((h->>'penaltyFairway')::boolean, false), 'green', coalesce((h->>'penaltyGreen')::boolean, false)))
        order by (h->>'hole')::integer) from jsonb_array_elements(s.card) h),
    'total', x.total,
    'countsForHandicap', x.is_rated and x.is_full,
    'notCountedReason', case when not x.is_full then 'Not every hole was scored' when not x.is_rated then 'No course rating for this tee' end,
    'differential', case when x.is_rated and x.is_full then round((x.total - r.par_tee_rating) * 113 / r.par_tee_slope, 1) end,
    'enteredBy', 'player',
    'context', jsonb_build_object('golfTripId', s.golf_trip_id, 'golfTripRoundId', s.golf_trip_round_id,
      'scorecardSubmissionId', s.id, 'submissionRevision', s.revision))
  from golf_trip_rounds r join golf_trips t on t.id = r.golf_trip_id,
    lateral (select (select sum((h->>'strokes')::integer) from jsonb_array_elements(s.card) h) as total,
      (select count(*) from jsonb_array_elements(s.card) h where (h->>'strokes') is not null) = 18 as is_full,
      r.par_source = 'course' and r.par_tee_rating is not null and r.par_tee_slope is not null as is_rated) x
  where r.id = s.golf_trip_round_id;
$$;
$f$;
end;
$do$;

-- ── Rounds already submitted ───────────────────────────────────────────────────────────────────────────────────

-- Tourney cards and league groups submitted before this file: saved to profiles once (re-running changes nothing).
-- (Trip rounds were already saved; none had a rating before this file, so there's nothing to re-check.)
do $$
declare v_card record; v_group record; v_player uuid;
begin
  for v_card in select * from code_tournament_cards order by submitted_at loop
    perform publish_round_quietly(v_card.profile_id, tourney_round_for_profile(v_card.tournament_id, v_card.round, v_card.profile_id));
  end loop;
  for v_group in select * from league_groups where submitted_at is not null order by submitted_at loop
    foreach v_player in array v_group.players loop
      perform publish_round_quietly(v_player, league_round_for_profile(v_group.league_id, v_player));
    end loop;
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'round_for_profile(text, text, text, date, jsonb, jsonb, integer, jsonb)', 'publish_round_quietly(uuid, jsonb)',
    'tourney_round_for_profile(uuid, integer, uuid)', 'code_tournament_card_to_profile()', 'league_round_for_profile(uuid, uuid)',
    'league_group_to_profile()', 'reset_trip_round_tee_rating()', 'set_trip_round_tee_rating(uuid, uuid, integer, numeric, integer)',
    'trip_submission_round(public.scorecard_submissions)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  grant execute on function public.set_trip_round_tee_rating(uuid, uuid, integer, numeric, integer) to service_role;
end $$;

commit;
