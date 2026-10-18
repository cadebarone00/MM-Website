import test from "node:test";
import assert from "node:assert/strict";
import { advanceResponseTimeouts, chooseResponsePlayer, clearRankSlot, draftSessionLocked, setRankSlot, startMatchDraftSession, submitResponseGroup, swapRankGroups } from "./matchDraftSession";
import { responseDraftTurn, type MatchDraftPlayer, type MatchDraftRound } from "./matchDraft";
const players:MatchDraftPlayer[]=[{id:"Collin",name:"Collin",team:"A"},{id:"Cade",name:"Cade",team:"A"},{id:"Alex",name:"Alex",team:"A"},{id:"Sam",name:"Sam",team:"A"},{id:"Cam",name:"Cam",team:"B"},{id:"Luke",name:"Luke",team:"B"},{id:"Jordan",name:"Jordan",team:"B"},{id:"Riley",name:"Riley",team:"B"}];
const round:MatchDraftRound={key:"0-0",number:1,course:"Course",format:"Fourball",perSide:2,matches:2,type:"Ranks",when:"",rankMinutes:10,putForwardMinutes:2,responseMinutes:1};
test("Ranks pairs both #1 pairings and freezes all player/pair changes exactly at deadline",()=>{
 let session=startMatchDraftSession(round,players,1000);
 for(const [id,team,slot] of [["Collin","A",0],["Cade","A",1],["Cam","B",0],["Luke","B",1]] as const) session=setRankSlot(round,players,session,id,0,team,slot,2000);
 assert.deepEqual(session.placements.filter(p=>p.match===0&&p.team==="A").map(p=>p.player),["Collin","Cade"]);
 assert.deepEqual(session.placements.filter(p=>p.match===0&&p.team==="B").map(p=>p.player),["Cam","Luke"]);
 assert.equal(draftSessionLocked(round,session,600999),false);assert.equal(draftSessionLocked(round,session,601000),true);
 assert.equal(clearRankSlot(round,session,0,"A",0,601000),session);
 assert.equal(setRankSlot(round,players,session,"Sam",0,"A",0,601000),session);
 assert.equal(swapRankGroups(round,session,"A",0,1,601000),session);
});
test("rank swaps move whole pairs together within one team",()=>{
 let session=startMatchDraftSession(round,players,0);
 session=setRankSlot(round,players,session,"Collin",0,"A",0,10);session=setRankSlot(round,players,session,"Cade",0,"A",1,10);session=setRankSlot(round,players,session,"Cam",0,"B",0,10);
 session=swapRankGroups(round,session,"A",0,1,20);
 assert.ok(session.placements.filter(p=>p.team==="A").every(p=>p.match===1));assert.equal(session.placements.find(p=>p.team==="B")?.match,0);
});
test("Response submits complete pairs, then resets response and next opening timers independently",()=>{
 const response={...round,type:"Response"};let session=startMatchDraftSession(response,players,1000);
 session=chooseResponsePlayer(response,players,session,"Collin",2000);assert.equal(session.deadline,121000);
 assert.throws(()=>submitResponseGroup(response,players,session,3000),/complete/);
 session=chooseResponsePlayer(response,players,session,"Cade",4000);session=submitResponseGroup(response,players,session,5000);
 assert.equal(responseDraftTurn(response,session.placements)?.team,"B");assert.equal(session.deadline,65000);
 session=chooseResponsePlayer(response,players,session,"Cam",6000);session=chooseResponsePlayer(response,players,session,"Luke",7000);session=submitResponseGroup(response,players,session,8000);
 assert.deepEqual(responseDraftTurn(response,session.placements),{match:1,team:"B",slot:0});assert.equal(session.deadline,128000);
});
test("timeouts retain partial pair and auto-fill remaining team players without duplicate picks",()=>{
 const response={...round,type:"Response"};let session=startMatchDraftSession(response,players,0);session=chooseResponsePlayer(response,players,session,"Collin",1000);
 const original=session;session=advanceResponseTimeouts(response,players,session,120000,()=>0);
 assert.equal(original.placements.length,0);assert.equal(session.placements.length,2);assert.ok(session.placements.some(p=>p.player==="Collin"));assert.equal(session.autoFilledGroups,1);assert.equal(session.deadline,180000);
 session=advanceResponseTimeouts(response,players,session,1000000,()=>0);
 assert.equal(session.placements.length,8);assert.equal(new Set(session.placements.map(p=>p.player)).size,8);assert.equal(session.autoFilledGroups,4);assert.equal(responseDraftTurn(response,session.placements),null);
 assert.throws(()=>submitResponseGroup(response,players,session,1000000),/locked/);
});
test("wrong-team picks, missing players, and elapsed-turn submissions are rejected",()=>{
 const response={...round,type:"Response"};let session=startMatchDraftSession(response,players,0);
 assert.equal(chooseResponsePlayer(response,players,session,"Cam",1),session);
 assert.equal(chooseResponsePlayer(response,players,session,"Collin",120000),session);
 assert.throws(()=>submitResponseGroup(response,players,session,120000),/locked/);
 assert.throws(()=>startMatchDraftSession(response,players.slice(0,6),0),/needs/);
 session=chooseResponsePlayer(response,players,session,"Collin",1);
 const blocked=advanceResponseTimeouts(response,players.filter(p=>p.team==="B"||p.id==="Collin"),session,120000,()=>0);
 assert.ok(blocked.blockedReason);assert.equal(blocked.placements.length,0);
});
