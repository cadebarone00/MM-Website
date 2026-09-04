import { test } from "node:test";
import assert from "node:assert/strict";
import { closedMarginLabel, DISPLAY_MODE_BY_KIND, marginLabel, pickActiveEvent, teamLabel, type ActiveBroadcastEvent } from "./eventDisplay.ts";
import type { BroadcastEventRow } from "./queue.ts";

function row(overrides: Partial<BroadcastEventRow>): BroadcastEventRow {
  return {
    id: "id-1",
    kind: "MATCH_STATE_CHANGED",
    priority: 40,
    status: "queued",
    payload: {},
    expiresAt: null,
    createdAt: "2027-01-06T12:00:00Z",
    ...overrides,
  };
}

test("DISPLAY_MODE_BY_KIND maps exactly the two visible kinds, nothing else", () => {
  assert.deepEqual(DISPLAY_MODE_BY_KIND, {
    MATCH_STATE_CHANGED: "overlay",
    MATCH_WON: "takeover",
    ROUND_FINAL: "takeover",
  });
});

test("pickActiveEvent returns the first row with a known display mode", () => {
  const events = [row({ id: "a", kind: "MATCH_WON" })];
  const result = pickActiveEvent(events, new Set());
  assert.deepEqual(result, { id: "a", kind: "MATCH_WON", displayMode: "takeover", payload: {} });
});

test("pickActiveEvent skips ids already in the shown set", () => {
  const events = [row({ id: "a", kind: "MATCH_STATE_CHANGED" }), row({ id: "b", kind: "MATCH_WON" })];
  const result = pickActiveEvent(events, new Set(["a"]));
  assert.equal(result?.id, "b");
});

test("pickActiveEvent skips a kind with no known display mode and warns, rather than crashing", () => {
  const events = [row({ id: "a", kind: "SCORE_POSTED" }), row({ id: "b", kind: "MATCH_STATE_CHANGED" })];
  const result = pickActiveEvent(events, new Set());
  assert.equal(result?.id, "b");
});

test("pickActiveEvent returns null when every row is shown or unrecognized", () => {
  const events = [row({ id: "a", kind: "SCORE_POSTED" })];
  assert.equal(pickActiveEvent(events, new Set()), null);
});

test("pickActiveEvent returns null on an empty list", () => {
  assert.equal(pickActiveEvent([], new Set()), null);
});

test("marginLabel: AS at zero, N UP otherwise", () => {
  assert.equal(marginLabel(0), "AS");
  assert.equal(marginLabel(1), "1 UP");
  assert.equal(marginLabel(3), "3 UP");
});

test("closedMarginLabel: N & M when the match closed early (margin > holesRemaining)", () => {
  assert.equal(closedMarginLabel(3, 2), "3 & 2");
});

test("closedMarginLabel: N UP when the match closed exactly at the last playable hole", () => {
  assert.equal(closedMarginLabel(1, 0), "1 UP");
});

test("teamLabel maps maroon/white/tie", () => {
  assert.equal(teamLabel("maroon"), "Maroon");
  assert.equal(teamLabel("white"), "White");
  assert.equal(teamLabel("tie"), "Tie");
});
