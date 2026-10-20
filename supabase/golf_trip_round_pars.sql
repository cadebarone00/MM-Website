-- H5C Part 1 — a Golf Trip round's confirmed hole pars, linked to the course + tee they came from, and each scoring
-- group's starting hole (shotgun starts). Additive: new columns and functions only; no rows are rewritten except the
-- one-time "manual" label on pars an organizer already typed with set_trip_momentum_pars.
--
-- The pars themselves stay in golf_trip_rounds.momentum_pars (golf_trip_momentum.sql), the one per-round pars column
-- the momentum alerts and trip games already read. This file adds where they came from and who confirmed them:
--   * source 'course' — loaded from the course library / OpenGolf for the round's course + tee (lib/platform/tripRoundPars.ts),
--     checked again on the server before saving; 'manual' — typed or edited by the organizer.
--   * pars are only ever saved by the organizer, so saved pars ARE the confirmed snapshot; nothing is ever guessed.
--   * locked once the round has a score (same rule as set_trip_momentum_pars), and cleared if the round's course changes
--     before then.
--
-- Prerequisites, in order: golf_trips.sql, golf_trip_invitations.sql, golf_trip_flights.sql, golf_trip_scoring.sql,
-- golf_trip_scoring_fix_groups.sql, golf_trip_scoring_offline.sql, golf_trip_momentum.sql. Run AFTER golf_trip_scoring.sql:
-- it replaces get_trip_round_scoring (same answer plus 'pars' and each group's 'startHole'). Safe to run more than once.
-- Not run in staging or production. Undo: see the bottom of this file.

begin;

alter table public.golf_trip_rounds add column if not exists par_source text check (par_source in ('course', 'manual'));
alter table public.golf_trip_rounds add column if not exists par_course_ref text check (par_course_ref is null or length(par_course_ref) <= 300);
alter table public.golf_trip_rounds add column if not exists par_course_name text check (par_course_name is null or length(par_course_name) <= 200);
alter table public.golf_trip_rounds add column if not exists par_tee text check (par_tee is null or length(par_tee) <= 200);
alter table public.golf_trip_rounds add column if not exists pars_confirmed_by uuid references public.profiles(id) on delete set null;
alter table public.golf_trip_rounds add column if not exists pars_confirmed_at timestamptz;
-- Pars typed before this file existed were organizer-entered: label them manual (only rows with pars and no label).
update public.golf_trip_rounds set par_source = 'manual' where momentum_pars is not null and par_source is null;

-- Shotgun starts: the hole a group tees off on (1 = a normal start). Fixed once the group has a score.
alter table public.scoring_groups add column if not exists start_hole integer not null default 1 check (start_hole between 1 and 18);

-- The round's par snapshot as JSON (null when no pars are saved). lockedAt = the round's first score.
create or replace function public.trip_round_pars_view(r public.golf_trip_rounds)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.momentum_pars is null then null else jsonb_build_object(
    'pars', to_jsonb(r.momentum_pars),
    'source', coalesce(r.par_source, 'manual'),
    'courseRef', r.par_course_ref,
    'courseName', r.par_course_name,
    'tee', r.par_tee,
    'confirmedBy', (select m.display_name from golf_trip_members m where m.golf_trip_id = r.golf_trip_id and m.profile_id = r.pars_confirmed_by),
    'confirmedAt', r.pars_confirmed_at,
    'lockedAt', (select min(g.assignments_locked_at) from scoring_groups g where g.golf_trip_round_id = r.id)
  ) end;
$$;
revoke all on function public.trip_round_pars_view(public.golf_trip_rounds) from public, anon, authenticated;

-- Organizer confirms a round's 18 pars (3–6 each). False = not this trip's organizer, no such round, bad pars, or the
-- round already has a score. p_source 'course' needs the course ref; the API checks those pars against the course first.
create or replace function public.confirm_trip_round_pars(p_profile uuid, p_trip uuid, p_round integer, p_pars integer[],
  p_source text, p_course_ref text, p_course_name text, p_tee text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r golf_trip_rounds;
begin
  if not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer') then return false; end if;
  select * into r from golf_trip_rounds where golf_trip_id = p_trip and round_number = p_round for update;
  if r.id is null or p_pars is null or array_length(p_pars, 1) is distinct from 18 or array_position(p_pars, null) is not null
     or not (p_pars <@ array[3, 4, 5, 6]) or p_source is null or p_source not in ('course', 'manual')
     or (p_source = 'course' and nullif(trim(coalesce(p_course_ref, '')), '') is null)
     or length(coalesce(p_course_ref, '')) > 300 or length(coalesce(p_course_name, '')) > 200 or length(coalesce(p_tee, '')) > 200 then
    return false;
  end if;
  -- Same lock as set_trip_momentum_pars: no changes once any group of this round has a hole entry.
  perform 1 from scoring_groups where golf_trip_round_id = r.id for update;
  if exists (select 1 from scoring_groups g join hole_score_entries e on e.group_id = g.id where g.golf_trip_round_id = r.id) then return false; end if;
  update golf_trip_rounds set momentum_pars = p_pars, par_source = p_source, par_course_ref = nullif(trim(coalesce(p_course_ref, '')), ''),
    par_course_name = nullif(trim(coalesce(p_course_name, '')), ''), par_tee = nullif(trim(coalesce(p_tee, '')), ''),
    pars_confirmed_by = p_profile, pars_confirmed_at = now()
  where id = r.id;
  return true;
end;
$$;
revoke all on function public.confirm_trip_round_pars(uuid, uuid, integer, integer[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_trip_round_pars(uuid, uuid, integer, integer[], text, text, text, text) to service_role;

-- The older organizer pars screen (Notifications → round pars) keeps working: its pars are labelled manual and confirmed.
create or replace function public.set_trip_momentum_pars(p_profile uuid, p_trip uuid, p_round integer, p_pars integer[])
returns boolean
language sql security definer set search_path = public as $$
  select public.confirm_trip_round_pars(p_profile, p_trip, p_round, p_pars, 'manual', null, null, null);
$$;
revoke all on function public.set_trip_momentum_pars(uuid, uuid, integer, integer[]) from public, anon, authenticated;
grant execute on function public.set_trip_momentum_pars(uuid, uuid, integer, integer[]) to service_role;

-- Organizer sets a group's starting hole (shotgun). False = not the organizer, not this trip's group, bad hole, or the
-- group already has a score.
create or replace function public.set_trip_group_start_hole(p_profile uuid, p_trip uuid, p_group uuid, p_start_hole integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare g scoring_groups;
begin
  if not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer') then return false; end if;
  select * into g from scoring_groups where id = p_group and golf_trip_id = p_trip for update;
  if g.id is null or p_start_hole is null or p_start_hole not between 1 and 18 then return false; end if;
  if g.assignments_locked_at is not null or exists (select 1 from hole_score_entries e where e.group_id = g.id) then return false; end if;
  update scoring_groups set start_hole = p_start_hole where id = g.id;
  return true;
end;
$$;
revoke all on function public.set_trip_group_start_hole(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.set_trip_group_start_hole(uuid, uuid, uuid, integer) to service_role;

-- A new course for the round (Trip Settings) before anyone has scored: the old course's pars no longer apply.
create or replace function public.clear_trip_round_pars_on_course_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.course_name is distinct from old.course_name and old.momentum_pars is not null
     and not exists (select 1 from scoring_groups g join hole_score_entries e on e.group_id = g.id where g.golf_trip_round_id = old.id) then
    new.momentum_pars := null; new.par_source := null; new.par_course_ref := null; new.par_course_name := null; new.par_tee := null;
    new.pars_confirmed_by := null; new.pars_confirmed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.clear_trip_round_pars_on_course_change() from public, anon, authenticated;
drop trigger if exists golf_trip_round_pars_course_change on public.golf_trip_rounds;
create trigger golf_trip_round_pars_course_change before update of course_name on public.golf_trip_rounds
  for each row execute function public.clear_trip_round_pars_on_course_change();

-- golf_trip_scoring.sql's reader, unchanged except: the round's 'pars' snapshot and each group's 'startHole'.
create or replace function public.get_trip_round_scoring(p_profile uuid, p_trip uuid, p_round_number integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_round golf_trip_rounds;
begin
  if golf_trip_member_id(p_profile, p_trip) is null then return null; end if;
  select * into v_round from golf_trip_rounds where golf_trip_id = p_trip and round_number = p_round_number;
  if v_round.id is null then return null; end if;
  return jsonb_build_object(
    'roundId', v_round.id, 'roundNumber', v_round.round_number,
    'pars', trip_round_pars_view(v_round),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'groupNumber', g.group_number, 'lockedAt', g.assignments_locked_at, 'startHole', g.start_hole,
        'players', (select jsonb_agg(jsonb_build_object(
            'profileId', p.profile_id, 'playOrder', p.play_order, 'side', p.side, 'attesterProfileId', p.attester_profile_id,
            'submittedAt', p.submitted_at,
            'displayName', coalesce((select m.display_name from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = p.profile_id), 'Player'))
          order by p.play_order) from scoring_group_players p where p.group_id = g.id))
      order by g.group_number) from scoring_groups g where g.golf_trip_round_id = v_round.id), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
        'scoredProfileId', e.scored_profile_id, 'enteredByProfileId', e.entered_by_profile_id, 'hole', e.hole, 'strokes', e.strokes,
        'putts', e.putts, 'fairway', e.fairway, 'green', e.green, 'penaltyFairway', e.penalty_fairway, 'penaltyGreen', e.penalty_green,
        'clientUpdatedAt', e.client_updated_at, 'version', e.version) order by e.scored_profile_id, e.entered_by_profile_id, e.hole)
      from hole_score_entries e join scoring_groups g on g.id = e.group_id where g.golf_trip_round_id = v_round.id), '[]'::jsonb));
