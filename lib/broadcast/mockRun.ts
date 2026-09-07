import type { BroadcastScene, BroadcastVideoPhase } from "./types";

// Two complete one-minute rehearsal cycles. The short transition is kept at
// the same four seconds used by the real player-video workflow.
export const MOCK_RUN_PREFIX_MS = 44_000;
export const MOCK_RUN_DEFAULT_VIDEO_MS = 16_000;

export function getMockRunCycleMs(videoDurationMs = MOCK_RUN_DEFAULT_VIDEO_MS) {
  return MOCK_RUN_PREFIX_MS + Math.max(1_000, videoDurationMs);
}

export function getMockRunTotalMs(videoDurationMs = MOCK_RUN_DEFAULT_VIDEO_MS) {
  return getMockRunCycleMs(videoDurationMs) * 2;
}

export type MockRunPosition = {
  scene: BroadcastScene;
  videoPhase: BroadcastVideoPhase | null;
  cycle: number;
};

export function getMockRunPosition(elapsedMs: number, videoDurationMs = MOCK_RUN_DEFAULT_VIDEO_MS): MockRunPosition {
  const cycleMs = getMockRunCycleMs(videoDurationMs);
  const cycle = Math.min(1, Math.floor(Math.max(0, elapsedMs) / cycleMs));
  const time = Math.max(0, elapsedMs) % cycleMs;

  if (time < 14_000) return { scene: "individual_leaderboard", videoPhase: null, cycle };
  if (time < 28_000) return { scene: "match_play", videoPhase: null, cycle };
  if (time < 40_000) return { scene: "holding", videoPhase: null, cycle };
  if (time < 44_000) return { scene: "holding", videoPhase: "transition", cycle };
  return { scene: "holding", videoPhase: "playing", cycle };
}
