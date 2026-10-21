import assert from "node:assert/strict";
import test from "node:test";
import type { GolfCourse } from "./golfGps/domain";
import { setupPlan, type SetupBasis } from "./savedTripSetup.ts";
import type { SavedGolfTrip } from "./golfTripCreate.ts";
import { coursePars, parsFromForm, roundCoursePick, roundSlotKeys, startHolesOf, tripRoundParsFromJson, validTripPars } from "./tripRoundPars.ts";
import { tripScoringFromJson } from "./tripScoring.ts";
import { detectionSetup, parsForDetection, snapshotFromTripPars } from "../highlights/detect/roundPars.ts";
import { classifyHole } from "../golf/holeResult.ts";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
// Blue plays the course pars; Red plays hole 1 as a par 5 (a forward-tee par); Junior plays hole 2 as a par 7 (invalid here).
const course = (holes = PAR) => ({
  name: "Test Links", address: { city: "Austin", state: "TX" },
  holes: holes.map((par, i) => ({ number: i + 1, par, tees: i === 0 ? [{ name: "Red", par: 5 }, { name: "Blue" }] : i === 1 ? [{ name: "Junior", par: 7 }] : [] })),
  teeSets: [{ id: "b", name: "Blue" }, { id: "r", name: "Red" }],
}) as unknown as GolfCourse;
const SNAPSHOT = { pars: PAR, source: "course", courseRef: "og-1", courseName: "Test Links", tee: "Blue", confirmedBy: "Cade", confirmedAt: "2026-10-16T19:00:00Z", lockedAt: null };

test("course pars come through scoringCourse(), with a tee's own par applied hole by hole", () => {
  assert.deepEqual(coursePars("og-1", course(), null), { ok: true, pars: PAR, tee: null });
  assert.deepEqual(coursePars("og-1", course(), { tee: "Blue", perHole: false, holeTees: {} }), { ok: true, pars: PAR, tee: "Blue" });
  const red = coursePars("og-1", course(), { tee: "Red", perHole: false, holeTees: {} });
  assert.ok(red.ok); assert.equal(red.pars[0], 5, "Red plays hole 1 as a par 5"); assert.deepEqual(red.pars.slice(1), PAR.slice(1));
  const mixed = coursePars("og-1", course(), { tee: "Blue", perHole: true, holeTees: { 1: "Red" } });
  assert.ok(mixed.ok); assert.equal(mixed.pars[0], 5); assert.equal(mixed.tee, "Red / Blue");
  assert.deepEqual(coursePars("og-1", course(), { tee: "Junior", perHole: false, holeTees: {} }), { ok: false, reason: "tee-par" }, "never stores a par 7");
  assert.deepEqual(coursePars("og-1", course(PAR.slice(0, 9)), null), { ok: false, reason: "no-scorecard" }, "a 9-hole card is not stretched to 18");
  assert.deepEqual(coursePars("og-1", course(PAR.map((p, i) => (i === 4 ? 2 : p))), null), { ok: false, reason: "no-scorecard" });
});

test("the saved snapshot is read strictly: anything off is no pars at all", () => {
  assert.deepEqual(tripRoundParsFromJson(SNAPSHOT), SNAPSHOT);
  for (const bad of [null, {}, { ...SNAPSHOT, pars: PAR.slice(0, 17) }, { ...SNAPSHOT, pars: PAR.map((p, i) => (i ? p : 7)) }, { ...SNAPSHOT, source: "guess" }, { ...SNAPSHOT, pars: PAR.map(String) }]) {
    assert.equal(tripRoundParsFromJson(bad), null, JSON.stringify(bad));
  }
  assert.equal(validTripPars(PAR), true); assert.equal(validTripPars([...PAR.slice(0, 17), 4.5]), false);
});

