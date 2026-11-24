import test from "node:test";
import assert from "node:assert/strict";
import { tripScoringEngine } from "./tripScoringEngine.ts";
import { memoryQueueStorage } from "../../../lib/platform/scoringSync.ts";

const scope = { profileId: "p", tripId: "t", roundNumber: 1 };
const change = { ...scope, groupId: "g", scoredProfileId: "p", kind: "own" as const, entry: { hole: 1, strokes: 4 } };
test("offline edit is restored and sent once when reconnected", async () => {
  const storage = memoryQueueStorage(); let calls = 0; let online = false;
  const options = { scope, storage, newId: () => "op", now: () => "2026-11-24T00:00:00Z", send: async (batch: { ops: { opId: string }[] }) => { calls++; return online ? { ok: true as const, results: batch.ops.map(op => ({ opId: op.opId, status: "applied" as const, version: 1 })), scoring: null } : { ok: false as const, reason: "offline" as const }; } };
  const first = tripScoringEngine(options); await first.load(); await first.edit(change, 0); await first.sync();
  assert.equal(first.status(), "pending");
  const reopened = tripScoringEngine(options); await reopened.load(); assert.equal(reopened.ops().length, 1);
  online = true; await reopened.sync(); assert.equal(reopened.status(), "synced"); assert.equal(calls, 2);
});
test("a failed device write blocks sending unsaved scores", async () => {
  let calls = 0;
  const engine = tripScoringEngine({ scope, storage: { async load() { return []; }, async replace() { throw new Error("disk full"); } }, send: async () => { calls++; return { ok: false, reason: "offline" }; }, newId: () => "op", now: () => "2026-11-24T00:00:00Z" });
  await engine.load(); await assert.rejects(() => engine.edit(change, 0)); await assert.rejects(() => engine.sync()); assert.equal(calls, 0); assert.equal(engine.storageFailed(), true);
});
test("server conflict is preserved across reload and resolved explicitly", async () => {
  const storage = memoryQueueStorage(); let calls = 0;
  const engine = tripScoringEngine({ scope, storage, newId: () => `op${++calls}`, now: () => "2026-11-24T00:00:00Z", send: async batch => ({ ok: true, results: batch.ops.map(op => ({ opId: op.opId, status: "conflict", version: 2, server: { hole: 1, strokes: 5 } })), scoring: null }) });
  await engine.load(); await engine.edit(change, 0); await engine.sync();
  assert.equal(engine.status(), "conflict");
  const reopened = tripScoringEngine({ scope, storage, newId: () => "new", now: () => "2026-11-24T00:00:00Z", send: async () => ({ ok: false, reason: "offline" }) });
  await reopened.load(); assert.equal(reopened.status(), "conflict");
  await reopened.resolve(reopened.ops()[0].key, "saved"); assert.equal(reopened.status(), "synced"); assert.equal(reopened.ops().length, 0);
});
