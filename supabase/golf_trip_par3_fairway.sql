-- supabase/golf_trip_par3_fairway.sql
-- Golf Trips → submitting a card: a par 3 doesn't need a fairway (there's no fairway to hit). Before this, the server asked
-- for a fairway on all 18 holes while the scoring sheet (website and app) greys FWY out on par 3s, so any card with a par 3
-- was refused as "incomplete". The par comes from the round's confirmed pars (golf_trip_rounds.momentum_pars, set by the
-- organizer); with no pars confirmed every hole still asks for a fairway, exactly as before.
--
-- Replaces submit_trip_scorecard only: the same function as golf_trip_scoring_corrections.sql with that one check changed.
-- Requires golf_trip_scoring_corrections.sql and golf_trip_momentum.sql; if golf_trip_scoring_corrections.sql is ever run
-- again, run this file again after it. Safe to run more than once. Nothing else changes: no tables, no data.

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
  v_revision integer;
  v_request uuid;
  v_correction scorecard_correction_requests;
begin
  select * into v_group from scoring_groups where id = p_group for update;
  if v_group.id is null or not is_scoring_group_player(p_group, p_profile) then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;
  if p_profile <> p_golfer then raise exception 'You can only submit your own card.' using errcode = '42501'; end if;
  select r.round_number into v_round_number from golf_trip_rounds r where r.id = v_group.golf_trip_round_id;
  select * into v_player from scoring_group_players where group_id = p_group and profile_id = p_golfer;

  select * into v_existing from scorecard_submissions where group_id = p_group and golfer_profile_id = p_golfer;
  if v_existing.id is not null and v_existing.reopened_at is null then
    -- A replay: publishing the same revision again is "unchanged" (or restores a missing history row).
    perform publish_trip_submission(v_existing);
    return jsonb_build_object('status', 'already-submitted', 'submittedAt', v_existing.submitted_at,
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;
  if v_player.attester_profile_id is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'no-attester', 'holes', '[]'::jsonb,
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  select coalesce(array_agg(h order by h), '{}') into v_holes from generate_series(1, 18) h
    where not exists (select 1 from hole_score_entries e where e.group_id = p_group and e.scored_profile_id = p_golfer
      and e.entered_by_profile_id = p_golfer and e.hole = h and e.strokes is not null and e.putts is not null and e.green is not null
      -- No fairway on a par 3 (golf_trip_par3_fairway.sql): the round's confirmed par for the hole says so.
      and (e.fairway is not null or (select r.momentum_pars[h] from golf_trip_rounds r where r.id = v_group.golf_trip_round_id) = 3));
  if cardinality(v_holes) > 0 then
    return jsonb_build_object('status', 'rejected', 'reason', 'incomplete', 'holes', to_jsonb(v_holes),
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  -- A reopened card: every approved hole needs a fresh attestation, saved by the attester for THIS request (the
  -- trigger's stamp). A number left over from before the approval doesn't count, even if it matches. Checked before the
  -- match, so the golfer is told "waiting for your attester" rather than "doesn't match".
  if v_existing.id is not null then
    select * into v_correction from scorecard_correction_requests
      where group_id = p_group and golfer_profile_id = p_golfer and status = 'approved';
    if v_correction.id is null then raise exception 'This card has no approved correction.' using errcode = '22023'; end if;
    select coalesce(array_agg(h order by h), '{}') into v_holes from unnest(v_correction.holes) h
      where not exists (select 1 from hole_score_entries a where a.group_id = p_group and a.scored_profile_id = p_golfer
        and a.entered_by_profile_id = v_player.attester_profile_id and a.hole = h and a.strokes is not null and a.correction_request_id = v_correction.id);
    if cardinality(v_holes) > 0 then
      return jsonb_build_object('status', 'rejected', 'reason', 'unattested', 'holes', to_jsonb(v_holes),
        'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
    end if;
  end if;

  select coalesce(array_agg(h order by h), '{}') into v_holes from generate_series(1, 18) h
    where (select e.strokes from hole_score_entries e where e.group_id = p_group and e.scored_profile_id = p_golfer and e.entered_by_profile_id = p_golfer and e.hole = h)
      is distinct from
          (select a.strokes from hole_score_entries a where a.group_id = p_group and a.scored_profile_id = p_golfer and a.entered_by_profile_id = v_player.attester_profile_id and a.hole = h);
  if cardinality(v_holes) > 0 then
    return jsonb_build_object('status', 'rejected', 'reason', 'mismatch', 'holes', to_jsonb(v_holes),
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

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

  if v_existing.id is null then
    v_revision := 1;
    insert into scorecard_submissions (group_id, golfer_profile_id, golf_trip_id, golf_trip_round_id, submitted_by, card_version, card, revision)
    values (p_group, p_golfer, v_group.golf_trip_id, v_group.golf_trip_round_id, p_profile, v_version, v_card, 1)
    returning * into v_existing;
  else
    -- A reopened card: the next revision becomes current, answering the approved request.
    v_revision := v_existing.revision + 1;
    v_request := v_correction.id;
    update scorecard_submissions set revision = v_revision, reopened_at = null, submitted_at = now(), submitted_by = p_profile,
      card_version = v_version, card = v_card
    where id = v_existing.id returning * into v_existing;
    update scorecard_correction_requests set status = 'resubmitted', resubmitted_at = now() where id = v_request;
  end if;
  insert into scorecard_submission_revisions (group_id, golfer_profile_id, revision, submitted_at, submitted_by, card_version, card, correction_request_id)
  values (p_group, p_golfer, v_revision, v_existing.submitted_at, p_profile, v_version, v_card, v_request);
  update scoring_group_players set submitted_at = v_existing.submitted_at where group_id = p_group and profile_id = p_golfer;
  -- Profile history, same transaction: revision 1 creates the golfer's round, a resubmission updates that same row. If
  -- it's refused, this raises and the whole submit rolls back.
  perform publish_trip_submission(v_existing);
  return jsonb_build_object('status', 'submitted', 'submittedAt', v_existing.submitted_at, 'revision', v_revision,
    'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
end;
$$;

revoke all on function public.submit_trip_scorecard(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.submit_trip_scorecard(uuid, uuid, uuid, integer) to service_role;
