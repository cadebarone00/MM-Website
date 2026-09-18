-- Apply after live_hole_submissions.sql, round_format_setups.sql and hole_shot_directions_penalty.sql.
begin;
alter table handicap_rounds add column if not exists submission_id uuid;
alter table handicap_rounds add column if not exists submission_payload jsonb;
create unique index if not exists handicap_rounds_submission_key on handicap_rounds(player_slug, submission_id);

create or replace function save_handicap_round_atomic(p_player text, p_request uuid, p_round jsonb, p_holes jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_payload jsonb; h jsonb;
begin
  if p_request is null then raise exception 'Refresh the page before submitting.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_player || p_request::text));
  select id,submission_payload into v_id,v_payload from handicap_rounds where player_slug=p_player and submission_id=p_request;
  if found then
    if v_payload is distinct from jsonb_build_object('round',p_round,'holes',p_holes) then raise exception 'This round was already submitted with different entries.'; end if;
    return v_id;
  end if;
  if jsonb_array_length(p_holes)<>18 or (select count(distinct (x->>'hole')::int) from jsonb_array_elements(p_holes) x)<>18 then raise exception 'Complete all 18 holes.'; end if;
  for h in select * from jsonb_array_elements(p_holes) loop
    if (h->>'hole')::int not between 1 and 18 or (h->>'score')::int<1 or (h->>'putts')::int not between 0 and (h->>'score')::int then raise exception 'Invalid hole entries.'; end if;
  end loop;
  insert into handicap_rounds(player_slug,course_id,tee_set_id,tee_set_name,rating,slope,date_played,tee_time,total_score,differential,submission_id,submission_payload)
  values(p_player,(p_round->>'course_id')::uuid,p_round->>'tee_set_id',p_round->>'tee_set_name',(p_round->>'rating')::numeric,(p_round->>'slope')::int,(p_round->>'date_played')::date,p_round->>'tee_time',(p_round->>'total_score')::int,(p_round->>'differential')::numeric,p_request,jsonb_build_object('round',p_round,'holes',p_holes)) returning id into v_id;
  insert into handicap_round_holes(round_id,hole,par,yards,score,putts,fir,gir,fir_direction,gir_direction)
  select v_id,(x->>'hole')::int,(x->>'par')::int,(x->>'yards')::int,(x->>'score')::int,(x->>'putts')::int,x->>'fir',(x->>'gir')::boolean,x->>'fir_direction',x->>'gir_direction' from jsonb_array_elements(p_holes) x;
  return v_id;
end $$;
revoke all on function save_handicap_round_atomic(text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function save_handicap_round_atomic(text,uuid,jsonb,jsonb) to service_role;

create table if not exists live_submission_receipts (
  player_slug text not null, request_id uuid not null, payload jsonb not null, result jsonb not null,
  primary key(player_slug,request_id)
);
alter table live_submission_receipts enable row level security;
grant all on live_submission_receipts to service_role;
create table if not exists live_publication_jobs (
  match_box_id uuid primary key references live_match_boxes(id) on delete cascade,
  season_year int not null, revision bigint not null default 1, completed boolean not null default false, updated_at timestamptz not null default now()
);
alter table live_publication_jobs enable row level security;
grant all on live_publication_jobs to service_role;
create or replace function queue_live_publication() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into live_publication_jobs(match_box_id,season_year)
  select id,season_year from live_match_boxes where season_year=new.season_year and round=new.round and new.player_slug=any(maroon_players||white_players)
  on conflict(match_box_id) do update set revision=live_publication_jobs.revision+1,completed=false,updated_at=now();
  return new;
end $$;
drop trigger if exists queue_live_publication_trigger on live_hole_scores;
create trigger queue_live_publication_trigger after insert or update on live_hole_scores for each row execute function queue_live_publication();

create or replace function submit_live_hole_reliable(p_year int,p_round int,p_hole int,p_player text,p_actor uuid,p_payload jsonb,p_request uuid,p_box uuid,p_expected timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old live_submission_receipts%rowtype; v_result jsonb; v_payload jsonb; v_saved timestamptz; b live_match_boxes%rowtype; own_players text[];
begin
  if not exists(select 1 from profiles where id=p_actor and player_slug=p_player) then raise exception 'Not authorized.'; end if;
  if p_request is null then raise exception 'Refresh scoring before submitting.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_player || p_request::text));
  v_payload:=jsonb_build_object('box',p_box,'year',p_year,'round',p_round,'hole',p_hole,'entry',p_payload);
  select * into v_old from live_submission_receipts where player_slug=p_player and request_id=p_request;
  if found then
    if v_old.payload<>v_payload then raise exception 'Submission identifier already used.'; end if;
    return v_old.result;
  end if;
  select * into b from live_match_boxes where id=p_box and season_year=p_year and round=p_round and p_player=any(maroon_players||white_players) for update;
  if not found then raise exception 'This saved submission belongs to a different match. Reopen your assigned match.'; end if;
  own_players:=array[p_player];
  if b.format='Foursome' then own_players:=case when p_player=any(b.maroon_players) then b.maroon_players else b.white_players end; end if;
  select max(submitted_at) into v_saved from live_hole_submissions where match_box_id=p_box and hole=p_hole and player_slug=any(own_players);
  if v_saved is distinct from p_expected then raise exception 'This hole changed on another device. Review the saved entries before resubmitting.'; end if;
  v_result:=submit_live_hole(p_year,p_round,p_hole,p_player,p_actor,p_payload);
  insert into live_submission_receipts values(p_player,p_request,v_payload,v_result);
  return v_result;
end $$;
revoke all on function submit_live_hole_reliable(int,int,int,text,uuid,jsonb,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function submit_live_hole_reliable(int,int,int,text,uuid,jsonb,uuid,uuid,timestamptz) to service_role;

-- Compare the revision while holding the same match lock as score submission.
create or replace function publish_match_revision(p_box uuid,p_revision bigint,p_state jsonb,p_odds jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare b live_match_boxes%rowtype; v_revision bigint;
begin
  select * into b from live_match_boxes where id=p_box for update;
  select revision into v_revision from live_publication_jobs where match_box_id=p_box;
  if coalesce(v_revision,0)<>p_revision then return false; end if;
  if b.state='Final' then update live_publication_jobs set completed=true where match_box_id=p_box; return true; end if;
  insert into live_match_official_state(match_box_id,season_year,round,status,thru,maroon_holes,white_holes,leader,margin,mathematically_complete,official_result,updated_at)
  values(p_box,b.season_year,b.round,p_state->>'status',(p_state->>'thru')::int,(p_state->>'maroonHoles')::int,(p_state->>'whiteHoles')::int,p_state->>'leader',(p_state->>'margin')::int,(p_state->>'mathematicallyComplete')::boolean,p_state->>'officialResult',now())
  on conflict(match_box_id) do update set status=excluded.status,thru=excluded.thru,maroon_holes=excluded.maroon_holes,white_holes=excluded.white_holes,leader=excluded.leader,margin=excluded.margin,mathematically_complete=excluded.mathematically_complete,official_result=excluded.official_result,updated_at=now();
  if p_odds is not null then
    insert into live_match_odds_snapshots(match_box_id,season_year,model_version,state_thru,maroon_lead,maroon_win_probability,tie_probability,white_win_probability,maroon_american_odds,tie_american_odds,white_american_odds,details)
    values(p_box,b.season_year,p_odds->>'model_version',(p_odds->>'state_thru')::int,(p_odds->>'maroon_lead')::int,(p_odds->>'maroon_win_probability')::numeric,(p_odds->>'tie_probability')::numeric,(p_odds->>'white_win_probability')::numeric,(p_odds->>'maroon_american_odds')::int,(p_odds->>'tie_american_odds')::int,(p_odds->>'white_american_odds')::int,p_odds->'details');
  end if;
  update live_publication_jobs set completed=true where match_box_id=p_box and revision=p_revision;
  return true;
end $$;
revoke all on function publish_match_revision(uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function publish_match_revision(uuid,bigint,jsonb,jsonb) to service_role;
create or replace function close_live_match_atomic(p_box uuid) returns text
language plpgsql security definer set search_path=public as $$
declare b live_match_boxes%rowtype; result text; h int; played int:=0; a_wins int:=0; w_wins int:=0; a_score int; w_score int; v_count int; market text;
begin
  if not coalesce((select is_host from profiles where id=auth.uid()),false) then raise exception 'Not authorized.'; end if;
  select * into b from live_match_boxes where id=p_box for update;
  if not found then raise exception 'Match not found.'; end if;
  select official_result into result from live_match_official_state where match_box_id=p_box and closed_out_at is not null;
  if result is null then
    for h in 1..18 loop
      select count(*),min(score) filter(where player_slug=any(b.maroon_players)),min(score) filter(where player_slug=any(b.white_players))
      into v_count,a_score,w_score from live_hole_scores where season_year=b.season_year and round=b.round and hole=h and player_slug=any(b.maroon_players||b.white_players) and confirmed_by is not null and score>0;
      exit when v_count<>cardinality(b.maroon_players||b.white_players);
      played:=h;
      if a_score<w_score then a_wins:=a_wins+1; elsif w_score<a_score then w_wins:=w_wins+1; end if;
      exit when abs(a_wins-w_wins)>18-h;
    end loop;
    if played<>18 and abs(a_wins-w_wins)<=18-played then raise exception 'This match has not reached a confirmed final result.'; end if;
    result:=case when a_wins>w_wins then 'maroon' when w_wins>a_wins then 'white' else 'tie' end;
    insert into live_match_official_state(match_box_id,season_year,round,status,thru,maroon_holes,white_holes,leader,margin,mathematically_complete,official_result,closed_out_at,closed_out_by)
    values(p_box,b.season_year,b.round,'closed_out',played,a_wins,w_wins,result,abs(a_wins-w_wins),true,result,now(),auth.uid())
    on conflict(match_box_id) do update set status='closed_out',thru=excluded.thru,maroon_holes=excluded.maroon_holes,white_holes=excluded.white_holes,leader=excluded.leader,margin=excluded.margin,mathematically_complete=true,official_result=excluded.official_result,closed_out_at=now(),closed_out_by=auth.uid(),updated_at=now();
    update live_match_boxes set state='Final' where id=p_box;
    update career_archive_rounds set status='final',updated_at=now() where match_box_id=p_box;
    insert into live_score_audit_events(season_year,match_box_id,round,actor_profile_id,kind,payload) values(b.season_year,p_box,b.round,auth.uid(),'match_closed_out',jsonb_build_object('result',result,'holesPlayed',played));
  end if;
  market:='live-match:'||p_box::text;
  perform pg_advisory_xact_lock(hashtext(market));
  if not exists(select 1 from wagers_market_settlements where market_key=market) then
    perform settle_mm_coin_market(market,result);
  elsif not exists(select 1 from wagers_market_settlements where market_key=market and winning_selection_key=result) then
    raise exception 'Existing settlement disagrees with match result.';
  end if;
  update live_publication_jobs set completed=true where match_box_id=p_box;
  return result;
end $$;
revoke all on function close_live_match_atomic(uuid) from public,anon;
grant execute on function close_live_match_atomic(uuid) to authenticated;

create or replace function start_live_round_atomic(p_year int,p_round int) returns void
language plpgsql security definer set search_path=public as $$
declare r live_round_state%rowtype;
begin
  if not coalesce((select is_host from profiles where id=auth.uid()),false) then raise exception 'Not authorized.'; end if;
  select * into r from live_round_state where season_year=p_year and round=p_round for update;
  if not found or not r.course_locked or not r.matchups_locked then raise exception 'Lock the course and matchups first.'; end if;
  if not exists(select 1 from live_match_boxes where season_year=p_year and round=p_round) then raise exception 'No matchups are assigned.'; end if;
  update live_round_state set started=true where season_year=p_year and round=p_round;
  update live_match_boxes set started=true where season_year=p_year and round=p_round;
end $$;
revoke all on function start_live_round_atomic(int,int) from public,anon;
grant execute on function start_live_round_atomic(int,int) to authenticated;
-- Historical corrections must update the entire edited card or nothing.
create or replace function save_archived_scorecard_atomic(p_round uuid,p_holes jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare h jsonb;
begin
  perform 1 from archived_scorecard_rounds where id=p_round for update;
  if not found then raise exception 'Archived round not found.'; end if;
  if jsonb_array_length(p_holes)=0 or jsonb_array_length(p_holes)<>(select count(distinct x->>'hole') from jsonb_array_elements(p_holes) x) then raise exception 'Invalid hole list.'; end if;
  for h in select * from jsonb_array_elements(p_holes) loop
    if (h->>'hole')::int not between 1 and 18 or (h->>'score')::int<1 or (h->>'putts')::int not between 0 and (h->>'score')::int then raise exception 'Invalid hole entries.'; end if;
    update archived_scorecard_holes set score=(h->>'score')::int,putts=(h->>'putts')::int,fir=h->>'fir',gir=(h->>'gir')::boolean,host_edited=true,updated_at=now()
    where round_id=p_round and hole=(h->>'hole')::int;
    if not found then raise exception 'Archived hole not found.'; end if;
  end loop;
end $$;
revoke all on function save_archived_scorecard_atomic(uuid,jsonb) from public,anon,authenticated;
grant execute on function save_archived_scorecard_atomic(uuid,jsonb) to service_role;
commit;
