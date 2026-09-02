import { test } from "node:test";
import assert from "node:assert/strict";
import { isPastLeaderboardSwitchover, nextTournament, getNextTournament } from "./index.ts";

test("isPastLeaderboardSwitchover is false before January 1 of the next tournament's year", () => {
  assert.equal(isPastLeaderboardSwitchover(new Date(`${nextTournament.year - 1}-12-31T23:59:59`)), false);
});

test("isPastLeaderboardSwitchover is true exactly at January 1 of the next tournament's year", () => {
  assert.equal(isPastLeaderboardSwitchover(new Date(`${nextTournament.year}-01-01T00:00:00`)), true);
});

test("isPastLeaderboardSwitchover is true well after the switchover date", () => {
  assert.equal(isPastLeaderboardSwitchover(new Date(`${nextTournament.year}-06-01T00:00:00`)), true);
});

// No Supabase credentials in the test environment, so
// createSupabaseServiceRoleClient() throws before any network call —
// this documents that getNextTournament() propagates that rather than
// silently swallowing it. Real behavior (falling back to the static
// nextTournament when no override row exists) is exercised by hand in
// Task 4's manual walkthrough, same limitation every other Supabase-backed
// route/helper in this codebase already has in its own tests.
test("getNextTournament rejects with no Supabase configuration in the test environment", async () => {
  await assert.rejects(() => getNextTournament());
});
