import test from "node:test";
import assert from "node:assert/strict";
import type { QueuedOp } from "../../../lib/platform/scoringQueue.ts";
import { tripScoringTransport } from "./tripScoringTransport.ts";

const op: QueuedOp = { profileId: "p", tripId: "t", roundNumber: 1, key: "key", opId: "op", groupId: "g", scoredProfileId: "p", kind: "own", entry: { hole: 1, strokes: 4 }, baseVersion: 0, supersedes: [], clientUpdatedAt: "2026-11-24T00:00:00Z", status: "pending" };
const batch = { groupId: "g", scoredProfileId: "p", ops: [op] };
test("sends scoped operations and accepts an acknowledged score", async () => {
  let sent: unknown;
  const send = tripScoringTransport("t", "p", async (_path, init) => { sent = init.body; return { status: 200, body: { ok: true, results: [{ opId: "op", status: "applied", version: 1 }], scoring: null } }; });
  assert.equal((await send(batch)).ok, true);
  assert.equal((sent as { expectedProfileId: string }).expectedProfileId, "p");
});
test("never sends another account's queue or accepts an incomplete response", async () => {
  let calls = 0;
  const send = tripScoringTransport("t", "other", async () => { calls++; return { status: 200, body: {} }; });
  assert.deepEqual(await send(batch), { ok: false, reason: "wrong-account" }); assert.equal(calls, 0);
  const incomplete = tripScoringTransport("t", "p", async () => ({ status: 200, body: { ok: true, results: [] } }));
  assert.deepEqual(await incomplete(batch), { ok: false, reason: "error" });
});
test("preserves pending work on offline and account failures", async () => {
  for (const [status, body, reason] of [[0, null, "offline"], [401, null, "signed-out"], [409, { reason: "wrong-account" }, "wrong-account"], [403, { reason: "locked" }, "locked"]] as const) {
    const send = tripScoringTransport("t", "p", async () => ({ status, body }));
    assert.deepEqual(await send(batch), { ok: false, reason });
  }
});
