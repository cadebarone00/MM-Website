import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_SIMULATOR_STATE,parseSimulatorConfig,type SimulatorConfig,type SimulatorState} from "./simulator";
import {normalizeTripScenario,scenarioClock,tripScenarioSetup} from "./tripScenario";
import {simulatorTripData,simulatorNow,simulatorRoundLive} from "./golfTripSimulatorData";
import {GOLF_MATCH_PREVIEW,GOLF_TRIP_MOCK_DRAFT,normalizeCompetitor} from "@/lib/platform/golfTripPreviewFixture";
import {plannedRounds} from "@/lib/platform/golfTripDraft";
import {matchDraftRounds} from "@/lib/platform/matchDraft";
import {applyEditedTrip} from "./editedTrip";
const mock={preview:GOLF_TRIP_MOCK_DRAFT,previewMatch:GOLF_MATCH_PREVIEW};
const config=(changes:Partial<SimulatorState>={},source:"mock"|"busy"="mock"):SimulatorConfig=>({source,state:normalizeTripScenario({...DEFAULT_SIMULATOR_STATE,tripLength:4,tripDay:1,tripMoment:"during",tripRoundsPerDay:1,competition:"yes",competitionSetup:"both",roundStatus:"live",playerCount:8,...changes})});
test("scenario boundary rejects malformed choices and resolves dependent choices",()=>{
 for(const field of [{tripLength:0},{tripLength:15},{tripMoment:"bad"},{draftProgress:"bad"},{tripRoundsPerDay:3},{tripDay:1.5}])assert.equal(parseSimulatorConfig({...config(),state:{...config().state,...field}}),null);
 const s=normalizeTripScenario({...config().state,tripLength:2,tripDay:8,tripRoundsPerDay:1,tripRoundSlot:2,draftProgress:"team-draft"});assert.equal(s.tripDay,2);assert.equal(s.tripRoundSlot,1);assert.equal(s.draftProgress,"ready");assert.equal(normalizeTripScenario({...s,competition:"no"}).competitionSetup,"none");
});
test("both sources keep roster, schedule, clock, current round and drafts consistent across the trip",()=>{
 for(const source of ["mock","busy"] as const)for(const length of [1,3,14])for(const perDay of [1,2])for(const moment of ["30-days","day-before","during","complete"] as const){
  const c=config({tripLength:length,tripDay:length,tripRoundsPerDay:perDay,tripRoundSlot:perDay,tripMoment:moment,playerCount:17},source),data=simulatorTripData(mock,mock,c),setup=tripScenarioSetup(c),rounds=plannedRounds(data.preview!);
  assert.equal(rounds.length,length*perDay);assert.equal(data.previewMatch!.roundCount,rounds.length);assert.equal(data.travel!.members.length,17);assert.equal(data.previewMatch!.leaderboard.length,17);assert.equal(new Set(data.travel!.members.map(p=>p.name)).size,17);
  assert.equal(data.travel!.items.filter(i=>i.kind==="teeTime").length,rounds.length);assert.equal(simulatorNow(c,data,simulatorRoundLive(c.state.roundStatus,data.previewMatch)),scenarioClock(c.state));
  const current=data.previewMatch!.round;assert.ok(current>=1&&current<=rounds.length);assert.equal(data.previewMatch!.roundDate,rounds[current-1].date);
  const edited=applyEditedTrip(data,setup);assert.equal(plannedRounds(edited.preview!).length,rounds.length);assert.equal(edited.previewMatch!.leaderboard.length,17);
  if(moment==="during"||moment==="complete"){assert.equal(current,length*perDay);assert.equal(c.state.draftProgress,"ready");assert.ok((setup.submittedTeams as number[][]).flat().length===17);assert.ok(matchDraftRounds(setup,rounds.map(r=>({...r,course:"Test",format:"Singles"})),17).every(r=>r.locked));}
  if(moment==="complete")assert.ok(data.previewMatch!.leaderboard.every(row=>row.holes.every(h=>h!==null)));
 }
});
test("draft stages never expose teams before team drafting or matches before match drafting",()=>{
 for(const draftProgress of ["team-draft","match-draft","ready"] as const){const c=config({tripMoment:"day-before",draftProgress});const data=simulatorTripData(mock,mock,c),setup=tripScenarioSetup(c);assert.equal(Boolean(data.preview!.rosterMaroon),draftProgress!=="team-draft");assert.equal(Boolean(data.previewMatch!.matches.length),draftProgress==="ready");assert.equal(Boolean(setup.submittedTeams),draftProgress!=="team-draft");const matches=matchDraftRounds(setup,plannedRounds(data.preview!).map(r=>({...r,course:"Test",format:"Singles"})),8);assert.equal(matches.some(r=>!r.locked),draftProgress!=="ready");if(draftProgress==="ready"){const a=new Set(data.preview!.rosterMaroon.split(",")),b=new Set(data.preview!.rosterWhite.split(","));for(const pair of data.previewMatch!.matches){assert.ok(a.has(normalizeCompetitor(pair.left).golfers[0].name));if(pair.right)assert.ok(b.has(normalizeCompetitor(pair.right).golfers[0].name));}}}
});
test("social and individual trips never seed team assignments or draft methods",()=>{for(const competitionSetup of ["none","individual"] as const){const c=config({competitionSetup,competition:competitionSetup==="none"?"no":"yes"}),s=tripScenarioSetup(c);assert.equal(s.teamSelection,null);assert.equal(s.submittedTeams,null);assert.equal((s.localCompetitionType as {team:null}).team,null);}});
test("selected day and morning/afternoon state drive scoring without inventing extra rounds",()=>{for(const roundStatus of ["scheduled","live","roundEnd","between"] as const){const c=config({tripLength:2,tripDay:2,tripRoundsPerDay:2,tripRoundSlot:2,roundStatus});const d=simulatorTripData(mock,mock,c);assert.equal(d.previewMatch!.round,4);assert.equal(d.previewMatch!.roundCount,4);assert.equal(simulatorRoundLive(roundStatus,d.previewMatch),roundStatus==="live"||roundStatus==="roundEnd");assert.ok(simulatorNow(c,d,true)!.startsWith(d.previewMatch!.roundDate!));if(roundStatus==="scheduled")assert.ok(d.previewMatch!.leaderboard.every(row=>row.holes.every(h=>h===null)));}});

