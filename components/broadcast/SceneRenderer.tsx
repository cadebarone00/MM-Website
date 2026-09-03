"use client";

import type { BroadcastConfig, BroadcastState } from "@/lib/broadcast/types";
import type { PlayerSummary } from "@/lib/live/scoring";
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
  standings: PlayerSummary[];
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
}) {
  const isAuto = state.automationMode === "auto";
  // Producer Mode (including a host's Pause — see BroadcastControlsPanel):
  // no rotation timer running, current_scene is shown statically.
  const autoScene = useAutoScene(state.sceneStartedAt, config, isAuto);
  const scene = isAuto ? autoScene : state.currentScene;

  return (
    <>
      {scene === "individual_leaderboard" && <IndividualLeaderboardScene standings={standings} />}
      {scene === "match_play" && <MatchPlayScene matchPlay={matchPlay} />}
      {scene === "holding" && <HoldingScene venue={holding.venue} dateLabel={holding.dateLabel} />}
      <OverlayLayer text={state.overlayText} expiresAt={state.overlayExpiresAt} />
    </>
  );
}
