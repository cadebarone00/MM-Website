-- supabase/golf_trip_scoring_submission.sql
-- Player & Attest Step 5: permanent, server-decided Submit & Save.
--
-- scorecard_submissions  one row per golfer per playing group (unique): who, which trip round, when, who pressed it,
--                        the card version that was verified, and a snapshot of the 18 holes as submitted.
-- submit_trip_scorecard  the only way in. It takes the SAME group lock as save_hole_scores / save_hole_score_ops
--                        (select … for update on scoring_groups), so a submission and a score write can never
--                        interleave: verification and locking see one consistent state. It checks, from saved data only
--                        (never anything the phone claims):
--                          * the signed-in golfer is submitting their own card, and has an attester;
--                          * holes 1–18 each have their strokes, putts, fairway and green (trip courses have no pars yet,
--                            so every hole asks for a fairway, as the Scoring sheet does);
--                          * their attester's strokes match on every hole;
--                          * the card version (sum of the versions of their rows and their attester's rows for them) is
--                            the one the phone verified: anything newer means the phone's view is stale.
--                        Then it records the submission and stamps scoring_group_players.submitted_at, which the save
--                        functions already refuse to write past ("That card is already submitted."), including late
--                        writes from an old offline queue. Asking again returns the first submission (idempotent).
--
-- Reads: trip members may read submissions (RLS, same rule as the scoring tables); nobody writes directly.
-- Prerequisites: golf_trip_scoring.sql (and golf_trip_scoring_offline.sql for save_hole_score_ops). Additive: one new
-- table and one new function; changes and removes no data. Safe to run more than once.
-- Undo: drop function public.submit_trip_scorecard(uuid, uuid, uuid, integer); drop table public.scorecard_submissions;
--       (and clear scoring_group_players.submitted_at if cards should reopen).

begin;

create table if not exists public.scorecard_submissions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  golfer_profile_id uuid not null,
  golf_trip_id uuid references public.golf_trips(id) on delete cascade,
  golf_trip_round_id uuid references public.golf_trip_rounds(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references public.profiles(id),
  card_version integer not null check (card_version >= 0),
  -- [{hole, strokes, putts, fairway, green, penaltyFairway, penaltyGreen, attestStrokes}] as verified.
  card jsonb not null check (jsonb_typeof(card) = 'array' and jsonb_array_length(card) = 18),
  unique (group_id, golfer_profile_id),
  foreign key (group_id, golfer_profile_id) references public.scoring_group_players(group_id, profile_id) on delete cascade
);
create index if not exists scorecard_submissions_trip_idx on public.scorecard_submissions (golf_trip_id);

alter table public.scorecard_submissions enable row level security;
drop policy if exists scorecard_submissions_select on public.scorecard_submissions;
create policy scorecard_submissions_select on public.scorecard_submissions for select to authenticated using (public.can_see_scoring_group(group_id, auth.uid()));
revoke all on public.scorecard_submissions from anon, authenticated;
grant select on public.scorecard_submissions to authenticated;

-- p_card_version = the version the phone verified (see above). Answers
--   {status: submitted | already-submitted, submittedAt, scoring}  or
--   {status: rejected, reason: incomplete | mismatch | stale | no-attester, holes: [...], scoring}.
-- Raises 42501 when the signed-in profile isn't the golfer (or isn't in the group) and P0002 for a missing group.
create or replace function public.submit_trip_scorecard(p_profile uuid, p_group uuid, p_golfer uuid, p_card_version integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_group scoring_groups;
  v_player scoring_group_players;
  v_existing scorecard_submissions;
  v_round_number integer;
  v_holes integer[];
  v_version integer;
  v_card jsonb;
begin
  -- Same lock as every score write for this group: no write can land between the checks and the lock below.
  select * into v_group from scoring_groups where id = p_group for update;
  if v_group.id is null or not is_scoring_group_player(p_group, p_profile) then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;
  if p_profile <> p_golfer then raise exception 'You can only submit your own card.' using errcode = '42501'; end if;
  select r.round_number into v_round_number from golf_trip_rounds r where r.id = v_group.golf_trip_round_id;
  select * into v_player from scoring_group_players where group_id = p_group and profile_id = p_golfer;

  select * into v_existing from scorecard_submissions where group_id = p_group and golfer_profile_id = p_golfer;
  if v_existing.id is not null then
    return jsonb_build_object('status', 'already-submitted', 'submittedAt', v_existing.submitted_at,
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;
  if v_player.attester_profile_id is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'no-attester', 'holes', '[]'::jsonb,
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  -- Every hole needs my strokes and stats.
  select coalesce(array_agg(h order by h), '{}') into v_holes from generate_series(1, 18) h
    where not exists (select 1 from hole_score_entries e where e.group_id = p_group and e.scored_profile_id = p_golfer
      and e.entered_by_profile_id = p_golfer and e.hole = h and e.strokes is not null and e.putts is not null and e.fairway is not null and e.green is not null);
  if cardinality(v_holes) > 0 then
    return jsonb_build_object('status', 'rejected', 'reason', 'incomplete', 'holes', to_jsonb(v_holes),
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  -- My attester's strokes must match mine on every hole.
  select coalesce(array_agg(h order by h), '{}') into v_holes from generate_series(1, 18) h
    where (select e.strokes from hole_score_entries e where e.group_id = p_group and e.scored_profile_id = p_golfer and e.entered_by_profile_id = p_golfer and e.hole = h)
      is distinct from
          (select a.strokes from hole_score_entries a where a.group_id = p_group and a.scored_profile_id = p_golfer and a.entered_by_profile_id = v_player.attester_profile_id and a.hole = h);
  if cardinality(v_holes) > 0 then
    return jsonb_build_object('status', 'rejected', 'reason', 'mismatch', 'holes', to_jsonb(v_holes),
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  -- The phone verified exactly this state (nothing changed underneath it).
  select coalesce(sum(e.version), 0) into v_version from hole_score_entries e
    where e.group_id = p_group and e.scored_profile_id = p_golfer and e.entered_by_profile_id in (p_golfer, v_player.attester_profile_id);
  if v_version is distinct from p_card_version then
    return jsonb_build_object('status', 'rejected', 'reason', 'stale', 'holes', '[]'::jsonb,
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  select jsonb_agg(jsonb_build_object('hole', e.hole, 'strokes', e.strokes, 'putts', e.putts, 'fairway', e.fairway, 'green', e.green,
      'penaltyFairway', e.penalty_fairway, 'penaltyGreen', e.penalty_green,
      'attestStrokes', (select a.strokes from hole_score_entries a where a.group_id = p_group and a.scored_profile_id = p_golfer
        and a.entered_by_profile_id = v_player.attester_profile_id and a.hole = e.hole)) order by e.hole)
    into v_card from hole_score_entries e
    where e.group_id = p_group and e.scored_profile_id = p_golfer and e.entered_by_profile_id = p_golfer;

  insert into scorecard_submissions (group_id, golfer_profile_id, golf_trip_id, golf_trip_round_id, submitted_by, card_version, card)
  values (p_group, p_golfer, v_group.golf_trip_id, v_group.golf_trip_round_id, p_profile, v_version, v_card)
  on conflict (group_id, golfer_profile_id) do nothing
  returning * into v_existing;
  update scoring_group_players set submitted_at = coalesce(submitted_at, v_existing.submitted_at, now()) where group_id = p_group and profile_id = p_golfer;
  select * into v_existing from scorecard_submissions where group_id = p_group and golfer_profile_id = p_golfer;
  return jsonb_build_object('status', 'submitted', 'submittedAt', v_existing.submitted_at,
    'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
end;
$$;

revoke all on function public.submit_trip_scorecard(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.submit_trip_scorecard(uuid, uuid, uuid, integer) to service_role;

commit;
