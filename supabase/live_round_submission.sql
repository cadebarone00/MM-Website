-- Run once in the Supabase SQL Editor AFTER live_hole_submissions.sql and
-- scoring_reliability.sql. Live scoring Phase 1 ("Submit Round"):
--   1. A player's round is no longer submitted automatically at 18 matching
--      holes; the player must press Submit Round.
--   2. After Submit Round the player's own entries are locked (only Tiger can
--      change them); a scorer's later disagreement never un-submits anyone.
--   3. When a player AND their scorer have both submitted, the archive round
--      becomes 'submitted' (an official record: handicap and the archive
--      count it). Foursome needs all four players.
begin;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid = 'career_archive_rounds'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table career_archive_rounds drop constraint %I', c);
  end loop;
end $$;
alter table career_archive_rounds add constraint career_archive_rounds_status_check
  check (status in ('scheduled', 'live', 'submitted', 'final'));

-- Later score writes (a live mirror, a Tiger edit) must never move an
-- official round back to 'live'.
create or replace function public.keep_archive_round_status() returns trigger
language plpgsql as $$
begin
  if old.status = 'final' and new.status in ('scheduled', 'live', 'submitted') then new.status := old.status;
  elsif old.status = 'submitted' and new.status in ('scheduled', 'live') then new.status := old.status;
  end if;
  return new;
end $$;
drop trigger if exists keep_archive_round_status_trigger on career_archive_rounds;
create trigger keep_archive_round_status_trigger before update on career_archive_rounds
  for each row execute function public.keep_archive_round_status();

