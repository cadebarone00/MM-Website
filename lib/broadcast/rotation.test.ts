import { test } from "node:test";
import assert from "node:assert/strict";
import { sceneAt } from "./rotation.ts";
import { DEFAULT_SCENE_DURATIONS_MS, type BroadcastConfig } from "./types.ts";

const config: BroadcastConfig = { seasonYear: 2027, sceneDurationsMs: DEFAULT_SCENE_DURATIONS_MS, overlayDurationMs: 6000, takeoverDurationMs: 8000 };
const anchor = 0;

test("starts on the first scene at the anchor instant", () => {
  const tick = sceneAt(anchor, config, anchor);
  assert.equal(tick.scene, "individual_leaderboard");
  assert.equal(tick.msUntilNext, DEFAULT_SCENE_DURATIONS_MS.individual_leaderboard);
});

test("advances to match_play once the leaderboard's duration elapses", () => {
  const tick = sceneAt(anchor, config, anchor + DEFAULT_SCENE_DURATIONS_MS.individual_leaderboard);
  assert.equal(tick.scene, "match_play");
});

test("wraps back to individual_leaderboard after a full cycle", () => {
  const cycle =
    DEFAULT_SCENE_DURATIONS_MS.individual_leaderboard + DEFAULT_SCENE_DURATIONS_MS.match_play + DEFAULT_SCENE_DURATIONS_MS.holding;
  const tick = sceneAt(anchor, config, anchor + cycle + 500);
  assert.equal(tick.scene, "individual_leaderboard");
});

test("every client with the same anchor/config agrees, regardless of when it starts watching", () => {
  const laterAnchor = 1_000_000;
  const now = laterAnchor + DEFAULT_SCENE_DURATIONS_MS.individual_leaderboard + 2000;
  assert.equal(sceneAt(laterAnchor, config, now).scene, sceneAt(anchor, config, now - laterAnchor).scene);
});
