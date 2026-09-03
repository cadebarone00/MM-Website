"use client";

import { useEffect, useMemo, useState } from "react";
import type { BroadcastConfig, BroadcastScene, BroadcastState } from "@/lib/broadcast/types";
import type { PlayerSummary } from "@/lib/live/scoring";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { sceneAt } from "@/lib/broadcast/rotation";
import { IndividualLeaderboardScene } from "./scenes/IndividualLeaderboardScene";
import { MatchPlayScene } from "./scenes/MatchPlayScene";
import { HoldingScene } from "./scenes/HoldingScene";

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
  const anchorMs = useMemo(() => new Date(state.sceneStartedAt).getTime(), [state.sceneStartedAt]);
  const [autoScene, setAutoScene] = useState<BroadcastScene>(() => sceneAt(anchorMs, config, Date.now()).scene);

  useEffect(() => {
    if (!isAuto) return; // Producer Mode: a host is showing a specific scene — no rotation timer running.

    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const { scene: next, msUntilNext } = sceneAt(anchorMs, config, Date.now());
      setAutoScene(next);
      // Re-check a bit early rather than exactly on the boundary — cheap
      // insurance against clock drift/timer coalescing causing a scene to
      // hang one tick too long.
      timeoutId = setTimeout(tick, Math.max(250, msUntilNext - 50));
    }

    tick();
    return () => clearTimeout(timeoutId);
  }, [isAuto, anchorMs, config]);

  const scene = isAuto ? autoScene : state.currentScene;

  switch (scene) {
    case "individual_leaderboard":
      return <IndividualLeaderboardScene standings={standings} />;
    case "match_play":
      return <MatchPlayScene matchPlay={matchPlay} />;
    case "holding":
    default:
      return <HoldingScene venue={holding.venue} dateLabel={holding.dateLabel} />;
  }
}
