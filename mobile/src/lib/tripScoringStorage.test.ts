import test from "node:test";
import assert from "node:assert/strict";
import { tripScoringStorage } from "./tripScoringStorage.ts";
import type { QueueScope, QueuedOp } from "../../../lib/platform/scoringQueue.ts";

const scope: QueueScope = { profileId: "one", tripId: "trip", roundNumber: 1 };
const op = { ...scope, key: "key", opId: "op", groupId: "group", scoredProfileId: "one", kind: "own", entry: { hole: 1, strokes: 4 }, baseVersion: 0, supersedes: [], clientUpdatedAt: "2026-11-24T00:00:00Z", status: "pending" } satisfies QueuedOp;
function memory() { const map = new Map<string, string>(); return { async getItem(key: string) { return map.get(key) ?? null; }, async setItem(key: string, value: string) { map.set(key, value); } }; }
test("scores survive reopening and are isolated by account, trip and round", async () => {
  const store = memory(), first = tripScoringStorage(store);
  await first.replace(scope, [op]);
  const reopened = tripScoringStorage(store);
  assert.deepEqual(await reopened.load(scope), [op]);
  for (const other of [{ ...scope, profileId: "two" }, { ...scope, tripId: "other" }, { ...scope, roundNumber: 2 }]) assert.deepEqual(await reopened.load(other), []);
  await assert.rejects(() => reopened.replace({ ...scope, profileId: "two" }, [op]));
});
test("storage failures are surfaced", async () => {
  const queue = tripScoringStorage({ async getItem() { throw new Error("unavailable"); }, async setItem() { throw new Error("unavailable"); } });
  await assert.rejects(() => queue.load(scope));
  await assert.rejects(() => queue.replace(scope, [op]));
});
