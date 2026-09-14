-- Apply after live_match_publication.sql. Submit Score is one atomic transaction.
begin;

create table if not exists public.live_hole_submissions (
  match_box_id uuid not null references public.live_match_boxes(id) on delete cascade,
  player_slug text not null references public.player_slots(player_slug),
  hole integer not null check (hole between 1 and 18),
  payload jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (match_box_id, player_slug, hole)
);
alter table public.live_hole_submissions enable row level security;
drop policy if exists live_hole_submissions_read on public.live_hole_submissions;
create policy live_hole_submissions_read on public.live_hole_submissions for select to authenticated
using (exists (
  select 1 from public.live_match_boxes b join public.profiles p on p.id = auth.uid()
  where b.id = match_box_id and (p.is_host or p.player_slug = any(b.maroon_players || b.white_players))
));

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
    if (select count(*) from live_hole_scores where season_year = p_year and round = p_round and player_slug = v_player and confirmed_by is not null) = 18 then
      insert into live_match_box_submissions(match_box_id, player_slug) values (b.id, v_player)
        on conflict (match_box_id, player_slug) do update set submitted_at = now();
    else
      delete from live_match_box_submissions where match_box_id = b.id and player_slug = v_player;
    end if;
  end loop;
  insert into live_score_audit_events(season_year, match_box_id, round, hole, player_slug, actor_profile_id, kind, payload)
    values(p_year, b.id, p_round, p_hole, p_player, p_actor, 'score_entered', p_payload);
  select coalesce(jsonb_agg(payload || jsonb_build_object('player',player_slug,'hole',hole,'submittedAt',submitted_at) order by submitted_at), '[]'::jsonb)
    into v_result from live_hole_submissions where match_box_id = b.id;
  return jsonb_build_object('matchBoxId', b.id, 'submissions', v_result);
end;
$$;
revoke all on function public.submit_live_hole(integer,integer,integer,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.submit_live_hole(integer,integer,integer,text,uuid,jsonb) to service_role;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'live_hole_submissions'
  ) then alter publication supabase_realtime add table public.live_hole_submissions; end if;
end $$;
commit;
