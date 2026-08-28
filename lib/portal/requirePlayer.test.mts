// lib/portal/requirePlayer.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { playerProfiles } from "@/lib/data/players";

// requirePlayer() itself can't be exercised end-to-end here (it calls
// createSupabaseServerClient(), whose cookies() throws outside a real Next.js
// request lifecycle — see route.test.mts for the same limitation). What we
// can and must verify without a live request is the data-layer assumption
// requirePlayer.ts's `playerFirstName: playerProfile.id` line depends on:
// Python's /player-whoami keys players by bare first name, so every
// PlayerProfile.id must equal the first word of that player's fullName. If a
// future roster edit breaks that invariant, requirePlayer would silently
// start sending the wrong identity to the Python API again.
test("every PlayerProfile.id matches the first word of its fullName (the value Python's /player-whoami expects)", () => {
  assert.ok(playerProfiles.length > 0, "expected at least one player profile to check");
  for (const profile of playerProfiles) {
    const expectedFirstName = profile.fullName.split(" ")[0];
    assert.equal(
      profile.id,
      expectedFirstName,
      `PlayerProfile.id for "${profile.fullName}" was "${profile.id}", expected "${expectedFirstName}"`
    );
  }
});
