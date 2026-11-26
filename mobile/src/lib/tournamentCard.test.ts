import { test } from "node:test";
import assert from "node:assert/strict";
import { tournamentEntryScope, tournamentHoleStatus } from "./tournamentCard.ts";
test("a missing score cannot be marked as an attestation match", () => {
  assert.equal(tournamentHoleStatus(null, null, true), "empty");
  assert.equal(tournamentHoleStatus(4, null, true), "waiting");
  assert.equal(tournamentHoleStatus(null, 4, true), "waiting");
  assert.equal(tournamentHoleStatus(4, 4, true), "match");
  assert.equal(tournamentHoleStatus(4, 5, true), "mismatch");
  assert.equal(tournamentHoleStatus(4, null, false), "recorded");
});
test("score entry scope changes when its recipient, round or hole changes", () => {
  const original = tournamentEntryScope("event", 1, 2, "attest", "player-a");
  assert.notEqual(original, tournamentEntryScope("event", 1, 2, "attest", "player-b"));
  assert.notEqual(original, tournamentEntryScope("event", 2, 2, "attest", "player-a"));
  assert.notEqual(original, tournamentEntryScope("event", 1, 3, "attest", "player-a"));
  assert.notEqual(original, tournamentEntryScope("event", 1, 2, "own", "player-a"));
});
