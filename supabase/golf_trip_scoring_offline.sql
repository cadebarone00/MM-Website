-- supabase/golf_trip_scoring_offline.sql
-- Player & Attest Step 4: offline scoring. Phones queue score changes while offline and send them later, so each
-- change (an "op") now carries:
--   opId          a stable id: sending the same op twice (a retry after a lost answer) applies it once.
--   baseVersion   the version of that hole the phone last saw (0 = none): if the saved row has moved on since, the
--                 op is NOT applied and the answer says "conflict" with what's saved, so an older offline edit can
--                 never silently overwrite a newer score. The phone keeps its entry until the golfer chooses.
--   supersedes    the phone's own earlier ops for the same hole whose answers it never got: finding one of those as
--                 the row's last op isn't a conflict (it's this phone's own edit).
-- Same rules as save_hole_scores (golf_trip_scoring.sql): you write only your own row, or strokes only for the one
-- golfer you attest; submitted golfers take no more entries; the first entry locks the group's attesters.
--
-- Prerequisite: golf_trip_scoring.sql. Adds one nullable column; changes and removes no data. Safe to run more than
-- once. Undo: drop function public.save_hole_score_ops(uuid, uuid, uuid, jsonb);
--             alter table public.hole_score_entries drop column if exists last_op_id;

begin;

alter table public.hole_score_entries add column if not exists last_op_id uuid;

-- p_ops = [{opId, baseVersion, supersedes: [opId], clientUpdatedAt, entry: {hole, strokes, putts, fairway, green,
-- penaltyFairway, penaltyGreen}}] (checked by lib/platform/tripScoring.ts and again here). Returns
-- {results: [{opId, status: applied | duplicate | conflict, version, server?}], scoring: get_trip_round_scoring}.
create or replace function public.save_hole_score_ops(p_profile uuid, p_group uuid, p_scored uuid, p_ops jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_group scoring_groups;
  v_scored scoring_group_players;
  v_own boolean;
  v_op jsonb;
  v_entry jsonb;
  v_hole integer;
  v_op_id uuid;
  v_row hole_score_entries;
  v_results jsonb := '[]'::jsonb;
  v_round_number integer;
begin
  select * into v_group from scoring_groups where id = p_group for update;
  if v_group.id is null or not is_scoring_group_player(p_group, p_profile) then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;
  select * into v_scored from scoring_group_players where group_id = p_group and profile_id = p_scored;
  if v_scored.profile_id is null then raise exception 'That golfer isn''t in your group.' using errcode = '42501'; end if;
  v_own := p_profile = p_scored;
  if not v_own and v_scored.attester_profile_id is distinct from p_profile then
    raise exception 'You can only score yourself and the golfer you attest.' using errcode = '42501';
  end if;
  if v_scored.submitted_at is not null then raise exception 'That card is already submitted.' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) not between 1 and 18 then
    raise exception 'Send 1 to 18 holes.' using errcode = '22023';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_entry := v_op->'entry';
    v_hole := (v_entry->>'hole')::integer;
    v_op_id := (v_op->>'opId')::uuid;
    if v_hole is null or v_hole not between 1 and 18 or v_op_id is null then
      raise exception 'Check the hole scores.' using errcode = '22023';
    end if;
    if not v_own and (v_entry->>'putts' is not null or v_entry->>'fairway' is not null or v_entry->>'green' is not null
                      or coalesce((v_entry->>'penaltyFairway')::boolean, false) or coalesce((v_entry->>'penaltyGreen')::boolean, false)) then
      raise exception 'An attester enters strokes only.' using errcode = '22023';
    end if;

    select * into v_row from hole_score_entries
      where group_id = p_group and scored_profile_id = p_scored and entered_by_profile_id = p_profile and hole = v_hole for update;

    if v_row.id is not null and v_row.last_op_id = v_op_id then
      -- A retry of an op already applied.
      v_results := v_results || jsonb_build_object('opId', v_op_id, 'status', 'duplicate', 'version', v_row.version);
    elsif coalesce(v_row.version, 0) <> coalesce((v_op->>'baseVersion')::integer, 0)
          and not (v_row.last_op_id is not null and v_row.last_op_id::text in (select jsonb_array_elements_text(coalesce(v_op->'supersedes', '[]'::jsonb)))) then
      -- The saved score moved on since this phone last saw it: keep it, report what's saved.
      v_results := v_results || jsonb_build_object('opId', v_op_id, 'status', 'conflict', 'version', coalesce(v_row.version, 0),
        'server', jsonb_build_object('hole', v_hole, 'strokes', v_row.strokes, 'putts', v_row.putts, 'fairway', v_row.fairway, 'green', v_row.green,
          'penaltyFairway', coalesce(v_row.penalty_fairway, false), 'penaltyGreen', coalesce(v_row.penalty_green, false)));
    else
      insert into hole_score_entries (group_id, scored_profile_id, entered_by_profile_id, hole, strokes, putts, fairway, green,
        penalty_fairway, penalty_green, client_updated_at, last_op_id)
      values (p_group, p_scored, p_profile, v_hole, (v_entry->>'strokes')::integer, (v_entry->>'putts')::integer,
        v_entry->>'fairway', v_entry->>'green', coalesce((v_entry->>'penaltyFairway')::boolean, false),
        coalesce((v_entry->>'penaltyGreen')::boolean, false), coalesce((v_op->>'clientUpdatedAt')::timestamptz, now()), v_op_id)
      on conflict (group_id, scored_profile_id, entered_by_profile_id, hole) do update set
        strokes = excluded.strokes, putts = excluded.putts, fairway = excluded.fairway, green = excluded.green,
        penalty_fairway = excluded.penalty_fairway, penalty_green = excluded.penalty_green,
        client_updated_at = excluded.client_updated_at, last_op_id = excluded.last_op_id,
        version = hole_score_entries.version + 1, updated_at = now()
      returning * into v_row;
      v_results := v_results || jsonb_build_object('opId', v_op_id, 'status', 'applied', 'version', v_row.version);
    end if;
  end loop;

  update scoring_groups set assignments_locked_at = coalesce(assignments_locked_at, now()) where id = p_group;
  select r.round_number into v_round_number from golf_trip_rounds r where r.id = v_group.golf_trip_round_id;
  return jsonb_build_object('results', v_results, 'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
end;
$$;

revoke all on function public.save_hole_score_ops(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_hole_score_ops(uuid, uuid, uuid, jsonb) to service_role;

commit;
