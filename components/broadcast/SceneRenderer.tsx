"use client";

import type { BroadcastConfig, BroadcastStanding, BroadcastState } from "@/lib/broadcast/types";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { useAutoScene } from "@/lib/broadcast/useAutoScene";
import { IndividualLeaderboardScene } from "./scenes/IndividualLeaderboardScene";
import { MatchPlayScene } from "./scenes/MatchPlayScene";
import { HoldingScene } from "./scenes/HoldingScene";
import { OverlayLayer } from "./OverlayLayer";

export function SceneRenderer({
  state,
  config,
  standings,
  matchPlay,
  holding,
}: {
  state: BroadcastState;
  config: BroadcastConfig;
  standings: BroadcastStanding[];
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
}) {
  const isAuto = state.automationMode === "auto";
  // Producer Mode (including a host's Pause — see BroadcastControlsPanel):
  // no rotation timer running, current_scene is shown statically. Called
  // unconditionally either way — Rules of Hooks — the hook itself no-ops
  // internally when isAuto is false.
  const autoScene = useAutoScene(state.sceneStartedAt, config, isAuto);
  // Before Tiger hits "Go Live" (Broadcast Controls), the show holds on
  // this scene regardless of rotation/producer mode — same as a real
  // broadcast's pre-show hold (spec §7/§17's Holding scene).
  const scene = !state.tournamentLive ? "holding" : isAuto ? autoScene : state.currentScene;

  return (
    <>
      {scene === "individual_leaderboard" && <IndividualLeaderboardScene standings={standings} />}
      {scene === "match_play" && <MatchPlayScene matchPlay={matchPlay} />}
      {scene === "holding" && <HoldingScene venue={holding.venue} dateLabel={holding.dateLabel} />}
      <OverlayLayer text={state.overlayText} expiresAt={state.overlayExpiresAt} />
    </>
  );
}
