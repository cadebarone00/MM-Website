"use client";

import { useEffect, useState } from "react";
import type { BroadcastPayload } from "@/lib/broadcast/types";

const SCENE_LABELS: Record<BroadcastPayload["state"]["currentScene"], string> = {
  holding: "Holding",
  individual_leaderboard: "Individual Leaderboard",
  match_play: "Match Play",
};

/**
 * Step 2 of the Watch Live Broadcast build: proves the page loads, reads
 * real broadcast_state/broadcast_config rows for the active season, and
 * stays alive client-side. No scenes, no rotation, no Realtime yet — those
 * are the next steps. See docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md.
 */
export function BroadcastStage({ initial }: { initial: BroadcastPayload }) {
  const [elapsedSec, setElapsedSec] = useState(() => secondsSince(initial.state.sceneStartedAt));

  useEffect(() => {
    const id = setInterval(() => setElapsedSec(secondsSince(initial.state.sceneStartedAt)), 1000);
    return () => clearInterval(id);
  }, [initial.state.sceneStartedAt]);

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-[color:var(--color-maroon-900)] text-[color:var(--color-maroon-50)]">
      <p className="font-condensed text-sm uppercase tracking-[0.3em] text-[color:var(--color-maroon-300)]">
        The Maroon Masters — Watch Live · {initial.seasonYear}
      </p>
      <h1 className="mt-4 font-serif text-5xl font-semibold sm:text-7xl">{SCENE_LABELS[initial.state.currentScene]}</h1>
      <p className="mt-6 text-[color:var(--color-maroon-200)]">
        On screen for {elapsedSec}s · {initial.state.automationMode === "auto" ? "Auto Mode" : "Producer Mode"}
        {initial.state.paused ? " · Paused" : ""}
      </p>
    </main>
  );
}

function secondsSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}
