import { test } from "node:test";
import assert from "node:assert/strict";
import { tripRoundMatches } from "./tripRoundMatches.ts";

const basis = { startDate: "2027-04-22", endDate: "2027-04-24", rounds: [{ roundNumber: 1, dayNumber: 1, playDate: "2027-04-22", courseName: "Pinehurst No. 2" }] } as never;
const places = ["p0", "p1", null, "p3", "p4"];

test("a match-play round's matches from the setup, places → accounts", () => {
  const values = { dayCount: 3, compFormats: { "0-0": { players: 4, pointsPerMatch: 1, matchType: "Match Play", nassau: false, scoring: "Gross", format: "Fourball" } },
    teeMatches: { "0-0": { 1: { a: [3, 4], b: [0, 1] }, 0: { a: [0], b: [2] } } } };
  assert.deepEqual(tripRoundMatches(values, basis, 1, places), [{ index: 1, format: "fourball", a: ["p3", "p4"], b: ["p0", "p1"] }], "a side with no account is skipped");
});

test("stroke-play rounds and unknown rounds have no matches; singles is the default format", () => {
  assert.deepEqual(tripRoundMatches({ dayCount: 3, compFormats: { "0-0": { players: 2, pointsPerMatch: 1, matchType: "Stroke Play", nassau: false, scoring: "Gross", format: "Singles" } }, teeMatches: { "0-0": { 0: { a: [0], b: [1] } } } }, basis, 1, places), []);
  assert.deepEqual(tripRoundMatches({ dayCount: 3 }, basis, 9, places), []);
  assert.deepEqual(tripRoundMatches({ dayCount: 3, teeMatches: { "0-0": { 0: { a: [0], b: [1] } } } }, basis, 1, places), [{ index: 0, format: "singles", a: ["p0"], b: ["p1"] }]);
});
