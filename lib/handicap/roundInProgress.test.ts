import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deleteRoundInProgress,
  handicapHoleKey,
  handicapHolesKey,
  handicapWizardKey,
  parseRoundInProgress,
  readRoundInProgressRaw,
  runningTotals,
} from "./roundInProgress.ts";

const holes = [
  { number: 1, par: 4, yards: 400 },
  { number: 2, par: 3, yards: 170 },
  { number: 3, par: 5, yards: 520 },
];

const setup = {
  submissionId: "abc",
  course: { id: "c1", name: "Pebble Beach", city: "Pebble Beach", state: "CA", teeSets: [] },
  teeSet: { id: "t1", name: "Blue", rating: 72.1, slope: 131, holes },
  datePlayed: "2026-09-07",
  teeTime: "",
};

const wizardRaw = JSON.stringify({ version: 1, value: { step: "holes", setup } });
const draftRaw = JSON.stringify({ version: 1, value: { 1: { score: "5" }, 2: { score: "6" }, 3: { score: "9" } } });

function fakeStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  return { store, getItem: (key: string) => store.get(key) ?? null, removeItem: (key: string) => { store.delete(key); } };
}

test("storage keys are built from the player and round so the wizard, hole entry and home page all agree", () => {
  assert.equal(handicapWizardKey("cade"), "handicap-wizard:cade");
  assert.equal(handicapHolesKey("cade", "abc"), "handicap-holes:cade:abc");
  assert.equal(handicapHoleKey("cade", "abc"), "handicap-holes:cade:abc:hole");
});

test("runningTotals only counts holes you've moved past: 0 on hole 1, then each hole joins once you go to the next", () => {
  const draft = { 1: { score: "5" }, 2: { score: "6" }, 3: { score: "9" } };
  assert.deepEqual(runningTotals(holes, draft, 1), { totalScore: 0, toPar: 0 });
  assert.deepEqual(runningTotals(holes, draft, 2), { totalScore: 5, toPar: 1 });
  assert.deepEqual(runningTotals(holes, draft, 3), { totalScore: 11, toPar: 4 });
  assert.deepEqual(runningTotals(holes, {}, 3), { totalScore: 0, toPar: 0 });
});

test("a saved round in progress reports course, tee, rating/slope, date, current hole, and to-par through the holes already played", () => {
  const round = parseRoundInProgress({ wizard: wizardRaw, draft: draftRaw, hole: JSON.stringify({ version: 1, value: 3 }) });
  assert.deepEqual(round, { submissionId: "abc", courseName: "Pebble Beach", teeName: "Blue", rating: 72.1, slope: 131, datePlayed: "2026-09-07", hole: 3, toPar: 4 });
});

test("a round started but not yet touched has no draft or hole saved, and reads as even par on hole 1", () => {
  const round = parseRoundInProgress({ wizard: wizardRaw, draft: null, hole: null });
  assert.equal(round?.hole, 1);
  assert.equal(round?.toPar, 0);
});

test("a saved hole outside the course is clamped, and garbage falls back to hole 1", () => {
  assert.equal(parseRoundInProgress({ wizard: wizardRaw, draft: null, hole: JSON.stringify({ version: 1, value: 99 }) })?.hole, 3);
  assert.equal(parseRoundInProgress({ wizard: wizardRaw, draft: null, hole: JSON.stringify({ version: 1, value: "abc" }) })?.hole, 1);
  assert.equal(parseRoundInProgress({ wizard: wizardRaw, draft: null, hole: "not json" })?.hole, 1);
});

test("nothing is in progress unless the wizard is on the hole-entry step with a valid setup", () => {
  assert.equal(parseRoundInProgress({ wizard: null, draft: null, hole: null }), null);
  assert.equal(parseRoundInProgress({ wizard: "not json", draft: null, hole: null }), null);
  assert.equal(parseRoundInProgress({ wizard: JSON.stringify({ version: 1, value: { step: "course" } }), draft: null, hole: null }), null);
  assert.equal(parseRoundInProgress({ wizard: JSON.stringify({ version: 1, value: { step: "holes", setup: { submissionId: "abc" } } }), draft: null, hole: null }), null);
});

test("deleting a round in progress removes the wizard state, the hole draft, and the saved hole", () => {
  const storage = fakeStorage({
    "handicap-wizard:cade": wizardRaw,
    "handicap-holes:cade:abc": draftRaw,
    "handicap-holes:cade:abc:hole": JSON.stringify({ version: 1, value: 2 }),
    "handicap-wizard:someone-else": "keep me",
  });
  assert.equal(parseRoundInProgress(readRoundInProgressRaw(storage, "cade"))?.hole, 2);
  deleteRoundInProgress(storage, "cade");
  assert.deepEqual([...storage.store.keys()], ["handicap-wizard:someone-else"]);
  assert.equal(parseRoundInProgress(readRoundInProgressRaw(storage, "cade")), null);
});
