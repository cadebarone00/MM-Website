import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLiveScoreEvent } from "./liveScoreEvent.ts";
import type { BroadcastStanding } from "./types.ts";

function standing(overrides: Partial<BroadcastStanding> & { player: string }): BroadcastStanding {
  return { team: "maroon", toPar: 0, todayToPar: 0, thru: 0, ...overrides };
}

test("detectLiveScoreEvent: birdie when todayToPar drops by 1 on a newly-completed hole", () => {
  const prev = [standing({ player: "a", todayToPar: 0, thru: 4 })];
  const next = [standing({ player: "a", todayToPar: -1, thru: 5 })];
  assert.deepEqual(detectLiveScoreEvent(prev, next), { player: "a", eventKind: "birdie" });
});

test("detectLiveScoreEvent: eagle when todayToPar drops by 2 or more", () => {
  const prev = [standing({ player: "a", todayToPar: -1, thru: 13 })];
  const next = [standing({ player: "a", todayToPar: -3, thru: 14 })];
  assert.deepEqual(detectLiveScoreEvent(prev, next), { player: "a", eventKind: "eagle" });
});

test("detectLiveScoreEvent: bogey when todayToPar rises", () => {
  const prev = [standing({ player: "a", todayToPar: 0, thru: 1 })];
  const next = [standing({ player: "a", todayToPar: 1, thru: 2 })];
  assert.deepEqual(detectLiveScoreEvent(prev, next), { player: "a", eventKind: "bogey" });
});

test("detectLiveScoreEvent: a par hole is not an event", () => {
  const prev = [standing({ player: "a", todayToPar: 0, thru: 1 })];
  const next = [standing({ player: "a", todayToPar: 0, thru: 2 })];
  assert.equal(detectLiveScoreEvent(prev, next), null);
});

test("detectLiveScoreEvent: no event when thru didn't advance (unrelated re-fetch)", () => {
  const prev = [standing({ player: "a", todayToPar: -1, thru: 5 })];
  const next = [standing({ player: "a", todayToPar: -1, thru: 5 })];
  assert.equal(detectLiveScoreEvent(prev, next), null);
});

test("detectLiveScoreEvent: no event for a player missing from the previous snapshot", () => {
  const prev: BroadcastStanding[] = [];
  const next = [standing({ player: "a", todayToPar: -1, thru: 1 })];
  assert.equal(detectLiveScoreEvent(prev, next), null);
});

test("detectLiveScoreEvent: simultaneous changes — the more dramatic one wins", () => {
  const prev = [standing({ player: "a", todayToPar: 0, thru: 1 }), standing({ player: "b", todayToPar: 0, thru: 1 })];
  const next = [standing({ player: "a", todayToPar: 1, thru: 2 }), standing({ player: "b", todayToPar: -2, thru: 2 })];
  assert.deepEqual(detectLiveScoreEvent(prev, next), { player: "b", eventKind: "eagle" });
});
