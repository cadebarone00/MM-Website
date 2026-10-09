-- Requires golf_trips.sql, golf_trip_flights.sql, golf_trip_scoring.sql, platform editions and native official-state migrations.
-- Durable member-only feed and opt-in push outbox. No historical backfill or official result claims.
begin;
create table if not exists public.trip_push_subscriptions (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade,
 golf_trip_id uuid not null references golf_trips(id) on delete cascade,
 endpoint text not null, p256dh text not null, auth_secret text not null,
 scores boolean not null default false, milestones boolean not null default true,
 created_at timestamptz not null default now(), unique(endpoint, golf_trip_id)
);
create table if not exists public.trip_momentum_events (
 id uuid primary key default gen_random_uuid(), golf_trip_id uuid not null references golf_trips(id) on delete cascade,
 round_number integer not null, actor_id uuid references profiles(id) on delete set null,
 kind text not null check(kind in ('score','milestone')), title text not null, detail text not null,
 source_key text not null unique, created_at timestamptz not null default now()
);
alter table trip_momentum_events add column if not exists cause text check(cause in ('hole_in_one','birdie_2','birdie_3','birdie_4','early_match_win'));
alter table trip_momentum_events add column if not exists subject_name text;
alter table trip_momentum_events add column if not exists withdrawn_at timestamptz;
alter table trip_momentum_events add column if not exists result_label text;
-- Real round pars supplied by the organizer; never default every hole to par 4.
alter table golf_trip_rounds add column if not exists momentum_pars integer[] check(array_length(momentum_pars,1)=18 and momentum_pars <@ array[3,4,5,6]);
create index if not exists trip_momentum_recent on trip_momentum_events(golf_trip_id, created_at desc);
create table if not exists public.trip_push_deliveries (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references trip_momentum_events(id) on delete cascade,
 subscription_id uuid not null references trip_push_subscriptions(id) on delete cascade,
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_token uuid, delivered_at timestamptz, unique(event_id, subscription_id)
);
alter table trip_push_subscriptions enable row level security;
alter table trip_momentum_events enable row level security;
alter table trip_push_deliveries enable row level security;
revoke all on trip_push_subscriptions, trip_momentum_events, trip_push_deliveries from anon, authenticated;
grant all on trip_push_subscriptions, trip_momentum_events, trip_push_deliveries to service_role;
-- Only the server can access endpoints/secrets. Feed reads pass through an authenticated membership check.
create or replace function public.queue_trip_momentum() returns trigger
language plpgsql security definer set search_path=public as $$
declare g scoring_groups; n integer; player_name text; event_key text; event_title text; event_detail text; event_kind text; event_id uuid;
begin
 select * into g from scoring_groups where id=new.group_id;
 if g.golf_trip_id is null then return new; end if;
 select round_number into n from golf_trip_rounds where id=g.golf_trip_round_id;
 select display_name into player_name from golf_trip_members where golf_trip_id=g.golf_trip_id and profile_id=new.scored_profile_id;
 player_name:=coalesce(player_name,'A golfer');
 if new.scored_profile_id<>new.entered_by_profile_id or new.strokes is null then return new; end if;
 if TG_OP='UPDATE' then
  if old.strokes is not distinct from new.strokes then return new; end if;
 end if;
 event_key:='hole:'||new.id||':'||new.version;
 event_kind:='score';
 event_title:=player_name||' posted a score';
 event_detail:='Round '||n||' · Hole '||new.hole||' · '||new.strokes||' strokes (player-entered)';
 insert into trip_momentum_events(golf_trip_id,round_number,actor_id,kind,title,detail,source_key)
 values(g.golf_trip_id,n,new.scored_profile_id,event_kind,event_title,event_detail,event_key)
 on conflict(source_key) do nothing returning id into event_id;
 if event_id is not null then
  insert into trip_push_deliveries(event_id,subscription_id)
  select event_id,s.id from trip_push_subscriptions s where s.golf_trip_id=g.golf_trip_id and s.profile_id<>new.scored_profile_id
   and is_golf_trip_member(g.golf_trip_id,s.profile_id) and ((event_kind='score' and s.scores) or (event_kind='milestone' and s.milestones));
 end if;
 return new;
