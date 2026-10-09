import { test } from "node:test";
import assert from "node:assert/strict";
import { applyResults, batches, enqueue, queueStatus, resolveConflict, type QueuedOp } from "./scoringQueue.ts";
import { createScoringSync, memoryQueueStorage, type SendBatch } from "./scoringSync.ts";

const scope = { profileId: "me", tripId: "t1", roundNumber: 1 };
let n = 0;
const newId = () => `op${++n}`;
const now = () => "2027-04-11T15:00:00.000Z";
const change = (hole: number, strokes: number, kind: "own" | "attest" = "own") =>
  ({ ...scope, groupId: "g1", scoredProfileId: kind === "own" ? "me" : "jake", kind, entry: { hole, strokes } });

test("an edit is queued with a stable op id and the server version it's based on; editing the same hole again replaces it", () => {
  let ops: QueuedOp[] = enqueue([], change(1, 5), 0, newId, now());
  assert.equal(ops.length, 1);
  assert.equal(ops[0].baseVersion, 0);
  const first = ops[0].opId;
  ops = enqueue(ops, change(1, 4), 3, newId, now());
  assert.equal(ops.length, 1);
  assert.equal(ops[0].entry.strokes, 4);
  assert.equal(ops[0].baseVersion, 0, "still based on what the server had before my first edit");
  assert.deepEqual(ops[0].supersedes, [first], "the server may already have my earlier op: that's mine, not a conflict");
});

test("my own card and my attest column are separate queue entries, even on the same hole", () => {
  const ops = enqueue(enqueue([], change(1, 5), 0, newId, now()), change(1, 6, "attest"), 0, newId, now());
  assert.equal(ops.length, 2);
  assert.deepEqual(batches(ops).map((b) => b.scoredProfileId).sort(), ["jake", "me"]);
});

test("results: applied and duplicate leave the queue; a conflict keeps my entry and records the saved one", () => {
  let ops = enqueue(enqueue([], change(1, 5), 0, newId, now()), change(2, 4), 0, newId, now());
  const [a, b] = ops.map((o) => o.opId);
  ops = applyResults(ops, [{ opId: a, status: "applied", version: 1 }, { opId: b, status: "conflict", version: 2, server: { hole: 2, strokes: 6 } }]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].status, "conflict");
  assert.equal(ops[0].entry.strokes, 4, "my entry is kept");
  assert.equal(ops[0].server?.entry.strokes, 6);
  assert.equal(queueStatus(ops), "conflict");
  assert.equal(queueStatus(applyResults(ops, [])), "conflict");
  assert.equal(queueStatus([]), "synced");
});

test("results: a hole outside an approved correction is answered locked → kept on the phone, never resent; the rest still apply", () => {
  let ops = enqueue(enqueue([], change(3, 5), 2, newId, now()), change(5, 4), 1, newId, now());
  const [ok, locked] = ops.map((o) => o.opId);
  ops = applyResults(ops, [{ opId: ok, status: "applied", version: 3 }, { opId: locked, status: "locked", version: 1 }]);
  assert.deepEqual(ops.map((o) => [o.entry.hole, o.status]), [[5, "rejected"]]);
  assert.deepEqual(batches(ops), [], "a locked change is never sent again");
  assert.equal(queueStatus(ops), "synced");
});

test("Step 6: an attest entry made for an open correction carries its request id; a later edit without one doesn't inherit it", () => {
  let ops = enqueue([], { ...change(3, 5, "attest"), correctionRequestId: "req-1" }, 2, newId, now());
  assert.equal(ops[0].correctionRequestId, "req-1");
  ops = enqueue(ops, change(3, 6, "attest"), 2, newId, now());
  assert.equal(ops.length, 1);
  assert.equal("correctionRequestId" in ops[0], false, "only an entry made for the correction says so");
});

test("a result for an op I've since replaced doesn't drop the newer edit", () => {
  let ops = enqueue([], change(1, 5), 0, newId, now());
  const old = ops[0].opId;
  ops = enqueue(ops, change(1, 3), 0, newId, now());
  ops = applyResults(ops, [{ opId: old, status: "applied", version: 1 }]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].entry.strokes, 3);
});

test("resolving a conflict: keep mine → resend on top of the saved version; use saved → drop mine", () => {
  let ops = applyResults(enqueue([], change(2, 4), 0, newId, now()), []);
  ops = applyResults(ops, [{ opId: ops[0].opId, status: "conflict", version: 2, server: { hole: 2, strokes: 6 } }]);
  const mine = resolveConflict(ops, ops[0].key, "mine", newId);
  assert.equal(mine[0].status, "pending");
  assert.equal(mine[0].baseVersion, 2);
  assert.notEqual(mine[0].opId, ops[0].opId);
  assert.deepEqual(mine[0].supersedes, []);
  assert.equal(resolveConflict(ops, ops[0].key, "saved", newId).length, 0);
  assert.equal(batches(ops).length, 0, "conflicts aren't sent until resolved");
});

// --- the sync engine, with an in-memory stand-in for IndexedDB and a fake network ---

const okSend = (version = 1): SendBatch => async (batch) => ({ ok: true, results: batch.ops.map((o) => ({ opId: o.opId, status: "applied" as const, version })), scoring: null });

