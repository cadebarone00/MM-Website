import { test } from "node:test";
import assert from "node:assert/strict";
import { isPastLeaderboardSwitchover, nextTournament } from "./index.ts";

test("isPastLeaderboardSwitchover is false before January 1 of the next tournament's year", () => {
  assert.equal(isPastLeaderboardSwitchover(new Date(`${nextTournament.year - 1}-12-31T23:59:59`)), false);
});

test("isPastLeaderboardSwitchover is true exactly at January 1 of the next tournament's year", () => {
  assert.equal(isPastLeaderboardSwitchover(new Date(`${nextTournament.year}-01-01T00:00:00`)), true);
});

test("isPastLeaderboardSwitchover is true well after the switchover date", () => {
  assert.equal(isPastLeaderboardSwitchover(new Date(`${nextTournament.year}-06-01T00:00:00`)), true);
});