end;
$$;

-- golf_trip_scoring_corrections.sql's finished-round snapshot, unchanged except each hole's par comes from the round's
-- confirmed pars (null when none), so profile history and trip stats classify holes with the real par. Only when the
-- corrections step is installed (scorecard_submissions exists); run this file after it.
do $do$
begin
  if to_regclass('public.scorecard_submissions') is null then return; end if;
  execute $f$
create or replace function public.trip_submission_round(s public.scorecard_submissions)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'source', 'trip',
    'sourceLabel', left(t.name, 120),
    'datePlayed', coalesce(r.play_date, (s.submitted_at at time zone 'utc')::date),
    'course', jsonb_build_object('ref', null, 'name', left(coalesce(nullif(trim(r.course_name), ''), t.destination), 200), 'place', left(t.destination, 200)),
    'tee', null,
    'holesPlayed', 18,
    'format', 'Stroke play',
    'holes', (select jsonb_agg(jsonb_build_object('number', (h->>'hole')::integer, 'par', r.momentum_pars[(h->>'hole')::integer], 'strokes', (h->>'strokes')::integer,
        'putts', (h->>'putts')::integer, 'fairway', h->>'fairway', 'green', h->>'green',
        'penalties', jsonb_build_object('fairway', coalesce((h->>'penaltyFairway')::boolean, false), 'green', coalesce((h->>'penaltyGreen')::boolean, false)))
        order by (h->>'hole')::integer) from jsonb_array_elements(s.card) h),
    'total', (select sum((h->>'strokes')::integer) from jsonb_array_elements(s.card) h),
    'countsForHandicap', false,
    'notCountedReason', 'No course rating for this tee',
    'differential', null,
    'enteredBy', 'player',
    'context', jsonb_build_object('golfTripId', s.golf_trip_id, 'golfTripRoundId', s.golf_trip_round_id,
      'scorecardSubmissionId', s.id, 'submissionRevision', s.revision))
  from golf_trip_rounds r join golf_trips t on t.id = r.golf_trip_id
  where r.id = s.golf_trip_round_id;
$$;
$f$;
end;
$do$;

commit;

-- Undo (run by hand; re-run golf_trip_scoring.sql, golf_trip_momentum.sql and golf_trip_scoring_corrections.sql
-- afterwards to restore their functions):
--   drop trigger if exists golf_trip_round_pars_course_change on public.golf_trip_rounds;
--   drop function if exists public.clear_trip_round_pars_on_course_change();
--   drop function if exists public.set_trip_group_start_hole(uuid, uuid, uuid, integer);
--   drop function if exists public.confirm_trip_round_pars(uuid, uuid, integer, integer[], text, text, text, text);
--   drop function if exists public.trip_round_pars_view(public.golf_trip_rounds);
--   alter table public.scoring_groups drop column if exists start_hole;
--   alter table public.golf_trip_rounds drop column if exists par_source, drop column if exists par_course_ref,
--     drop column if exists par_course_name, drop column if exists par_tee, drop column if exists pars_confirmed_by,
--     drop column if exists pars_confirmed_at;
