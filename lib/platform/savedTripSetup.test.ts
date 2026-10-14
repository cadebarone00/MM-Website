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
