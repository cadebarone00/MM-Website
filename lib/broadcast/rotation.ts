// lib/broadcast/rotation.ts
import type { BroadcastConfig, BroadcastScene } from "./types";

/**
 * Fixed rotation order for Phase 1 — no queue/priority system yet (that's
 * Phase 2, see the spec's §12-15). Every /broadcast tab computes its scene
 * purely from `anchorMs` + `config`, with no server round-trip on each
 * tick — this is what keeps multiple open tabs in sync (spec §34) without
 * a shared "controller" process (spec §8).
 */
export const ROTATION_ORDER: BroadcastScene[] = ["individual_leaderboard", "match_play", "holding"];

export interface RotationTick {
  scene: BroadcastScene;
  msUntilNext: number;
}

/**
 * Which scene is showing at `nowMs`, and how long until the next one, given
 * a fixed anchor timestamp and per-scene durations. Every client that shares
 * the same `anchorMs`/`config` computes the identical answer.
 */
export function sceneAt(anchorMs: number, config: BroadcastConfig, nowMs: number): RotationTick {
  const durations = ROTATION_ORDER.map((scene) => Math.max(1000, config.sceneDurationsMs[scene] ?? 0));
  const cycleMs = durations.reduce((sum, d) => sum + d, 0);

  let elapsed = (nowMs - anchorMs) % cycleMs;
  if (elapsed < 0) elapsed += cycleMs;

  for (let i = 0; i < ROTATION_ORDER.length; i++) {
    if (elapsed < durations[i]) {
      return { scene: ROTATION_ORDER[i], msUntilNext: durations[i] - elapsed };
    }
    elapsed -= durations[i];
  }

  // Unreachable given the loop above covers the full cycle, but keeps the
  // return type total rather than possibly undefined.
  return { scene: ROTATION_ORDER[0], msUntilNext: durations[0] };
}
