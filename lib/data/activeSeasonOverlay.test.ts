import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDateLabel, getNextTournament } from "./activeSeasonOverlay.ts";

test("formatDateLabel formats a same-month range", () => {
  assert.equal(formatDateLabel("2027-01-06", "2027-01-09"), "January 6–9, 2027");
});

test("formatDateLabel formats a cross-month range", () => {
  assert.equal(formatDateLabel("2026-12-28", "2027-01-02"), "December 28, 2026 – January 2, 2027");
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