test("scoring JSON: pars + start holes when the database sends them; unchanged shape when it doesn't", () => {
  const base = { roundId: "r", roundNumber: 1, groups: [{ id: "g", groupNumber: 1, lockedAt: null, players: [] }], entries: [] };
  assert.deepEqual(tripScoringFromJson(base), base, "an older database: no pars key, no startHole");
  const withPars = tripScoringFromJson({ ...base, pars: SNAPSHOT, groups: [{ ...base.groups[0], startHole: 10 }] })!;
  assert.deepEqual(withPars.pars, SNAPSHOT); assert.equal(withPars.groups[0].startHole, 10);
  assert.equal(tripScoringFromJson({ ...base, pars: null })!.pars, null, "installed, nothing confirmed");
  assert.equal(tripScoringFromJson({ ...base, groups: [{ ...base.groups[0], startHole: 19 }] }), null, "a bad start hole rejects the answer");
  assert.deepEqual(startHolesOf([{ id: "a", startHole: 1 }, { id: "b", startHole: 10 }, { id: "c" }]), { b: 10 });
});

test("Highlights reads the saved snapshot: confirmed pars + start holes, or none with the reason", () => {
  const scoring = tripScoringFromJson({ roundId: "r", roundNumber: 1, pars: SNAPSHOT, groups: [{ id: "g", groupNumber: 1, lockedAt: null, startHole: 16, players: [] }], entries: [] })!;
  assert.deepEqual(detectionSetup(scoring), { pars: PAR, reason: null, startHoles: { g: 16 } });
  assert.equal(snapshotFromTripPars(tripRoundParsFromJson(SNAPSHOT))?.sourceRef, "og-1:Blue");
  assert.equal(snapshotFromTripPars(tripRoundParsFromJson({ ...SNAPSHOT, source: "manual", courseRef: null }))?.source, "organizer");
  const none = detectionSetup({ ...scoring, pars: null });
  assert.equal(none.pars, null); assert.match(none.reason!, /no par snapshot/);
  assert.deepEqual(parsForDetection(snapshotFromTripPars({ ...tripRoundParsFromJson(SNAPSHOT)!, confirmedAt: null })).pars, PAR, "pars typed before confirmation times still count");
  // The shared classifier on the saved pars: a 3 on the par-5 2nd is an eagle, a 2 there an albatross, a 1 an ace.
  assert.deepEqual([3, 2, 1].map((s) => classifyHole(s, PAR[1]).result), ["eagle", "albatross", "ace"]);
});

test("Trip Settings round slots line up with saved round numbers; the round's course + tee are found", () => {
  const basis: SetupBasis = { startDate: "2027-04-22", endDate: "2027-04-25", rounds: [] };
  const values = { dayCount: 4, arrivalShift: 0, golfOnArrival: false, golfOnDeparture: true, roundsPerDay: { 0: 1, 1: 2, 2: 0 },
    pickedCourses: { "0-0": { ref: "og-1", name: "Test Links", place: "Austin, TX", par: 72, settings: { tees: "Red", teeTime: "08:00", handicap: true } }, "1-1": { name: "Typed name only" } },
    roundTees: { "1-0": { tee: "Blue", perHole: false, holeTees: {} } } };
  const trip = { trip: { expected_traveler_count: 4 }, members: [] } as unknown as SavedGolfTrip;
  const plan = setupPlan(trip, basis, values);
  assert.deepEqual(roundSlotKeys(basis, values), ["0-0", "1-0", "1-1"]);
  assert.equal(plan.rounds.length, 3, "the same rounds setupPlan saves, in the same order");
  assert.deepEqual(roundCoursePick(basis, values, 1), { ref: "og-1", name: "Test Links", tees: { tee: "Red", perHole: false, holeTees: {} } });
  assert.equal(roundCoursePick(basis, values, 2), null, "no course picked for round 2");
  assert.equal(roundCoursePick(basis, values, 3), null, "a typed name without a search handle can't load pars");
  assert.equal(roundCoursePick(basis, values, 9), null);
});

test("the pars form never fills a blank: every hole 3–6, or the holes to fix", () => {
  assert.deepEqual(parsFromForm(PAR.map(String)), { ok: true, pars: PAR });
  assert.deepEqual(parsFromForm(PAR.map((p, i) => (i === 3 ? "" : i === 9 ? "7" : String(p)))), { ok: false, error: "Enter a par of 3–6 for holes 4, 10." });
  assert.deepEqual(parsFromForm(PAR.slice(0, 17)), { ok: false, error: "Enter the par for all 18 holes." });
  assert.equal(parsFromForm(PAR.map((p) => p + 0.5)).ok, false);
});
