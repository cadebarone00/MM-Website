// lib/handicap/archiveIndex.test.ts
// Characterization tests for already-implemented, previously-untested logic
// that this round of work makes load-bearing for the first time (wiring it
// into getHandicapSummaryForPlayer's actual index calculation).
import { test } from "node:test";
import assert from "node:assert/strict";
import { archivedDifferential, combinedHandicapIndexes } from "./archiveIndex.ts";
import type { ArchivedHandicapRound, ArchivedTeeSetup, HandicapRoundSummary } from "./types.ts";
import { calculateDifferential } from "./whs.ts";

function validTee(overrides: Partial<ArchivedTeeSetup> = {}): ArchivedTeeSetup {
  return { courseId: "course-1", teeSetId: "blue", teeSetName: "Blue", rating: 72.4, slope: 130, holes: [], ...overrides };
}

function validRound(overrides: Partial<ArchivedHandicapRound> = {}): ArchivedHandicapRound {
  return {
    id: "round-1",
    tournamentSlug: "2025-danzante",
    tournamentLabel: "2025 Danzante",
    tournamentDate: "2025-06-12",
    round: 1,
    courseName: "Danzante Bay",
    format: "Singles",
    totalScore: 90,
    holesPlayed: 18,
    datePlayed: "2025-06-14",
    teeSetup: validTee(),
    ...overrides,
  };
}

test("archivedDifferential computes the WHS differential for a well-formed singles round", () => {
  const result = archivedDifferential(validRound());
  assert.equal(result, calculateDifferential(90, 72.4, 130));
});

test("archivedDifferential accepts a Fourball round (individual score)", () => {
  const result = archivedDifferential(validRound({ format: "Fourball" }));
  assert.notEqual(result, null);
});

test("archivedDifferential rejects a team-score format (Foursome)", () => {
  assert.equal(archivedDifferential(validRound({ format: "Foursome" })), null);
});

test("archivedDifferential rejects an incomplete round (not all 18 holes played)", () => {
  assert.equal(archivedDifferential(validRound({ holesPlayed: 12 })), null);
});

test("archivedDifferential rejects a round with no total score", () => {
  assert.equal(archivedDifferential(validRound({ totalScore: null })), null);
});

test("archivedDifferential rejects a round with no date played", () => {
  assert.equal(archivedDifferential(validRound({ datePlayed: null })), null);
});

test("archivedDifferential rejects a round with no tee setup assigned", () => {
  assert.equal(archivedDifferential(validRound({ teeSetup: null })), null);
});

test("archivedDifferential rejects a tee setup with slope out of the valid 55-155 range", () => {
  assert.equal(archivedDifferential(validRound({ teeSetup: validTee({ slope: 200 }) })), null);
});

test("archivedDifferential rejects a mixed-tee round (holes played from more than one tee set)", () => {
  const teeSetup = validTee({ holeTeeSetIds: { "1": "blue", "2": "white" } });
  assert.equal(archivedDifferential(validRound({ teeSetup })), null);
});

test("archivedDifferential accepts a uniform-tee round where holeTeeSetIds all match the base tee", () => {
  const teeSetup = validTee({ holeTeeSetIds: { "1": "blue", "2": "blue" } });
  assert.notEqual(archivedDifferential(validRound({ teeSetup })), null);
});

test("combinedHandicapIndexes computes maroonMastersIndex from eligible archived rounds only", () => {
  const archived = [
    validRound({ id: "r1", totalScore: 90, datePlayed: "2025-06-14" }),
    validRound({ id: "r2", totalScore: 92, datePlayed: "2025-06-13" }),
    validRound({ id: "r3", totalScore: 94, datePlayed: "2025-06-12" }),
    validRound({ id: "r4", totalScore: 100, datePlayed: "2025-06-11", teeSetup: null }), // ineligible: no tee setup
  ];
  const result = combinedHandicapIndexes([], archived);
  // r1-r3 eligible (3 rounds -> lowest 1, -2.0 adjustment); r4 excluded.
  const diffs = [90, 92, 94].map((score) => calculateDifferential(score, 72.4, 130));
  const expected = Math.round((Math.min(...diffs) - 2.0) * 10) / 10;
  assert.equal(result.maroonMastersIndex, expected);
});

test("combinedHandicapIndexes blends submitted and archived rounds into the overall index", () => {
  const submitted: HandicapRoundSummary[] = [
    { id: "s1", courseId: "c1", courseName: "Some Course", teeSetName: "Blue", rating: 71.0, slope: 120, datePlayed: "2025-06-15", teeTime: null, totalScore: 85, differential: calculateDifferential(85, 71.0, 120) },
    { id: "s2", courseId: "c1", courseName: "Some Course", teeSetName: "Blue", rating: 71.0, slope: 120, datePlayed: "2025-06-16", teeTime: null, totalScore: 88, differential: calculateDifferential(88, 71.0, 120) },
  ];
  const archived = [
    validRound({ id: "r1", totalScore: 90, datePlayed: "2025-06-14" }),
    validRound({ id: "r2", totalScore: 95, datePlayed: "2025-06-13" }),
  ];
  const result = combinedHandicapIndexes(submitted, archived);
  // Overall pools all 4 rounds; Maroon Masters pools only the 2 archived ones (below the 3-round minimum -> null).
  assert.notEqual(result.index, null);
  assert.equal(result.maroonMastersIndex, null);
});

test("combinedHandicapIndexes returns null indexes when there are no eligible rounds at all", () => {
  const result = combinedHandicapIndexes([], []);
  assert.deepEqual(result, { index: null, maroonMastersIndex: null, lowIndex: null });
});
