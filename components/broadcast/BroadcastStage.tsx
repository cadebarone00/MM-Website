"use client";

import type { PlayerSummary } from "@/lib/live/scoring";
import { IndividualLeaderboardScene } from "./scenes/IndividualLeaderboardScene";

/**
 * Step 3 of the Watch Live Broadcast build: shows the real Individual
 * Leaderboard scene. Always-on for now — no rotation, no Match Play scene,
 * no Realtime subscription yet (those are the next steps). See
 * docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md.
 */
export function BroadcastStage({ standings }: { standings: PlayerSummary[] }) {
  return <IndividualLeaderboardScene standings={standings} />;
}
