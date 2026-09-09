import { test } from "node:test";
import assert from "node:assert/strict";
import { handicapHistory } from "./history.ts";
import type { ArchivedHandicapRound, HandicapRoundSummary } from "./types";

const archived: ArchivedHandicapRound[] = [1, 2].map((round) => ({
  id: `archive-${round}`, tournamentSlug: "2026-palm-springs",
  tournamentLabel: "The Maroon Masters 2026", tournamentDate: "2026-01-03",
  round, courseName: "Palmer", format: "Fourball", totalScore: 75, holesPlayed: 18,
}));
const submitted: HandicapRoundSummary[] = [{
  id: "personal", courseName: "Other course", teeSetName: "Blue", rating: 72,
  slope: 113, datePlayed: "2026-09-09", teeTime: null, totalScore: 80, differential: 8,
}];

test("every archived round appears in both sections, personal scores only in Overall", () => {
  const masters = handicapHistory(archived, submitted, "maroon-masters");
  const overall = handicapHistory(archived, submitted, "overall");
  assert.deepEqual(masters.map((entry) => entry.round.id), ["archive-2", "archive-1"]);
  assert.deepEqual(overall.map((entry) => entry.round.id), ["personal", "archive-2", "archive-1"]);
  assert.ok(masters.every((entry) => entry.source === "archive"));
  assert.equal(overall[0].source, "submitted");
  assert.equal(archived[0].round, 1, "sorting does not mutate the archive");
});

test("players without archived rounds still see personal scores only in Overall", () => {
  assert.deepEqual(handicapHistory([], submitted, "maroon-masters"), []);
  assert.equal(handicapHistory([], submitted, "overall").length, 1);
  assert.deepEqual(handicapHistory([], [], "overall"), []);
});
