import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStateChangedRule, matchWonRule, roundFinalRule, roundStartedRule, scorePostedRule } from "./rules.ts";

const NOW = new Date("2027-01-06T12:00:00Z");

test("scorePostedRule: priority 10, status pending, never expires", () => {
  const draft = scorePostedRule({ kind: "SCORE_POSTED", seasonYear: 2027, playerSlug: "cade-barone", round: 1, hole: 5, score: 4, matchBoxId: "box-1" }, NOW);
  assert.equal(draft.priority, 10);
  assert.equal(draft.status, "pending");
  assert.equal(draft.expiresAt, null);
  assert.deepEqual(draft.payload, { playerSlug: "cade-barone", round: 1, hole: 5, score: 4, matchBoxId: "box-1" });
});

test("matchStateChangedRule: priority 40, status queued, expires in 10 minutes", () => {
  const draft = matchStateChangedRule({ kind: "MATCH_STATE_CHANGED", seasonYear: 2027, matchBoxId: "box-1", round: 1, leader: "maroon", margin: 2, holesRemaining: 9 }, NOW);
  assert.equal(draft.priority, 40);
  assert.equal(draft.status, "queued");
  assert.equal(draft.expiresAt, new Date(NOW.getTime() + 10 * 60 * 1000).toISOString());
  assert.deepEqual(draft.payload, { matchBoxId: "box-1", round: 1, leader: "maroon", margin: 2, holesRemaining: 9 });
});

test("matchWonRule: priority 70, status queued, expires in 30 minutes", () => {
  const draft = matchWonRule({ kind: "MATCH_WON", seasonYear: 2027, matchBoxId: "box-1", round: 1, leader: "maroon", margin: 3, maroonPts: 1, whitePts: 0 }, NOW);
  assert.equal(draft.priority, 70);
  assert.equal(draft.status, "queued");
  assert.equal(draft.expiresAt, new Date(NOW.getTime() + 30 * 60 * 1000).toISOString());
  assert.deepEqual(draft.payload, { matchBoxId: "box-1", round: 1, leader: "maroon", margin: 3, maroonPts: 1, whitePts: 0 });
});

test("roundStartedRule: priority 0, status pending, never expires", () => {
  const draft = roundStartedRule({ kind: "ROUND_STARTED", seasonYear: 2027, round: 2 }, NOW);
  assert.equal(draft.priority, 0);
  assert.equal(draft.status, "pending");
  assert.equal(draft.expiresAt, null);
  assert.deepEqual(draft.payload, { round: 2 });
});

test("roundFinalRule: priority 75, status queued, expires in 30 minutes", () => {
  const draft = roundFinalRule({ kind: "ROUND_FINAL", seasonYear: 2027, round: 2 }, NOW);
  assert.equal(draft.priority, 75);
  assert.equal(draft.status, "queued");
  assert.equal(draft.expiresAt, new Date(NOW.getTime() + 30 * 60 * 1000).toISOString());
  assert.deepEqual(draft.payload, { round: 2 });
});
