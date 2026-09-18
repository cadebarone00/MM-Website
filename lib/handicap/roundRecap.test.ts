import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecapRows, type RecapHoleDraftEntry } from "./roundRecap.ts";
import type { HandicapCourseTeeSet } from "./types.ts";

const teeSet: HandicapCourseTeeSet = {
  id: "t1",
  name: "Blue",
  rating: 72.1,
  slope: 128,
  holes: [
    { number: 1, par: 4, yards: 410 },
    { number: 2, par: 3, yards: 160 },
    { number: 3, par: 5, yards: 540 },
  ],
};

function draftWith(overrides: Record<number, Partial<RecapHoleDraftEntry>>): Record<number, RecapHoleDraftEntry> {
  const base: RecapHoleDraftEntry = { score: "4", putts: "2", fir: true, gir: true, firDirection: null, girDirection: null };
  return { 1: { ...base, ...overrides[1] }, 2: { ...base, score: "3", ...overrides[2] }, 3: { ...base, score: "5", ...overrides[3] } };
}

test("a hole is not entered until putts is actually set, even though score already has a par default", () => {
  const rows = buildRecapRows(teeSet, draftWith({ 1: { putts: "" } }));
  assert.deepEqual(rows[0], { hole: 1, par: 4, yards: 410, score: null, putts: null, fir: null, firDirection: null, gir: null, girDirection: null });
});

test("a hole is not entered until GIR is set (hit, or a miss direction)", () => {
  const rows = buildRecapRows(teeSet, draftWith({ 1: { gir: false, girDirection: null } }));
  assert.equal(rows[0].score, null);
});

test("a non-par-3 hole is not entered until fairway is set, but a par-3 doesn't need it", () => {
  const missingFairway = draftWith({ 1: { fir: false, firDirection: null }, 2: { fir: false, firDirection: null } });
  const rows = buildRecapRows(teeSet, missingFairway);
  assert.equal(rows[0].score, null, "hole 1 (par 4) still needs a fairway result");
  assert.equal(rows[1].score, 3, "hole 2 (par 3) doesn't need one");
});

test("a fully entered hole reports its real score/putts/GIR/fairway", () => {
  const rows = buildRecapRows(teeSet, draftWith({ 1: { fir: false, firDirection: "left", gir: false, girDirection: "short" } }));
  assert.deepEqual(rows[0], { hole: 1, par: 4, yards: 410, score: 4, putts: 2, fir: false, firDirection: "left", gir: false, girDirection: "short" });
});

test("an entered par-3 hole reports fairway as not applicable instead of the raw default", () => {
  const rows = buildRecapRows(teeSet, draftWith({}));
  const hole2 = rows.find((row) => row.hole === 2)!;
  assert.equal(hole2.fir, null);
  assert.equal(hole2.firDirection, null);
});
