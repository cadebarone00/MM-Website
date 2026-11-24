import test from "node:test";
import assert from "node:assert/strict";
import type { TripRoundScoring } from "../../../lib/platform/tripScoring.ts";
import type { QueuedOp } from "../../../lib/platform/scoringQueue.ts";
import { tripScoringCard } from "./tripScoringCard.ts";

const scoring: TripRoundScoring = { roundId: "r", roundNumber: 1, groups: [{ id: "g", groupNumber: 1, lockedAt: null, players: [{ profileId: "a", displayName: "A", playOrder: 1, side: null, attesterProfileId: "b", submittedAt: null }, { profileId: "b", displayName: "B", playOrder: 2, side: null, attesterProfileId: "a", submittedAt: null }] }], entries: [] };
const entry = (extra: Partial<QueuedOp>): QueuedOp => ({ profileId: "a", tripId: "t", roundNumber: 1, key: "k", opId: "o", groupId: "g", scoredProfileId: "a", kind: "own", entry: { hole: 1, strokes: 4 }, baseVersion: 0, supersedes: [], clientUpdatedAt: "2026-11-24T00:00:00Z", status: "pending", ...extra });
test("only relevant pending entries overlay the correct player's card", () => {
  const card = tripScoringCard(scoring, "a", [entry({}), entry({ kind: "attest", scoredProfileId: "b", entry: { hole: 2, strokes: 5 } }), entry({ status: "rejected", entry: { hole: 3, strokes: 9 } }), entry({ profileId: "other", entry: { hole: 4, strokes: 8 } })])!;
  assert.equal(card.card.holes[0], 4); assert.equal(card.card.opponentHoles[1], 5); assert.equal(card.card.holes[2], null); assert.equal(card.card.holes[3], null);
  assert.equal(tripScoringCard(scoring, "other", []), null);
});
