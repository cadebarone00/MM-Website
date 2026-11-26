import { test } from "node:test";
import assert from "node:assert/strict";
import { addTournamentRound } from "./tournamentAddRoundSave.ts";
test("an uncertain round write is not retried and requires a review", async () => {
  let writes = 0; let reads = 0;
  const result = await addTournamentRound(async () => { writes++; return { ok: false, error: "Offline." }; }, async () => { reads++; return true; });
  assert.equal(writes, 1); assert.equal(reads, 0); assert.equal(result.saved, false); assert.equal(result.needsRefresh, true); assert.match(result.message, /may have been added/);
});
test("confirmed round saves require a successful follow-up read", async () => {
  const result = await addTournamentRound(async () => ({ ok: true }), async () => false);
  assert.equal(result.saved, true); assert.equal(result.needsRefresh, true);
  assert.equal((await addTournamentRound(async () => ({ ok: true }), async () => true)).needsRefresh, false);
});
test("thrown errors are handled as uncertain writes or stale reads", async () => {
  assert.equal((await addTournamentRound(async () => { throw Error("offline"); }, async () => true)).needsRefresh, true);
  const result = await addTournamentRound(async () => ({ ok: true }), async () => { throw Error("offline"); });
  assert.equal(result.saved, true); assert.equal(result.needsRefresh, true);
});