create or replace function public.submit_live_hole(p_year integer, p_round integer, p_hole integer, p_player text, p_actor uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b live_match_boxes%rowtype;
  r live_round_state%rowtype;
  h jsonb;
  v_player text;
  v_own text[];
  v_other text[];
  v_mine jsonb;
  v_theirs jsonb;
  v_confirmed boolean;
  v_par integer;
  v_result jsonb;
begin
  if not exists (select 1 from profiles where id = p_actor and player_slug = p_player) then
    raise exception 'Not authorized.';
  end if;
  if p_hole is null or p_hole not between 1 and 18 then raise exception 'Invalid hole.'; end if;
  -- Serialize both scorers and simultaneous retries on the match row.
  select * into b from live_match_boxes where season_year = p_year and round = p_round
    and p_player = any(maroon_players || white_players) for update;
  if not found then raise exception 'No assigned match.'; end if;
  if exists (select 1 from live_match_box_submissions where match_box_id = b.id and player_slug = p_player) then
    raise exception 'Your round is submitted. Tiger can change it.';
  end if;
  if not b.started or b.state = 'Final' or (b.state <> 'Live' and b.tee_time > now()) then
    raise exception 'This match is not open for scoring.';
  end if;
  select * into r from live_round_state where season_year = p_year and round = p_round;
  if not found or not r.started or not r.course_locked or not r.matchups_locked then
    raise exception 'This round is not open for scoring.';
  end if;
  select item into h from jsonb_array_elements(coalesce(r.course_setup->'holes', (select holes from live_courses where id = r.course_id), '[]'::jsonb)) item
    where (item->>'number')::integer = p_hole;
  v_par := (h->>'par')::integer;
  if v_par is null then raise exception 'Hole setup is missing.'; end if;
  if coalesce(jsonb_typeof(p_payload->'ownScore'), '') <> 'number'
    or coalesce(jsonb_typeof(p_payload->'opponentScore'), '') <> 'number'
    or coalesce(p_payload->>'ownScore', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_payload->>'opponentScore', '') !~ '^[1-9][0-9]*$' then
    raise exception 'Both scores are required.';
  end if;
  if b.format <> 'Foursome' then
    if coalesce(jsonb_typeof(p_payload->'putts'), '') <> 'number'
      or coalesce(p_payload->>'putts', '') !~ '^[0-9]+$'
      or (p_payload->>'putts')::integer > (p_payload->>'ownScore')::integer
      or coalesce(p_payload->>'green', '') not in ('hit','long','short','left','right','penalty')
      or (v_par <> 3 and coalesce(p_payload->>'fairway', '') not in ('hit','long','short','left','right','penalty')) then
      raise exception 'Not all information is complete. Enter putts, fairway, and green results.';
    end if;
  end if;
  if v_par = 3 or b.format = 'Foursome' then p_payload := jsonb_set(p_payload, '{fairway}', 'null'); end if;
  if b.format = 'Foursome' then
    p_payload := p_payload || '{"putts":null,"green":null}'::jsonb;
  end if;
  insert into live_hole_submissions(match_box_id, player_slug, hole, payload, submitted_at)
    values (b.id, p_player, p_hole, p_payload, clock_timestamp())
    on conflict (match_box_id, player_slug, hole) do update set payload = excluded.payload, submitted_at = excluded.submitted_at;

  foreach v_player in array (b.maroon_players || b.white_players) loop
    if v_player = any(b.maroon_players) then v_own := b.maroon_players; v_other := b.white_players;
    else v_own := b.white_players; v_other := b.maroon_players; end if;
    if b.format <> 'Foursome' then
      v_other := array[v_other[array_position(v_own, v_player)]];
      v_own := array[v_player];
    end if;
    select payload into v_mine from live_hole_submissions where match_box_id = b.id and hole = p_hole and player_slug = any(v_own)
      order by submitted_at desc, player_slug limit 1;
    select payload into v_theirs from live_hole_submissions where match_box_id = b.id and hole = p_hole and player_slug = any(v_other)
      order by submitted_at desc, player_slug limit 1;
    if v_mine is null and v_theirs is null then continue; end if;
    -- Both comparisons must agree. One disagreement retracts BOTH sides of the pair.
    v_confirmed := coalesce(v_mine->>'ownScore' = v_theirs->>'opponentScore'
      and v_mine->>'opponentScore' = v_theirs->>'ownScore', false);
    insert into live_hole_scores(season_year, round, hole, player_slug, score, self_reported_score, putts, fir, gir, fir_direction, gir_direction, confirmed_by, did_not_finish, updated_at)
    values (p_year, p_round, p_hole, v_player, (v_theirs->>'opponentScore')::integer, (v_mine->>'ownScore')::integer,
      (v_mine->>'putts')::integer, case when v_mine->>'fairway' is null then null else v_mine->>'fairway' = 'hit' end,
      case when v_mine->>'green' is null then null else v_mine->>'green' = 'hit' end,
      nullif(v_mine->>'fairway','hit'), nullif(v_mine->>'green','hit'), case when v_confirmed then v_player else null end, false, now())
    on conflict (season_year, player_slug, round, hole) do update set
      score = excluded.score, self_reported_score = excluded.self_reported_score, putts = excluded.putts,
      fir = excluded.fir, gir = excluded.gir, fir_direction = excluded.fir_direction, gir_direction = excluded.gir_direction,
      confirmed_by = excluded.confirmed_by, did_not_finish = false, updated_at = now();
    -- The existing mirror trigger publishes confirmed rows and retracts disputed ones.
    -- Submitting the round is now explicit (submit_live_round), never automatic.
  end loop;
  insert into live_score_audit_events(season_year, match_box_id, round, hole, player_slug, actor_profile_id, kind, payload)
    values(p_year, b.id, p_round, p_hole, p_player, p_actor, 'score_entered', p_payload);
  select coalesce(jsonb_agg(payload || jsonb_build_object('player',player_slug,'hole',hole,'submittedAt',submitted_at) order by submitted_at), '[]'::jsonb)
    into v_result from live_hole_submissions where match_box_id = b.id;
  return jsonb_build_object('matchBoxId', b.id, 'submissions', v_result);
end;
$$;

create or replace function public.submit_live_round(p_box uuid, p_player text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b live_match_boxes%rowtype;
  r live_round_state%rowtype;
  v_own text[]; v_other text[]; v_required text[]; v_waiting text[];
  h jsonb; v_par integer; v_hole integer; v_target text;
  v_row live_hole_scores%rowtype;
  v_official boolean;
begin
  if not exists (select 1 from profiles where id = p_actor and player_slug = p_player) then raise exception 'Not authorized.'; end if;
  select * into b from live_match_boxes where id = p_box and p_player = any(maroon_players || white_players) for update;
  if not found then raise exception 'No assigned match.'; end if;
  if not b.started or b.state = 'Final' or (b.state <> 'Live' and b.tee_time > now()) then
    raise exception 'This match is not open for scoring.';
  end if;
  select * into r from live_round_state where season_year = b.season_year and round = b.round;
  if p_player = any(b.maroon_players) then v_own := b.maroon_players; v_other := b.white_players;
  else v_own := b.white_players; v_other := b.maroon_players; end if;
  if b.format = 'Foursome' then v_required := b.maroon_players || b.white_players;
  else v_required := array[p_player, v_other[array_position(v_own, p_player)]]; end if;

  if not exists (select 1 from live_match_box_submissions where match_box_id = p_box and player_slug = p_player) then
    for v_hole in 1..18 loop
      select item into h from jsonb_array_elements(coalesce(r.course_setup->'holes', (select holes from live_courses where id = r.course_id), '[]'::jsonb)) item
        where (item->>'number')::integer = v_hole;
      v_par := (h->>'par')::integer;
      foreach v_target in array v_required loop
        select * into v_row from live_hole_scores
          where season_year = b.season_year and round = b.round and hole = v_hole and player_slug = v_target;
        if not found or v_row.score is null or v_row.score <= 0 or v_row.confirmed_by is null then
          raise exception 'Hole % is not confirmed yet. You and your scorer must both enter and match every hole before you submit.', v_hole;
        end if;
      end loop;
      if b.format <> 'Foursome' then
        select * into v_row from live_hole_scores
          where season_year = b.season_year and round = b.round and hole = v_hole and player_slug = p_player;
        if not v_row.did_not_finish and (v_row.putts is null or v_row.gir is null or (v_par is distinct from 3 and v_row.fir is null)) then
          raise exception 'Finish your putts, fairway, and green for hole % before you submit.', v_hole;
        end if;
      end if;
    end loop;
    insert into live_match_box_submissions(match_box_id, player_slug) values (p_box, p_player)
      on conflict (match_box_id, player_slug) do nothing;
    insert into live_score_audit_events(season_year, match_box_id, round, player_slug, actor_profile_id, kind, payload)
      values (b.season_year, p_box, b.round, p_player, p_actor, 'player_submitted', jsonb_build_object('holes', 18));
  end if;

  select coalesce(array_agg(x), '{}') into v_waiting from unnest(v_required) x
    where not exists (select 1 from live_match_box_submissions where match_box_id = p_box and player_slug = x);
  v_official := cardinality(v_waiting) = 0;
  if v_official then
    update career_archive_rounds set status = 'submitted', updated_at = now()
      where match_box_id = p_box and player_slug = any(v_required) and status in ('scheduled', 'live');
  end if;
  return jsonb_build_object('submitted', true, 'official', v_official, 'waitingOn', to_jsonb(v_waiting));
end $$;
revoke all on function public.submit_live_round(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_live_round(uuid, text, uuid) to service_role;

commit;
