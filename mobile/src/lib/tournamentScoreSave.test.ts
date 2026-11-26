import { test } from "node:test";
import assert from "node:assert/strict";
import { saveTournamentScore } from "./tournamentScoreSave.ts";

test("an uncertain save keeps scoring blocked without assuming a write failed", async () => {
  let reads = 0;
  const result = await saveTournamentScore(async () => ({ ok: false, error: "No connection." }), async () => { reads++; return true; });
  assert.equal(result.saved, false); assert.equal(result.needsRefresh, true); assert.match(result.message, /may have reached/); assert.equal(reads, 0);
});
test("a confirmed save still requires a successful read before further edits", async () => {
  const failedRead = await saveTournamentScore(async () => ({ ok: true }), async () => false);
  assert.equal(failedRead.saved, true); assert.equal(failedRead.needsRefresh, true);
  const current = await saveTournamentScore(async () => ({ ok: true }), async () => true);
  assert.equal(current.saved, true); assert.equal(current.needsRefresh, false);
});
test("thrown network or refresh errors also block further writes", async () => {
  const writeError = await saveTournamentScore(async () => { throw new Error("offline"); }, async () => true);
  assert.equal(writeError.saved, false); assert.equal(writeError.needsRefresh, true);
  const readError = await saveTournamentScore(async () => ({ ok: true }), async () => { throw new Error("offline"); });
  assert.equal(readError.saved, true); assert.equal(readError.needsRefresh, true);
});