end; $$;
drop trigger if exists trip_momentum_score on hole_score_entries;
create trigger trip_momentum_score after insert or update on hole_score_entries for each row execute function queue_trip_momentum();
create or replace function public.queue_trip_submission() returns trigger
language plpgsql security definer set search_path=public as $$
declare g scoring_groups; n integer; player_name text; event_id uuid;
begin
 if new.submitted_at is null or old.submitted_at is not distinct from new.submitted_at then return new; end if;
 select * into g from scoring_groups where id=new.group_id;
 if g.golf_trip_id is null then return new; end if;
 select round_number into n from golf_trip_rounds where id=g.golf_trip_round_id;
 select display_name into player_name from golf_trip_members where golf_trip_id=g.golf_trip_id and profile_id=new.profile_id;
 insert into trip_momentum_events(golf_trip_id,round_number,actor_id,kind,title,detail,source_key)
 values(g.golf_trip_id,n,new.profile_id,'milestone',coalesce(player_name,'A golfer')||' submitted their card',
 'Round '||n||' · Scorecard submitted','submitted:'||new.group_id||':'||new.profile_id||':'||new.submitted_at)
 on conflict(source_key) do nothing returning id into event_id;
 if event_id is not null then
  insert into trip_push_deliveries(event_id,subscription_id)
  select event_id,s.id from trip_push_subscriptions s where s.golf_trip_id=g.golf_trip_id and s.profile_id<>new.profile_id
   and false;
 end if;
 return new;
end; $$;
drop trigger if exists trip_momentum_submission on scoring_group_players;
create trigger trip_momentum_submission after update on scoring_group_players for each row execute function queue_trip_submission();
-- Claim leases atomically: overlapping scheduler invocations cannot send the same delivery concurrently.
create or replace function public.claim_trip_push(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 with ready as (
  select d.id from trip_push_deliveries d join trip_momentum_events e on e.id=d.event_id
  join trip_push_subscriptions s on s.id=d.subscription_id
  where d.delivered_at is null and d.attempts<5 and d.available_at<=now()
   and e.withdrawn_at is null and e.created_at>now()-interval '15 minutes'
   and is_golf_trip_member(s.golf_trip_id,s.profile_id)
   and ((e.kind='score' and s.scores) or (e.kind='milestone' and s.milestones))
  order by d.available_at limit least(greatest(p_limit,1),20) for update of d skip locked
 ), claimed as (
  update trip_push_deliveries d set attempts=attempts+1,available_at=now()+interval '2 minutes',lease_token=gen_random_uuid()
  from ready where d.id=ready.id returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease_token,'subscriptionId',s.id,
  'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret),
  'tripId',s.golf_trip_id,'eventId',e.id,'kind',e.kind,'cause',e.cause,'subjectName',e.subject_name,'resultLabel',e.result_label)), '[]'::jsonb) into result
 from claimed d join trip_push_subscriptions s on s.id=d.subscription_id join trip_momentum_events e on e.id=d.event_id;
 return result;
end; $$;
revoke all on function public.queue_trip_momentum(), public.queue_trip_submission(), public.claim_trip_push(integer) from public,anon,authenticated;
grant execute on function public.claim_trip_push(integer) to service_role;
create or replace function public.save_trip_push(p_profile uuid,p_trip uuid,p_endpoint text,p_key text,p_auth text,p_scores boolean,p_milestones boolean) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if not is_golf_trip_member(p_trip,p_profile) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_profile::text||p_trip::text,0));
 if not exists(select 1 from trip_push_subscriptions where endpoint=p_endpoint and golf_trip_id=p_trip)
  and (select count(*) from trip_push_subscriptions where profile_id=p_profile and golf_trip_id=p_trip)>=10 then return false; end if;
 insert into trip_push_subscriptions(profile_id,golf_trip_id,endpoint,p256dh,auth_secret,scores,milestones)
 values(p_profile,p_trip,p_endpoint,p_key,p_auth,p_scores,p_milestones)
 on conflict(endpoint,golf_trip_id) do update set p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,scores=excluded.scores,milestones=excluded.milestones
 where trip_push_subscriptions.profile_id=p_profile;
 return found;
