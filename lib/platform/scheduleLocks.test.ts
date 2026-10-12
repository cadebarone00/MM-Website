import test from "node:test";
import assert from "node:assert/strict";
import { roundHasStarted, groupHasStarted } from "./scheduleLocks.ts";
test("only actual start evidence locks play; an ended round retains its locks",()=>{
 assert.equal(roundHasStarted({}, {}), false);
 assert.equal(roundHasStarted({}, {openedAt:"2026-10-10T12:00:00Z"}), true);
 assert.equal(roundHasStarted({1:"started"}), true);
 assert.equal(roundHasStarted({},undefined,true), true);
});
test("group starts protect only started groups; legacy round starts protect all groups",()=>{
 assert.equal(groupHasStarted(0,{0:"started"}),true);
 assert.equal(groupHasStarted(1,{0:"started"},{openedAt:"round-start"}),false);
 assert.equal(groupHasStarted(1,{}, {openedAt:"round-start"}),true);
 assert.equal(groupHasStarted(1,{},undefined,true),true);
});
