import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultRoundComp, playersLeftOver, pointsPerMatchTotal, roundMatches, roundPointsAvailable } from "./roundCompetition.ts";

test("singles match play: one match per two players, one point each", () => {
  const round = defaultRoundComp(8);
  assert.equal(roundMatches(round), 4);
  assert.equal(roundPointsAvailable(round), 4);
  assert.equal(playersLeftOver(round), 0);
});

test("two-player sides need four players per match; extras are left over", () => {
  const round = { ...defaultRoundComp(10), format: "Fourball" as const };
  assert.equal(roundMatches(round), 2);
  assert.equal(playersLeftOver(round), 2);
});

test("Nassau triples what each match pays", () => {
  const round = { ...defaultRoundComp(8), nassau: true, pointsPerMatch: 0.5 };
  assert.equal(pointsPerMatchTotal(round), 1.5);
  assert.equal(roundPointsAvailable(round), 6);
});

test("stroke play has no matches and no match points", () => {
  const round = { ...defaultRoundComp(8), matchType: "Stroke Play" as const };
  assert.equal(roundMatches(round), 0);
  assert.equal(roundPointsAvailable(round), 0);
  assert.equal(playersLeftOver(round), 0);
});

test("empty or tiny fields give zero matches", () => {
  assert.equal(roundMatches(defaultRoundComp(0)), 0);
  assert.equal(roundMatches(defaultRoundComp(1)), 0);
  assert.equal(playersLeftOver(defaultRoundComp(1)), 1);
});