end; $$;
revoke all on function public.save_trip_push(uuid,uuid,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.save_trip_push(uuid,uuid,text,text,text,boolean,boolean) to service_role;

-- A second perspective is required for both aces and birdie runs, whichever scorer writes last.
create or replace function public.queue_trip_confirmed_moments() returns trigger
language plpgsql security definer set search_path=public as $$
declare g scoring_groups; n integer; pars integer[]; player_name text; attester uuid; ace integer; end_hole integer; run integer; h integer; own_score integer; attest_score integer; moment_cause text; event_id uuid; source text; valid_sources text[]:=array[]::text[];
begin
 select * into g from scoring_groups where id=new.group_id;
 if g.golf_trip_id is null then return new; end if;
 select round_number,momentum_pars into n,pars from golf_trip_rounds where id=g.golf_trip_round_id;
 select attester_profile_id into attester from scoring_group_players where group_id=new.group_id and profile_id=new.scored_profile_id;
 if attester is null then return new; end if;
 select display_name into player_name from golf_trip_members where golf_trip_id=g.golf_trip_id and profile_id=new.scored_profile_id;
 select e.strokes into own_score from hole_score_entries e where e.group_id=new.group_id and e.scored_profile_id=new.scored_profile_id and e.entered_by_profile_id=new.scored_profile_id and e.hole=new.hole;
 select e.strokes into attest_score from hole_score_entries e where e.group_id=new.group_id and e.scored_profile_id=new.scored_profile_id and e.entered_by_profile_id=attester and e.hole=new.hole;
 if own_score=1 and attest_score=1 then
  moment_cause:='hole_in_one';source:='ace:'||new.group_id||':'||new.scored_profile_id||':'||new.hole;
  update trip_momentum_events set withdrawn_at=null where source_key=source;
  insert into trip_momentum_events(golf_trip_id,round_number,actor_id,kind,title,detail,cause,subject_name,source_key)
  values(g.golf_trip_id,n,new.scored_profile_id,'milestone','','',moment_cause,coalesce(player_name,'A golfer'),source)
  on conflict(source_key) do nothing returning id into event_id;
  if event_id is not null then
   insert into trip_push_deliveries(event_id,subscription_id) select event_id,s.id from trip_push_subscriptions s
   where s.golf_trip_id=g.golf_trip_id and s.milestones and is_golf_trip_member(g.golf_trip_id,s.profile_id);
  end if;
 end if;
 update trip_momentum_events set withdrawn_at=now() where cause='hole_in_one' and source_key='ace:'||new.group_id||':'||new.scored_profile_id||':'||new.hole and not(coalesce(own_score=1 and attest_score=1,false));
 if pars is null then return new; end if;
 -- Recalculate in hole order: out-of-order attestations can complete a run; gaps, eagles and bogeys break it.
 run:=0;
 for h in 1..18 loop
  select e.strokes into own_score from hole_score_entries e where e.group_id=new.group_id and e.scored_profile_id=new.scored_profile_id and e.entered_by_profile_id=new.scored_profile_id and e.hole=h;
  select e.strokes into attest_score from hole_score_entries e where e.group_id=new.group_id and e.scored_profile_id=new.scored_profile_id and e.entered_by_profile_id=attester and e.hole=h;
  if own_score=pars[h]-1 and attest_score=own_score then run:=run+1;else run:=0;end if;
  if run between 2 and 4 then
   moment_cause:='birdie_'||run;source:='birdie:'||new.group_id||':'||new.scored_profile_id||':'||h||':'||run;
   valid_sources:=array_append(valid_sources,source);
   update trip_momentum_events set withdrawn_at=null where source_key=source;
   event_id:=null;
   insert into trip_momentum_events(golf_trip_id,round_number,actor_id,kind,title,detail,cause,subject_name,source_key)
   values(g.golf_trip_id,n,new.scored_profile_id,'milestone','','',moment_cause,coalesce(player_name,'A golfer'),source)
   on conflict(source_key) do nothing returning id into event_id;
   if event_id is not null then
    insert into trip_push_deliveries(event_id,subscription_id) select event_id,s.id from trip_push_subscriptions s
    where s.golf_trip_id=g.golf_trip_id and s.milestones and is_golf_trip_member(g.golf_trip_id,s.profile_id);
   end if;
  end if;
 end loop;
 update trip_momentum_events set withdrawn_at=now() where golf_trip_id=g.golf_trip_id and actor_id=new.scored_profile_id and round_number=n and cause like 'birdie_%' and not(source_key=any(valid_sources)) and withdrawn_at is null;
 return new;
end; $$;
revoke all on function public.queue_trip_confirmed_moments() from public,anon,authenticated;
drop trigger if exists trip_confirmed_moments on hole_score_entries;
create trigger trip_confirmed_moments after insert or update on hole_score_entries for each row execute function queue_trip_confirmed_moments();


create or replace function public.set_trip_momentum_pars(p_profile uuid,p_trip uuid,p_round integer,p_pars integer[]) returns boolean
language plpgsql security definer set search_path=public as $$
declare r golf_trip_rounds;
begin
 if not exists(select 1 from golf_trip_members where golf_trip_id=p_trip and profile_id=p_profile and role='organizer') then return false;end if;
 select * into r from golf_trip_rounds where golf_trip_id=p_trip and round_number=p_round for update;
 if r.id is null or array_length(p_pars,1)<>18 or not (p_pars <@ array[3,4,5,6]) then return false;end if;
 perform 1 from scoring_groups where golf_trip_round_id=r.id for update;
 if exists(select 1 from scoring_groups g join hole_score_entries e on e.group_id=g.id where g.golf_trip_round_id=r.id) then return false;end if;
 update golf_trip_rounds set momentum_pars=p_pars where id=r.id;return true;
end; $$;
revoke all on function public.set_trip_momentum_pars(uuid,uuid,integer,integer[]) from public,anon,authenticated;
grant execute on function public.set_trip_momentum_pars(uuid,uuid,integer,integer[]) to service_role;
-- Only published official results; never infer a victory from one player's draft scores.
create or replace function public.queue_trip_early_match() returns trigger
language plpgsql security definer set search_path=public as $$
declare trip_id uuid; winner text; label text; event_id uuid;
begin
 if not new.mathematically_complete or new.official_result not in ('maroon','white') or new.thru<1 or new.thru>=16
  or new.margin<=18-new.thru then
  update trip_momentum_events set withdrawn_at=now() where source_key like 'early:'||new.match_box_id||':%' and withdrawn_at is null;
  return new; end if;
 select string_agg(coalesce(p.display_name,s.full_name,slug),' & ' order by ord) into winner
 from live_match_boxes b cross join lateral unnest(case when new.official_result='maroon' then b.maroon_players else b.white_players end) with ordinality u(slug,ord)
 left join profiles p on p.player_slug=u.slug left join player_slots s on s.player_slug=u.slug where b.id=new.match_box_id;
 label:=new.margin||'&'||(18-new.thru);
 for trip_id in select t.id from golf_trips t join tournament_editions ed on ed.tournament_id=t.tournament_id and ed.id=new.edition_id
 join live_round_state rs on rs.edition_id=ed.id and rs.round=new.round
 where exists(select 1 from golf_trip_rounds r where r.golf_trip_id=t.id and r.round_number=new.round and r.play_date=rs.date) loop
  update trip_momentum_events set withdrawn_at=null,subject_name=coalesce(winner,'The winning side'),result_label=label where source_key='early:'||new.match_box_id||':'||trip_id;
  event_id:=null;
  insert into trip_momentum_events(golf_trip_id,round_number,kind,title,detail,cause,subject_name,result_label,source_key)
  values(trip_id,new.round,'milestone','','','early_match_win',coalesce(winner,'The winning side'),label,'early:'||new.match_box_id||':'||trip_id)
  on conflict(source_key) do nothing returning id into event_id;
  if event_id is not null then
   insert into trip_push_deliveries(event_id,subscription_id) select event_id,s.id from trip_push_subscriptions s
   where s.golf_trip_id=trip_id and s.milestones and is_golf_trip_member(trip_id,s.profile_id);
  end if;
 end loop;
 return new;
end; $$;
revoke all on function public.queue_trip_early_match() from public,anon,authenticated;
drop trigger if exists trip_early_match on live_match_official_state;
create trigger trip_early_match after insert or update on live_match_official_state for each row execute function queue_trip_early_match();

commit;
