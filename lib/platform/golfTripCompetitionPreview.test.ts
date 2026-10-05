import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLF_TRIP_COMPETITION_PREVIEW, addCompetitionRound, removeCompetitionRound } from "./golfTripCompetitionPreview";

test("a round added between rounds 3 and 4 becomes round 4 and later rounds move up", () => {
  const rounds = addCompetitionRound(GOLF_TRIP_COMPETITION_PREVIEW, "2027-04-23", "new");
  assert.deepEqual(rounds.map(round => [round.id, round.number]), [["round-1", 1], ["round-2", 2], ["round-3", 3], ["new", 4], ["round-4", 5]]);
  assert.equal(rounds[3].status, "scheduled");
});

test("adding to the first and last day keeps rounds numbered 1..n in day order", () => {
  const first = addCompetitionRound(GOLF_TRIP_COMPETITION_PREVIEW, "2027-04-22", "a");
  assert.deepEqual(first.map(round => round.id), ["round-1", "a", "round-2", "round-3", "round-4"]);
  const last = addCompetitionRound(first, "2027-04-24", "b");
  assert.deepEqual(last.map(round => round.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(last.at(-1)!.id, "b");
});

test("adding to an empty competition makes Round 1", () => {
  assert.deepEqual(addCompetitionRound([], "2027-04-22", "a").map(round => round.number), [1]);
});

test("deleting round 3 moves round 4 down to 3", () => {
  const rounds = removeCompetitionRound(GOLF_TRIP_COMPETITION_PREVIEW, "round-3");
  assert.deepEqual(rounds.map(round => [round.id, round.number]), [["round-1", 1], ["round-2", 2], ["round-4", 3]]);
});

test("a started round can't be deleted", () => {
  assert.equal(removeCompetitionRound(GOLF_TRIP_COMPETITION_PREVIEW, "round-1").length, 4);
});
