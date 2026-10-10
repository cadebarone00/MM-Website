import {test} from 'node:test';
import assert from 'node:assert/strict';
import {palmSprings2026} from '@/lib/data/2026-palm-springs';
import {adaptTournamentToDraft,adaptTournamentToPreviewMatch} from '@/lib/platform/tournamentToGolfTrip';
import {plannedRounds} from '@/lib/platform/golfTripDraft';
import {simulatorTripData} from './golfTripSimulatorData';
import {DEFAULT_SIMULATOR_STATE} from './simulator';
import {applyEditedTrip} from './editedTrip';
import {devTripScoring} from './devTripScores';
import {devTripGroup} from './devTripScores';
import {devTripRoundId,seedDevRounds,devRoundsReducer,devRoundMeta} from './devPlayerRounds';
const maroon={preview:adaptTournamentToDraft(palmSprings2026).draft,previewMatch:adaptTournamentToPreviewMatch(palmSprings2026)};
const real=simulatorTripData(maroon,maroon,{source:'maroon',state:DEFAULT_SIMULATOR_STATE});
test('real data has editable empty travel and all actual tournament sessions',()=>{
 assert.equal(real.travel?.members.length,12);assert.equal(real.travel?.items.length,0);
 assert.equal(plannedRounds(real.preview!).length,8);
 assert.equal(real.preview?.day1Rounds,'2');assert.equal(real.preview?.round2Format,'Alternate Shot');
 assert.equal(real.previewMatch?.matches.find(m=>m.result==='6&4')?.round,6);
 assert.ok(real.previewMatch?.formatDef);
});
test('setup edits reach trip surfaces without erasing tournament standings or results',()=>{
 const edited=applyEditedTrip(real,{arrivalShift:1,pickedCourses:{'0-0':{name:'Updated Course'} as never},teeTimes:{'0-0':['08:20']},teePlayers:{'0-0':{0:[0]}},roundsPerDay:{0:2,1:0,2:2,3:2}});
 assert.equal(edited.preview?.round1Course,'Updated Course');assert.equal(edited.preview?.startDate,'2026-01-08');
 assert.equal(plannedRounds(edited.preview!).length,6);
 assert.deepEqual(edited.previewMatch?.leaderboard,real.previewMatch?.leaderboard);
 assert.deepEqual(edited.previewMatch?.matches.map(m=>[m.round,m.result,m.gross,m.net]),real.previewMatch?.matches.map(m=>[m.round,m.result,m.gross,m.net]));
 assert.equal(edited.previewMatch?.matches[0].left.course,"Updated Course");
 assert.ok(edited.travel?.items.some(i=>i.startsAt==='2026-01-08T08:20'));
 assert.equal(real.travel?.items.length,0);
});
test('scoring groups, cards and start/end flags are isolated by source',()=>{
 const a={...real.previewMatch!,devTripId:'real'},b={...real.previewMatch!,devTripId:'busy'};
 const ga=devTripGroup(a,'dev-cade')!,gb=devTripGroup(b,'dev-cade')!;
 assert.notEqual(ga.id,gb.id);assert.notEqual(devTripRoundId(a),devTripRoundId(b));
 let store=seedDevRounds();store=devRoundsReducer(store,{type:'setTripRound',tripRoundId:devTripRoundId(a),state:'open',at:'now'});
 assert.equal(store.tripRounds[devTripRoundId(b)],undefined);
 store=devRoundsReducer(store,{type:'saveGroup',group:ga});
 store=devRoundsReducer(store,{type:'setAllowPushThrough',tripId:'real',on:true});
 assert.equal(store.allowPushThroughByTrip?.busy,undefined);
 assert.equal(devTripScoring(store,b,'dev-cade').myLiveCard,undefined);
 assert.equal(devRoundMeta(a).tripId,'real');
});

test('submitted teams update unplayed pairings without rewriting finished results',()=>{
 const first=real.previewMatch!.matches[0];
 const base={...real,previewMatch:{...real.previewMatch!,matches:[{...first,round:1,gross:null,net:null,result:undefined},{...first,round:2}]}};
 const edited=applyEditedTrip(base,{submittedTeams:[[0],[1]]});
 const open=edited.previewMatch!.matches.find(m=>m.round===1)!;
 assert.equal('golfers' in open.left&&open.left.golfers[0].name,real.travel!.members[0].name);
 assert.equal(edited.previewMatch!.matches.find(m=>m.round===2)?.result,first.result);
});
