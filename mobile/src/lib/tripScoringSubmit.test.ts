import test from "node:test";
import assert from "node:assert/strict";
import type { TripRoundScoring } from "../../../lib/platform/tripScoring.ts";
import { submitTripCard } from "./tripScoringSubmit.ts";

const scoring: TripRoundScoring = { roundId: "r", roundNumber: 1, groups: [{ id: "g", groupNumber: 1, lockedAt: null, players: [{ profileId: "a", displayName: "A", playOrder: 1, side: null, attesterProfileId: "b", submittedAt: null }, { profileId: "b", displayName: "B", playOrder: 2, side: null, attesterProfileId: "a", submittedAt: null }] }], entries: Array.from({ length: 18 }, (_, i) => ["a", "b"].map(by => ({ scoredProfileId: "a", enteredByProfileId: by, hole: i + 1, strokes: 4, putts: 2, fairway: "center" as const, green: "center" as const, penaltyFairway: false, penaltyGreen: false, clientUpdatedAt: "2026-11-24T00:00:00Z", version: 1 }))).flat() };
const engine = { async sync() {}, status: () => "synced" as const, ops: () => [] };
test("submits only the current account's checked card version", async () => {
  let body: unknown;
  const result = await submitTripCard({ engine, tripId: "trip", profileId: "a", refresh: async () => scoring, request: async (_path, init) => { body = init.body; return { status: 200, body: { ok: true, status: "submitted", submittedAt: "2026-11-24", scoring: null } }; } });
  assert.equal(result.ok, true); assert.deepEqual(body, { groupId: "g", golferProfileId: "a", expectedProfileId: "a", cardVersion: 36 });
});
test("pending, rejected, offline, or mismatched entries never submit", async () => {
  let calls = 0;
  const request = async () => { calls++; return { status: 500, body: null }; };
  const pending = { ...engine, status: () => "pending" as const };
  assert.equal((await submitTripCard({ engine: pending, tripId: "t", profileId: "a", refresh: async () => scoring, request })).ok, false);
  assert.equal((await submitTripCard({ engine: { ...engine, ops: () => [{ status: "rejected" }] }, tripId: "t", profileId: "a", refresh: async () => scoring, request })).ok, false);
  assert.equal((await submitTripCard({ engine, tripId: "t", profileId: "a", refresh: async () => null, request })).ok, false);
  const mismatch = { ...scoring, entries: scoring.entries.map((e, i) => i === 1 ? { ...e, strokes: 5 } : e) };
  assert.equal((await submitTripCard({ engine, tripId: "t", profileId: "a", refresh: async () => mismatch, request })).ok, false);
  assert.equal(calls, 0);
});
