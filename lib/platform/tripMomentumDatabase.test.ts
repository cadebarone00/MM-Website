import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database,profile,sqlFile} from './testDatabase.ts';
import {randomUUID} from 'node:crypto';
import {golfTripPayloadFromBody} from './golfTripCreate.ts';
test('momentum: atomic events, replay deduplication, preferences, leases, removal and private tables',async()=>{
 const db=await database();try{
 for(const f of ['golf_trips.sql','golf_trip_invitations.sql','golf_trip_flights.sql','golf_trip_scoring.sql','golf_trip_scoring_fix_groups.sql','golf_trip_scoring_offline.sql','golf_trip_momentum.sql'])await db.exec(sqlFile(f));
 await db.exec(sqlFile('golf_trip_momentum.sql'));
 const a=await profile(db,'a'),b=await profile(db,'b'),outsider=await profile(db,'out');
 const p=golfTripPayloadFromBody({requestId:randomUUID(),tripName:'Round',destination:'Austin',startDate:'2027-04-22',endDate:'2027-04-26',playerCount:'2',yourName:'A',yourEmail:'a@example.com',golfDays:'1',day1Date:'2027-04-23',day1Rounds:'1',round1Course:'',includesTournament:'no',knowsLodging:'no',knowsFlights:'no',knowsTransportation:'no'});assert.ok(p.ok);
 const trip=(await db.query<{v:{tripId:string}}>('select create_golf_trip($1,$2) v',[a,JSON.stringify(p.payload)])).rows[0].v.tripId;
 await db.query("insert into golf_trip_members(golf_trip_id,profile_id,display_name,role,invitation_status) values($1,$2,'B','member','accepted')",[trip,b]);
 const saveSub=async(who:string,endpoint:string,scores:boolean)=> (await db.query<{v:boolean}>('select save_trip_push($1,$2,$3,$4,$5,$6,true) v',[who,trip,endpoint,'key','auth',scores])).rows[0].v;
 assert.equal(await saveSub(outsider,'https://fcm.googleapis.com/out',true),false);
 assert.equal(await saveSub(b,'https://fcm.googleapis.com/b',true),true);
 assert.equal(await saveSub(a,'https://fcm.googleapis.com/b',true),false,'another account cannot take over an endpoint');
 const groups=[{players:[{profileId:a,attesterProfileId:b,side:null},{profileId:b,attesterProfileId:a,side:null}]}];
 const group=(await db.query<{v:{groups:{id:string}[]}}>('select save_trip_scoring_groups($1,$2,1,$3) v',[a,trip,JSON.stringify(groups)])).rows[0].v.groups[0].id;
 assert.equal((await db.query<{v:boolean}>('select set_trip_momentum_pars($1,$2,1,$3) v',[b,trip,Array(18).fill(4)])).rows[0].v,false);
 assert.equal((await db.query<{v:boolean}>('select set_trip_momentum_pars($1,$2,1,$3) v',[a,trip,Array(18).fill(4)])).rows[0].v,true);
 const op={opId:randomUUID(),baseVersion:0,supersedes:[],clientUpdatedAt:new Date().toISOString(),entry:{hole:1,strokes:4}};
 const write=()=>db.query('select save_hole_score_ops($1,$2,$1,$3)',[a,group,JSON.stringify([op])]);
 await write();await write();
 assert.equal((await db.query('select * from trip_momentum_events')).rows.length,1,'a duplicate scoring op creates no duplicate event');
 await db.query('select save_hole_scores($1,$2,$3,now(),$4)',[b,group,a,JSON.stringify([{hole:1,strokes:4}])]);
 assert.equal((await db.query('select * from trip_momentum_events')).rows.length,1,'attesting does not create another score alert');
 const claim=async()=> (await db.query<{v:unknown[]}>('select claim_trip_push(20) v')).rows[0].v;
 assert.equal((await claim()).length,1);assert.equal((await claim()).length,0,'leased rows cannot be claimed twice');
 await db.query("update trip_push_deliveries set available_at=now()-interval '1 second'");assert.equal((await claim()).length,1,'failed deliveries retry after lease');
 await saveSub(b,'https://fcm.googleapis.com/b',false);
 await db.query("update trip_push_deliveries set available_at=now()-interval '1 second'");assert.equal((await claim()).length,0,'preferences suppress pending deliveries');
 await db.query('select save_hole_scores($1,$2,$1,now(),$3)',[a,group,JSON.stringify([{hole:2,strokes:1}])]);assert.equal((await claim()).length,0,'an unattested ace never alerts');
 await db.query('select save_hole_scores($1,$2,$3,now(),$4)',[b,group,a,JSON.stringify([{hole:2,strokes:1}])]);assert.equal((await claim()).length,1,'an attested ace alerts');
 assert.equal((await db.query<{v:boolean}>('select set_trip_momentum_pars($1,$2,1,$3) v',[a,trip,Array(18).fill(5)])).rows[0].v,false,'pars lock after scoring starts');
 for(const hole of [3,4,5,6]) {
  await db.query('select save_hole_scores($1,$2,$1,now(),$3)',[a,group,JSON.stringify([{hole,strokes:3}])]);
  await db.query('select save_hole_scores($1,$2,$3,now(),$4)',[b,group,a,JSON.stringify([{hole,strokes:3}])]);
 }
 assert.deepEqual((await db.query<{cause:string}>("select cause from trip_momentum_events where cause like 'birdie_%' order by cause")).rows.map(r=>r.cause),['birdie_2','birdie_3','birdie_4']);
 await db.query('select save_hole_scores($1,$2,$1,now(),$3)',[a,group,JSON.stringify([{hole:7,strokes:3}])]);
 await db.query('select save_hole_scores($1,$2,$3,now(),$4)',[b,group,a,JSON.stringify([{hole:7,strokes:3}])]);
 assert.equal((await db.query("select * from trip_momentum_events where cause like 'birdie_%'")).rows.length,3,'no unapproved fifth-birdie headline');
 await db.query('update scoring_group_players set submitted_at=now() where group_id=$1 and profile_id=$2',[group,a]);
 assert.equal((await db.query("select * from trip_momentum_events where cause='hole_in_one'")).rows.length,1,'one ace event despite repeated updates');
 // Corrections reopen the submitted card before edits.
 await db.query('update scoring_group_players set submitted_at=null where group_id=$1 and profile_id=$2',[group,a]);
 // Corrections retract causes and suppress any pending push.
 await db.query('select save_hole_scores($1,$2,$1,now(),$3)',[a,group,JSON.stringify([{hole:2,strokes:2},{hole:4,strokes:4}])]);
 assert.equal((await db.query("select * from trip_momentum_events where cause='hole_in_one' and withdrawn_at is null")).rows.length,0);
 assert.equal((await db.query("select * from trip_momentum_events where cause='birdie_4' and withdrawn_at is null")).rows.length,0);
 // Use the native publication schema to verify hole-16 boundary and official-only decisions.
 await db.query("insert into live_round_state(season_year,round,date) values(2027,1,'2027-04-23') on conflict(season_year,round) do update set date=excluded.date");
 const columns=(await db.query<{column_name:string}>("select column_name from information_schema.columns where table_name='live_match_boxes' and table_schema='public'")).rows.map(r=>r.column_name);
 const values:Record<string,unknown>={id:randomUUID(),tournament_year:2027,season_year:2027,round:1,day:1,session:'Morning',box_number:1,format:'Singles',tee_time:new Date().toISOString(),maroon_players:['a'],white_players:['b'],state:'Final',started:true};
 const names=Object.keys(values).filter(k=>columns.includes(k));
 await db.query('insert into live_match_boxes('+names.join(',')+') values('+names.map((_,i)=>'$'+(i+1)).join(',')+')',names.map(k=>Array.isArray(values[k])?'{'+(values[k] as string[]).join(',')+'}':values[k]));
 await db.query('update golf_trips set tournament_id=(select tournament_id from tournament_editions where season_year=2027 limit 1) where id=$1',[trip]);
 await db.query("insert into live_match_official_state(match_box_id,season_year,round,status,thru,leader,margin,mathematically_complete,official_result) values($1,2027,1,'complete',16,'maroon',3,true,'maroon')",[values.id]);
 assert.equal((await db.query("select * from trip_momentum_events where cause='early_match_win'")).rows.length,0,'a 3&2 win ends on 16 and does not qualify');
 await db.query('update live_match_official_state set thru=14,margin=5 where match_box_id=$1',[values.id]);
 await db.query('update live_match_official_state set thru=14,margin=5 where match_box_id=$1',[values.id]);
 assert.equal((await db.query("select * from trip_momentum_events where cause='early_match_win'")).rows.length,1,'a 5&4 win qualifies once');
 await db.query("update live_match_official_state set mathematically_complete=false,official_result=null where match_box_id=$1",[values.id]);
 assert.equal((await db.query("select * from trip_momentum_events where cause='early_match_win' and withdrawn_at is null")).rows.length,0,'a corrected official result retracts the event');
 await db.query('delete from golf_trip_members where golf_trip_id=$1 and profile_id=$2',[trip,b]);assert.equal((await claim()).length,0,'leaving suppresses queued deliveries');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from trip_push_subscriptions'),/permission denied/);await assert.rejects(db.query('select * from trip_momentum_events'),/permission denied/);await db.exec('reset role');
 await db.query('delete from golf_trips where id=$1',[trip]);assert.equal((await db.query('select * from trip_push_deliveries')).rows.length,0,'trip deletion cascades');
 }finally{await db.close();}
});

