"use client";

import { useEffect, useMemo, useState } from "react";
import type { BroadcastConfig, BroadcastScene } from "@/lib/broadcast/types";
import type { PlayerSummary } from "@/lib/live/scoring";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { sceneAt } from "@/lib/broadcast/rotation";
import { IndividualLeaderboardScene } from "./scenes/IndividualLeaderboardScene";
import { MatchPlayScene } from "./scenes/MatchPlayScene";
import { HoldingScene } from "./scenes/HoldingScene";

export function SceneRenderer({
  anchorIso,
  config,
  standings,
  matchPlay,
  holding,
}: {
  anchorIso: string;
  config: BroadcastConfig;
  standings: PlayerSummary[];
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
}) {
  const anchorMs = useMemo(() => new Date(anchorIso).getTime(), [anchorIso]);
  const [scene, setScene] = useState<BroadcastScene>(() => sceneAt(anchorMs, config, Date.now()).scene);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const { scene: next, msUntilNext } = sceneAt(anchorMs, config, Date.now());
      setScene(next);
      // Re-check a bit early rather than exactly on the boundary — cheap
      // insurance against clock drift/timer coalescing causing a scene to
      // hang one tick too long.
      timeoutId = setTimeout(tick, Math.max(250, msUntilNext - 50));
    }

    tick();
    return () => clearTimeout(timeoutId);
  }, [anchorMs, config]);

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