test("day four supplies completed prior cards, cumulative standings, matching results and schedule-based stats",async()=>{
 const {scenarioTripStats}=await import("./scenarioTripStats");
 const {matchCard}=await import("@/lib/platform/matchCenter");
 for(const source of ["mock","busy"] as const)for(const perDay of [1,2]){
  const c=config({tripLength:5,tripDay:4,tripRoundsPerDay:perDay,playerCount:8},source),data=simulatorTripData(mock,mock,c),match=data.previewMatch!;
  assert.equal(match.roundStandings!.length,match.round);
  const earlier=simulatorTripData(mock,mock,config({tripLength:5,tripDay:2,tripRoundsPerDay:perDay,playerCount:8},source));
  assert.deepEqual(match.roundStandings![0].leaderboard,earlier.previewMatch!.roundStandings![0].leaderboard);
  for(const snapshot of match.roundStandings!.filter(s=>s.round<match.round)){
   assert.equal(snapshot.leaderboard.length,8);assert.ok(snapshot.leaderboard.every(row=>row.holes.every(h=>h!==null)&&row.thru==="F"));
   for(const row of snapshot.leaderboard){const today=row.holes.reduce<number>((sum,h,i)=>sum+h!-(snapshot.par![i]??4),0);assert.equal(row.today,today===0?"E":today>0?"+"+today:String(today));const cumulative=match.roundStandings!.filter(s=>s.round<=snapshot.round).reduce((sum,s)=>sum+s.leaderboard.find(r=>r.golfer.name===row.golfer.name)!.holes.reduce<number>((total,h,i)=>total+(h===null?0:h-(s.par![i]??4)),0),0);assert.equal(row.total,cumulative===0?"E":cumulative>0?"+"+cumulative:String(cumulative));}
   const past={...match,round:snapshot.round,leaderboard:snapshot.leaderboard};for(const pair of match.matches.filter(pair=>pair.round===snapshot.round)){const card=matchCard(past,pair,false);assert.ok(card.played>0&&card.played<=18);assert.ok(card.finished);assert.equal(pair.result,card.result);assert.ok(pair.sides?.every(side=>side.putts!=="-"));}
  }
  const stats=scenarioTripStats(match,data.preview!,c.state.roundStatus);assert.equal(stats.rounds.length,(match.round-1)*8);assert.ok(stats.rounds.every(card=>card.holes.length===18&&card.holes.every(h=>h.putts!==null&&h.green!==null)));assert.ok(stats.rounds.every(card=>plannedRounds(data.preview!).some(round=>round.date===card.datePlayed)));
  for(const card of stats.rounds){const snapshot=match.roundStandings!.find(s=>"round-"+s.round===card.tripRoundId)!;assert.deepEqual(card.holes.map(h=>h.strokes),snapshot.leaderboard.find(row=>row.golfer.name===card.profileId)!.holes);}
 }
});

