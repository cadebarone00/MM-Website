import { test } from "node:test";
import assert from "node:assert/strict";
import { getAllPlayerRows } from "./allPlayers.ts";

// No Supabase credentials in the test environment, so
// createSupabaseServiceRoleClient() throws before any network call — same
// documented limitation activeSeasonOverlay.test.ts already has for its
// own Supabase-backed helpers.
test("getAllPlayerRows rejects with no Supabase configuration in the test environment", async () => {
  await assert.rejects(() => getAllPlayerRows());
});
