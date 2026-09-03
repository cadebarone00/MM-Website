"use client";

import type { BroadcastPayload } from "@/lib/broadcast/types";
import type { PlayerSummary } from "@/lib/live/scoring";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { useLiveBroadcastData } from "@/lib/broadcast/useLiveBroadcastData";
import { useLiveBroadcastState } from "@/lib/broadcast/useLiveBroadcastState";
import { SceneRenderer } from "./SceneRenderer";

/**
 * Step 6 of the Watch Live Broadcast build: a host can now force a scene
 * (or return to auto) from Tiger Center's new Broadcast Controls page, and
 * every open /broadcast tab picks it up live. See
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
  const state = useLiveBroadcastState(broadcast.seasonYear, broadcast.state);

  return <SceneRenderer state={state} config={broadcast.config} standings={standings} matchPlay={matchPlay} holding={holding} />;
}
