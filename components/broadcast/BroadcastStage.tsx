"use client";

import type { BroadcastPayload } from "@/lib/broadcast/types";
import type { PlayerSummary } from "@/lib/live/scoring";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { useLiveBroadcastData } from "@/lib/broadcast/useLiveBroadcastData";
import { SceneRenderer } from "./SceneRenderer";

/**
 * Step 5 of the Watch Live Broadcast build: the leaderboard and match play
 * scenes now stay live via Supabase Realtime — no refresh needed when a
 * score is entered. Rotation timing and the holding scene's venue/date
 * still come from what the page loaded with (neither changes often enough
 * to need live wiring yet). See
 * docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md.
 */
export function BroadcastStage({
  broadcast,
  standings: initialStandings,
  matchPlay: initialMatchPlay,
  holding,
}: {
  broadcast: BroadcastPayload;
  standings: PlayerSummary[];
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
}) {
  const { standings, matchPlay } = useLiveBroadcastData(broadcast.seasonYear, { standings: initialStandings, matchPlay: initialMatchPlay });

  return <SceneRenderer anchorIso={broadcast.state.sceneStartedAt} config={broadcast.config} standings={standings} matchPlay={matchPlay} holding={holding} />;
}
