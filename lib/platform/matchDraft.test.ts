import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMatchDraft, matchDraftPlayerId, matchDraftRounds, placeMatchDraftPlayer, responseDraftTurn, type MatchDraftPlayer, type MatchDraftRound } from "./matchDraft";
const players: MatchDraftPlayer[] = ["A","B"].flatMap(team => Array.from({length:4},(_,index)=>({id:team+index,name:team+index,team:team as "A"|"B"})));
const round: MatchDraftRound = {key:"0-0",number:1,course:"Course",format:"Fourball",perSide:2,matches:2,type:"Response",when:"Date not set"};
test("Response fills each group before its opposition and alternates opening team",()=>{
 let picks: ReturnType<typeof placeMatchDraftPlayer> = [];
 const expected = ["A","A","B","B","B","B","A","A"];
 for(const team of expected){const turn=responseDraftTurn(round,picks)!;assert.equal(turn.team,team);const player=players.find(p=>p.team===team&&!picks.some(item=>item.player===matchDraftPlayerId(p)))!;picks=placeMatchDraftPlayer(round,players,picks,matchDraftPlayerId(player),turn.match,turn.team,turn.slot);}
 assert.equal(responseDraftTurn(round,picks),null);assert.equal(new Set(picks.map(p=>p.player)).size,8);
});
test("placements reject wrong-team players, capacity overflow and locked rounds",()=>{
 assert.deepEqual(placeMatchDraftPlayer(round,players,[],"A0",0,"B",0),[]);
 assert.deepEqual(placeMatchDraftPlayer(round,players,[],"A0",2,"A",0),[]);
 assert.deepEqual(placeMatchDraftPlayer(round,players,[],"A0",0,"A",2),[]);
 assert.deepEqual(placeMatchDraftPlayer({...round,locked:true},players,[],"A0",0,"A",0),[]);
});
test("Ranks pairs corresponding ranked groups without changing source roster",()=>{
 const ranks=["A3","A2","A1","A0","B1","B0","B3","B2"];
 const groups=generateMatchDraft(round,players,"Ranks",ranks);
 assert.deepEqual(groups.filter(p=>p.match===0&&p.team==="A").map(p=>p.player),["A3","A2"]);
 assert.deepEqual(groups.filter(p=>p.match===0&&p.team==="B").map(p=>p.player),["B1","B0"]);
 assert.equal(players[0].id,"A0");assert.equal(groups.length,8);
});
test("Randomized fills all slots once per team and rejects an insufficient roster",()=>{
 const groups=generateMatchDraft(round,players,"Randomized",[],()=>0);
 assert.equal(groups.length,8);assert.equal(new Set(groups.map(p=>p.player)).size,8);
 assert.deepEqual(groups.filter(p=>p.team==="A").map(p=>p.player),["A1","A2","A3","A0"]);
 assert.throws(()=>generateMatchDraft(round,players.slice(0,7),"Randomized",[],()=>.5),/needs/);
 assert.throws(()=>generateMatchDraft({...round,locked:true},players,"Ranks",[]),/already started/);
});
test("round schedules use per-round date overrides, configured format, disabled rounds and global method",()=>{
 const setup={roundsPerDay:{0:2,1:1},allRoundsMatch:{method:"Match Draft",draftType:"Ranks",date:"2027-04-20",time:"18:00"},matchSelections:{"0-1":{date:"2027-04-21",time:"19:00",method:"Manual"}},compRounds:{"1-0":false},compFormats:{"0-1":{players:8,format:"Fourball",matchType:"Match Play",nassau:false,pointsPerMatch:1,scoring:"Gross"}}};
 const rounds=[1,2,3].map((number,index)=>({number,date:index<2?"2027-04-22":"2027-04-23",course:"Course",format:"Singles"}));
 const result=matchDraftRounds(setup,rounds,8,1);
 assert.equal(result.length,2);assert.equal(result[0].locked,true);assert.equal(result[1].key,"0-1");assert.equal(result[1].date,"2027-04-21");assert.equal(result[1].type,"Ranks");assert.equal(result[1].perSide,2);assert.equal(result[1].matches,2);
 assert.equal(matchDraftRounds({...setup,matchPerRound:true},rounds,8).length,0);
});
