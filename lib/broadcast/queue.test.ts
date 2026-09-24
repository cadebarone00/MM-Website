import { test } from "node:test";
import assert from "node:assert/strict";
import { sortQueueRows, type BroadcastEventRow } from "./queue.ts";

function row(overrides: Partial<BroadcastEventRow>): BroadcastEventRow {
  return {
    id: "id",
    kind: "MATCH_STATE_CHANGED",
    priority: 40,
    status: "queued",
    payload: {},
    expiresAt: null,
    createdAt: "2027-01-06T12:00:00Z",
    ...overrides,
  };
}

test("sortQueueRows orders by priority descending", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  const low = row({ id: "low", priority: 40 });
  const high = row({ id: "high", priority: 70 });
  assert.deepEqual(sortQueueRows([low, high], now).map((r) => r.id), ["high", "low"]);
});

test("sortQueueRows breaks priority ties by created_at ascending", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  const later = row({ id: "later", createdAt: "2027-01-06T11:59:00Z" });
  const earlier = row({ id: "earlier", createdAt: "2027-01-06T11:58:00Z" });
  assert.deepEqual(sortQueueRows([later, earlier], now).map((r) => r.id), ["earlier", "later"]);
});

test("sortQueueRows excludes expired rows", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  const expired = row({ id: "expired", expiresAt: "2027-01-06T11:00:00Z" });
  const active = row({ id: "active", expiresAt: "2027-01-06T13:00:00Z" });
  assert.deepEqual(sortQueueRows([expired, active], now).map((r) => r.id), ["active"]);
});

test("sortQueueRows only includes queued/ready rows", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  const pending = row({ id: "pending", status: "pending" });
  const queued = row({ id: "queued", status: "queued" });
  const ready = row({ id: "ready", status: "ready" });
  const played = row({ id: "played", status: "played" });
  assert.deepEqual(sortQueueRows([pending, queued, ready, played], now).map((r) => r.id).sort(), ["queued", "ready"]);
});

test("sortQueueRows applies aging: a long-waiting lower base-priority row can overtake a fresher higher base-priority one", () => {
  const now = new Date("2027-01-06T12:30:00Z");
  const fresh = row({ id: "fresh", priority: 45, createdAt: "2027-01-06T12:29:00Z" }); // 1 min waited -> 47
  const aged = row({ id: "aged", priority: 40, createdAt: "2027-01-06T12:00:00Z" }); // 30 min waited -> +30 capped -> 70
  assert.deepEqual(sortQueueRows([fresh, aged], now).map((r) => r.id), ["aged", "fresh"]);
});
