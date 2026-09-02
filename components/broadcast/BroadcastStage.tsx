"use client";

import type { BroadcastPayload } from "@/lib/broadcast/types";
import type { PlayerSummary } from "@/lib/live/scoring";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { SceneRenderer } from "./SceneRenderer";

/**
 * Step 4 of the Watch Live Broadcast build: automatic rotation between
 * Individual Leaderboard, Match Play, and Holding, timed from
 * broadcast_state/broadcast_config. No live updates yet (that's the next
 * step — this still only reflects whatever was true when the page loaded,
 * until refreshed). See docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md.
 */
export function BroadcastStage({
  broadcast,
  standings,
  matchPlay,
  holding,
}: {
  broadcast: BroadcastPayload;
  standings: PlayerSummary[];
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
}) {
  return (
    <SceneRenderer anchorIso={broadcast.state.sceneStartedAt} config={broadcast.config} standings={standings} matchPlay={matchPlay} holding={holding} />
  );
}
