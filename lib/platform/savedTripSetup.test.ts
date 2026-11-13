import test from "node:test";
import assert from "node:assert/strict";
import { initialSetup, setupPlan, setupEncode, setupDecode, validSetup } from "./savedTripSetup";
import type { SavedGolfTrip } from "./golfTripCreate";

const trip = { trip: { id: "test", start_date: "2027-01-22", end_date: "2027-01-25", expected_traveler_count: 8, includes_tournament: "yes" },
  rounds: [{ roundNumber: 1, dayNumber: 2, playDate: "2027-01-23", courseName: "Course A" }],
  members: [{ invitationStatus: "accepted" }, { invitationStatus: "accepted" }] } as SavedGolfTrip;
test("initial saved setup includes empty arrival/departure days without phantom rounds", () => {
  const snapshot = initialSetup(trip);
  assert.equal(snapshot.values.dayCount, 4);
  assert.deepEqual(snapshot.values.roundsPerDay, { 0: 0, 1: 1, 2: 0, 3: 0 });
  assert.deepEqual(setupPlan(trip, snapshot.basis, snapshot.values).rounds, trip.rounds);
});
test("canonical round plan follows saved course/date choices", () => {
  const s = initialSetup(trip);
  const plan = setupPlan(trip, s.basis, { ...s.values, pickedCourses: { "1-0": { name: "New Course" } } });
  assert.equal(plan.rounds[0].courseName, "New Course");
  assert.equal(plan.rounds[0].playDate, "2027-01-23");
});
test("setup rejects unknown keys, score overrides, invalid capacity and dangerous JSON", () => {
  for (const value of [{ tripScoreEdits: {} }, { removedPlayers: [] }, { playerTotal: 0 }, { localCompetitionType: [] }, JSON.parse('{"teamNames":{"__proto__":{}}}')]) assert.equal(validSetup(value), false);
  const s = initialSetup(trip);
  assert.throws(() => setupPlan(trip, s.basis, { ...s.values, playerTotal: 1 }), /Remove a joined/);
});
test("Set settings round trip through wire JSON without losing selections", () => {
  const original = { scoringFieldsOff: new Set(["Putts"]), typePlayers: { individual: new Set([1]), team: new Set() } };
  const wire = JSON.stringify(original, setupEncode);
  assert.equal(validSetup(JSON.parse(wire)), true);
  assert.deepEqual(JSON.parse(wire, setupDecode), original);
});

test("match draft timers accept bounded optional minute values",()=>{
 const choice={method:"Match Draft",draftType:"Ranks",date:"",time:"",rankMinutes:10,putForwardMinutes:2,responseMinutes:1};
 assert.equal(validSetup({allRoundsMatch:choice}),true);
 for(const value of [0,-1,121,1.5,"10"]){assert.equal(validSetup({allRoundsMatch:{...choice,rankMinutes:value}}),false);}
});

test("course short names save by course name, 24 letters at most", () => {
  assert.equal(validSetup({ courseShortNames: { "Mission Hills CC": "Dinah Shore" } }), true);
  assert.equal(validSetup({ courseShortNames: {} }), true);
  assert.equal(validSetup({ courseShortNames: { "Mission Hills CC": "Mission Hills Tournament" } }), true); // exactly 24
  for (const bad of [{ "Mission Hills CC": "x".repeat(25) }, { "Mission Hills CC": "  " }, { "Mission Hills CC": 3 }, ["Dinah Shore"], { ["x".repeat(201)]: "Short" }])
    assert.equal(validSetup({ courseShortNames: bad }), false);
});

test("Team Draft captains save as team number → account id, nothing else", () => {
  const id = "0d4d3c2b-1a09-4f8e-9d7c-6b5a4f3e2d1c";
  assert.equal(validSetup({ draftCaptains: { 0: id, 1: id.replace("0d", "1d") } }), true);
  assert.equal(validSetup({ draftCaptains: {} }), true);
  assert.equal(validSetup({ draftCaptains: { 0: "Cade" } }), false);
  assert.equal(validSetup({ draftCaptains: { 64: id } }), false);
  assert.equal(validSetup({ draftCaptains: [id] }), false);
});

test("Match Selection results and finished rounds save in the setup; junk doesn't", () => {
  assert.equal(validSetup({ completedMatchDrafts: ["1-0"], matchSelectionResults: { "1-0": [{ a: [0, 2], b: [1, 3] }] } }), true);
  assert.equal(validSetup({ completedMatchDrafts: ["nope"] }), false);
  assert.equal(validSetup({ matchSelectionResults: { "1-0": [{ a: ["x"], b: [] }] } }), false);
});
