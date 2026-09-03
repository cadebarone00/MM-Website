"use client";

import type { BroadcastPayload, BroadcastStanding } from "@/lib/broadcast/types";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { useLiveBroadcastData } from "@/lib/broadcast/useLiveBroadcastData";
import { useLiveBroadcastState } from "@/lib/broadcast/useLiveBroadcastState";
import { useReloadOnDisplayYearChange } from "@/lib/broadcast/useReloadOnDisplayYearChange";
import { SceneRenderer } from "./SceneRenderer";

/**
 * A host can force a scene (or return to auto), pause/resume, post an
 * announcement, switch which year is displayed, or go live/end the
 * broadcast from Tiger Center's Broadcast Controls page, and every open
 * /broadcast tab picks it up live. See
 * docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md.
 *
 * `preview: true` (the Broadcast Controls preview iframe, `/broadcast?preview=1&...`)
 * renders `broadcast.state` exactly as given, statically — no subscription
 * to the real, shared broadcast_state/broadcast_display_year, so a Tiger
 * rehearsing privately never touches or is disrupted by the real broadcast.
 */
export function BroadcastStage({
  broadcast,
  standings: initialStandings,
  matchPlay: initialMatchPlay,
  holding,
  preview = false,
}: {
  broadcast: BroadcastPayload;
  standings: BroadcastStanding[];
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
  preview?: boolean;
}) {
  const { standings, matchPlay } = useLiveBroadcastData(broadcast.seasonYear, { standings: initialStandings, matchPlay: initialMatchPlay });
  const state = useLiveBroadcastState(broadcast.seasonYear, broadcast.state, !preview);
  useReloadOnDisplayYearChange(broadcast.seasonYear, !preview);

  return <SceneRenderer state={state} config={broadcast.config} standings={standings} matchPlay={matchPlay} holding={holding} />;
}