test("randomized travel fits flights, car capacity, hotel nights and the golf schedule",async()=>{
 const {checkTravelInput}=await import("@/lib/platform/tripTravel");
 const minutes=(a:string,b:string)=>(Date.parse(b+":00Z")-Date.parse(a+":00Z"))/60000;
 for(const source of ["mock","busy"] as const)for(const tripLength of [1,4])for(const tripRoundsPerDay of [1,2])for(const playerCount of [1,7,64]){
  const c=config({seed:17,tripLength,tripRoundsPerDay,playerCount,competition:"no",competitionSetup:"none"},source),d=simulatorTripData(mock,mock,c),travel=d.travel!;
  for(const item of travel.items){assert.deepEqual(checkTravelInput(item.kind,item.details,item.startsAt,item.endsAt),{});if(item.endsAt)assert.ok(item.endsAt>item.startsAt);}
  const golf=travel.items.filter(item=>item.kind==="teeTime"),first=golf[0].startsAt,last=golf.at(-1)!.startsAt;
  for(const member of travel.members){const mine=travel.items.filter(item=>travel.participants.some(p=>p.memberId===member.id&&p.itemId===item.id));const flights=mine.filter(item=>item.kind==="flight"),cars=mine.filter(item=>item.kind==="ride");assert.equal(flights.length,2);assert.equal(cars.length,1);const [out,back]=flights;assert.equal(out.details.from,back.details.to);assert.equal(out.details.to,back.details.from);assert.notEqual(out.details.from,out.details.to);assert.ok(minutes(out.endsAt!,cars[0].startsAt)>=45);assert.ok(minutes(cars[0].startsAt,first)>=120);assert.ok(minutes(last,cars[0].endsAt!)>=330);assert.ok(minutes(cars[0].endsAt!,back.startsAt)>=120);const hotel=mine.find(item=>item.kind==="lodging");assert.equal(!!hotel,tripLength>1);if(hotel){assert.ok(hotel.startsAt<hotel.endsAt!);assert.ok(hotel.endsAt!<golf.find(item=>item.startsAt.startsWith(d.preview!.endDate))!.startsAt);}}
  for(const car of travel.items.filter(item=>item.kind==="ride"))assert.ok(travel.participants.filter(p=>p.itemId===car.id).length<=(car.details.seats??0));
  assert.ok(travel.participants.every(p=>travel.members.some(m=>m.id===p.memberId)&&travel.items.some(i=>i.id===p.itemId)));
  const later=simulatorTripData(mock,mock,config({...c.state,tripMoment:"complete"},source));assert.deepEqual(travel.items,later.travel!.items);
 }
 const first=simulatorTripData(mock,mock,config({seed:17})).travel!.items,second=simulatorTripData(mock,mock,config({seed:18})).travel!.items;
 assert.notDeepEqual(first.filter(i=>i.kind==="flight"),second.filter(i=>i.kind==="flight"));
});
