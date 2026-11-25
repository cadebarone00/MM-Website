import { test } from "node:test";
import assert from "node:assert/strict";
import { saveTournamentTeeSheet } from "./tournamentTeeSave.ts";
test("an uncertain tee-sheet write preserves the draft and requires refresh", async () => {
  let reads = 0;
  const result = await saveTournamentTeeSheet(async () => ({ ok: false, error: "No connection." }), async () => { reads++; return true; });
  assert.equal(result.saved, false); assert.equal(result.needsRefresh, true); assert.equal(reads, 0); assert.match(result.message, /may have reached/);
});
test("a successful tee-sheet write still requires a successful read", async () => {
  const stale = await saveTournamentTeeSheet(async () => ({ ok: true }), async () => false);
  assert.equal(stale.saved, true); assert.equal(stale.needsRefresh, true);
  const current = await saveTournamentTeeSheet(async () => ({ ok: true }), async () => true);
  assert.equal(current.saved, true); assert.equal(current.needsRefresh, false);
});
test("thrown errors are treated as uncertain writes or reads", async () => {
  assert.equal((await saveTournamentTeeSheet(async () => { throw Error("offline"); }, async () => true)).needsRefresh, true);
  const result = await saveTournamentTeeSheet(async () => ({ ok: true }), async () => { throw Error("offline"); });
  assert.equal(result.saved, true); assert.equal(result.needsRefresh, true);
});
