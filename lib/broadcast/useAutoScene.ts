"use client";

import { useEffect, useMemo, useState } from "react";
import { sceneAt } from "./rotation";
import type { BroadcastConfig, BroadcastScene } from "./types";

/**
 * Which scene the auto rotation is showing right now, ticking forward on
 * its own — the same computation /broadcast itself uses (see
 * components/broadcast/SceneRenderer.tsx), shared so Tiger Center's
 * Broadcast Controls can display and act on the real live scene instead of
 * a stale `current_scene` value (which auto rotation never writes back to
 * the database — see the spec's §8/§15).
 */
export function useAutoScene(anchorIso: string, config: BroadcastConfig, enabled: boolean): BroadcastScene {
  const anchorMs = useMemo(() => new Date(anchorIso).getTime(), [anchorIso]);
  const [scene, setScene] = useState<BroadcastScene>(() => sceneAt(anchorMs, config, Date.now()).scene);

  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled, anchorMs, config]);

  return scene;
}
