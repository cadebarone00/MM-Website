import type { BroadcastScene, BroadcastVideoPhase } from "./types";

// Two complete one-minute rehearsal cycles. The short transition is kept at
// the same four seconds used by the real player-video workflow.
export const MOCK_RUN_CYCLE_MS = 60_000;
export const MOCK_RUN_TOTAL_MS = MOCK_RUN_CYCLE_MS * 2;

export type MockRunPosition = {
  scene: BroadcastScene;
  videoPhase: BroadcastVideoPhase | null;
  cycle: number;
};

export function getMockRunPosition(elapsedMs: number): MockRunPosition {
  const cycle = Math.min(1, Math.floor(Math.max(0, elapsedMs) / MOCK_RUN_CYCLE_MS));
  const time = Math.max(0, elapsedMs) % MOCK_RUN_CYCLE_MS;

  if (time < 14_000) return { scene: "individual_leaderboard", videoPhase: null, cycle };
  if (time < 28_000) return { scene: "match_play", videoPhase: null, cycle };
  if (time < 40_000) return { scene: "holding", videoPhase: null, cycle };
  if (time < 44_000) return { scene: "holding", videoPhase: "transition", cycle };
  return { scene: "holding", videoPhase: "playing", cycle };
}