test("offline: edits are kept (status pending) and survive a restart; reconnecting sends them once", async () => {
  const storage = memoryQueueStorage();
  let online = false;
  const sent: string[] = [];
  const send: SendBatch = async (batch) => { if (!online) return { ok: false, reason: "offline" }; sent.push(...batch.ops.map((o) => o.opId)); return okSend()(batch); };
  const first = createScoringSync({ storage, send, scope, newId, now });
  await first.load();
  await first.edit(change(1, 5), 0);
  await first.edit(change(2, 4), 0);
  await first.sync();
  assert.equal(first.status(), "pending");
  // App closed and reopened: a new engine on the same storage finds the queue.
  const second = createScoringSync({ storage, send, scope, newId, now });
  await second.load();
  assert.equal(second.ops().length, 2);
  online = true;
  await second.sync();
  assert.equal(second.status(), "synced");
  assert.equal(sent.length, 2);
  await second.sync();
  assert.equal(sent.length, 2, "nothing left to send");
  assert.equal((await storage.load(scope)).length, 0);
});

test("a retry after a lost response is a duplicate on the server: still counted as saved", async () => {
  const storage = memoryQueueStorage();
  const seen = new Set<string>();
  let dropResponse = true;
  const send: SendBatch = async (batch) => {
    const results = batch.ops.map((o) => ({ opId: o.opId, status: seen.has(o.opId) ? "duplicate" as const : "applied" as const, version: 1 }));
    batch.ops.forEach((o) => seen.add(o.opId));
    if (dropResponse) { dropResponse = false; return { ok: false, reason: "error" }; }
    return { ok: true, results, scoring: null };
  };
  const sync = createScoringSync({ storage, send, scope, newId, now });
  await sync.load();
  await sync.edit(change(1, 5), 0);
  await sync.sync();
  assert.equal(sync.status(), "pending");
  await sync.sync();
  assert.equal(sync.status(), "synced");
});

test("a conflict from the server keeps my entry and blocks until resolved", async () => {
  const storage = memoryQueueStorage();
  let conflict = true;
  const send: SendBatch = async (batch) => ({ ok: true, scoring: null, results: batch.ops.map((o) => conflict
    ? { opId: o.opId, status: "conflict" as const, version: 3, server: { hole: o.entry.hole, strokes: 7 } }
    : { opId: o.opId, status: "applied" as const, version: 4 }) });
  const sync = createScoringSync({ storage, send, scope, newId, now });
  await sync.load();
  await sync.edit(change(3, 5), 2);
  await sync.sync();
  assert.equal(sync.status(), "conflict");
  assert.equal(sync.ops()[0].entry.strokes, 5);
  conflict = false;
  await sync.sync();
  assert.equal(sync.status(), "conflict", "not resent until the golfer chooses");
  await sync.resolve(sync.ops()[0].key, "mine");
  await sync.sync();
  assert.equal(sync.status(), "synced");
});

test("an expired session or a different signed-in account stops syncing without losing anything", async () => {
  for (const reason of ["signed-out", "wrong-account"] as const) {
    const storage = memoryQueueStorage();
    const sync = createScoringSync({ storage, send: async () => ({ ok: false, reason }), scope, newId, now });
    await sync.load();
    await sync.edit(change(1, 5), 0);
    await sync.sync();
    assert.equal(sync.status(), "pending");
    assert.equal(sync.blocked(), reason);
    assert.equal((await storage.load(scope)).length, 1);
  }
});

test("account switching: another golfer's queue is never loaded or sent", async () => {
  const storage = memoryQueueStorage();
  const mine = createScoringSync({ storage, send: async () => ({ ok: false, reason: "offline" }), scope, newId, now });
  await mine.load();
  await mine.edit(change(1, 5), 0);
  const sent: string[] = [];
  const other = createScoringSync({ storage, send: async (b) => { sent.push(...b.ops.map((o) => o.opId)); return okSend()(b); }, scope: { ...scope, profileId: "someone-else" }, newId, now });
  await other.load();
  assert.equal(other.ops().length, 0);
  await other.sync();
  assert.equal(sent.length, 0);
  assert.equal((await storage.load(scope)).length, 1, "my queue is still there for when I sign back in");
});

test("two syncs at once don't send the same ops twice", async () => {
  const storage = memoryQueueStorage();
  let calls = 0;
  const send: SendBatch = async (b) => { calls++; await new Promise((r) => setTimeout(r, 5)); return okSend()(b); };
  const sync = createScoringSync({ storage, send, scope, newId, now });
  await sync.load();
  await sync.edit(change(1, 5), 0);
  await Promise.all([sync.sync(), sync.sync()]);
  assert.equal(calls, 1);
});

test("late offline writes to a submitted card: refused as locked, kept on the phone, never resent, not 'pending'", async () => {
  const storage = memoryQueueStorage();
  let calls = 0;
  const send: SendBatch = async (b) => { calls++; return b.scoredProfileId === "me" ? { ok: false, reason: "locked" } : okSend()(b); };
  const sync = createScoringSync({ storage, send, scope, newId, now });
  await sync.load();
  await sync.edit(change(4, 6), 1);
  await sync.edit(change(4, 5, "attest"), 0);
  await sync.sync();
  assert.equal(sync.ops().length, 1);
  assert.equal(sync.ops()[0].status, "rejected");
  assert.equal(sync.status(), "synced", "a locked card's leftovers don't block anything");
  const before = calls;
  await sync.sync();
  assert.equal(calls, before, "never sent again");
  assert.equal((await storage.load(scope))[0].status, "rejected", "kept on the phone");
});

test("after a card reopens, a new edit to a hole whose old change was rejected starts fresh from the server's version", () => {
  let ops = enqueue([], change(3, 6), 1, newId, now());
  ops = ops.map((o) => ({ ...o, status: "rejected" as const }));
  ops = enqueue(ops, change(3, 5), 2, newId, now());
  assert.equal(ops.length, 1);
  assert.deepEqual([ops[0].status, ops[0].baseVersion, ops[0].supersedes], ["pending", 2, []]);
});
