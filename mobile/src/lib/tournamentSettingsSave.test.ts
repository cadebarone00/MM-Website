import { test } from "node:test";
import assert from "node:assert/strict";
import { saveTournamentSettings } from "./tournamentSettingsSave.ts";

test("uncertain settings writes require refresh without retrying", async () => {
  let writes = 0; let reads = 0;
  const result = await saveTournamentSettings(async () => { writes++; return { ok: false, error: "Offline." }; }, async () => { reads++; return true; });
  assert.equal(writes, 1); assert.equal(reads, 0); assert.equal(result.needsRefresh, true); assert.match(result.message, /may have changed/);
});
test("successful writes require a successful follow-up read", async () => {
  assert.equal((await saveTournamentSettings(async () => ({ ok: true }), async () => false)).needsRefresh, true);
  assert.equal((await saveTournamentSettings(async () => ({ ok: true }), async () => true)).needsRefresh, false);
});
test("thrown write and refresh errors require recovery", async () => {
  assert.equal((await saveTournamentSettings(async () => { throw Error("offline"); }, async () => true)).needsRefresh, true);
  assert.equal((await saveTournamentSettings(async () => ({ ok: true }), async () => { throw Error("offline"); })).needsRefresh, true);
});
