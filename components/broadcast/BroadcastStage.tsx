"use client";

import { useEffect, useState } from "react";
import type { BroadcastPayload, BroadcastStanding } from "@/lib/broadcast/types";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { useLiveBroadcastData } from "@/lib/broadcast/useLiveBroadcastData";
import { useLiveBroadcastState } from "@/lib/broadcast/useLiveBroadcastState";
import { useReloadOnDisplayYearChange } from "@/lib/broadcast/useReloadOnDisplayYearChange";
import { useBroadcastQueue } from "@/lib/broadcast/useBroadcastQueue";
import { getMockMatchPlay, getMockRunPosition } from "@/lib/broadcast/mockRun";
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
  leaderboardFinal: initialLeaderboardFinal,
  matchPlay: initialMatchPlay,
  holding,
  preview = false,
  mockRun = null,
  animationTest = null,
}: {
  broadcast: BroadcastPayload;
  standings: BroadcastStanding[];
  leaderboardFinal: boolean;
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
  preview?: boolean;
  mockRun?: { startedAt: number | null; offsetMs: number; videoDurationMs: number; seed: number; leaderboardAnimation: { birdieEnabled: boolean; birdieDelayMs: number; rowMoveMs: number } } | null;
  animationTest?: { kind: "birdie" | "eagle" | "bogey"; startedAt: number; seed: number } | null;
}) {
  const [mockClock, setMockClock] = useState(Date.now());
  useEffect(() => {
    if (!mockRun?.startedAt) return;
    const timer = window.setInterval(() => setMockClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [mockRun?.startedAt]);
  useEffect(() => {
    if (!animationTest) return;
    const timer = window.setInterval(() => setMockClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [animationTest?.startedAt]);
  const { standings, leaderboardFinal, matchPlay } = useLiveBroadcastData(broadcast.seasonYear, {
    standings: initialStandings,
    leaderboardFinal: initialLeaderboardFinal,
    matchPlay: initialMatchPlay,
  });
  const state = useLiveBroadcastState(broadcast.seasonYear, broadcast.state, !preview);
  const activeEvent = useBroadcastQueue(broadcast.seasonYear, broadcast.events, broadcast.config, !preview);
  useReloadOnDisplayYearChange(broadcast.seasonYear, !preview);
  const mockElapsedMs = mockRun
    ? mockRun.offsetMs + (mockRun.startedAt ? Math.max(0, mockClock - mockRun.startedAt) : 0)
    : null;
  const animationTestElapsedMs = animationTest ? Math.max(0, mockClock - animationTest.startedAt) : null;
  const mockPosition = mockRun
    ? getMockRunPosition(mockElapsedMs ?? 0, mockRun.videoDurationMs)
    : null;
  const displayState = mockPosition
    ? { ...state, tournamentLive: true, automationMode: "producer" as const, currentScene: mockPosition.scene, videoPhase: mockPosition.videoPhase }
    : animationTest
      ? { ...state, tournamentLive: true, automationMode: "producer" as const, currentScene: "individual_leaderboard" as const, videoPhase: null }
    : state;

  return (
    <SceneRenderer
      state={displayState}
      config={broadcast.config}
      standings={standings}
      leaderboardFinal={leaderboardFinal}
      matchPlay={mockRun ? getMockMatchPlay(mockRun.seed) : matchPlay}
      holding={holding}
      activeEvent={activeEvent}
      activeVideo={broadcast.activeVideo}
      preview={preview}
      mockElapsedMs={mockElapsedMs ?? animationTestElapsedMs}
      mockVideoDurationMs={mockRun?.videoDurationMs ?? null}
      mockSeed={mockRun?.seed ?? animationTest?.seed ?? 1}
      mockLeaderboardAnimation={mockRun?.leaderboardAnimation ?? (animationTest ? { birdieEnabled: true, birdieDelayMs: 2000, rowMoveMs: 1000 } : null)}
      mockForcedEventKind={animationTest?.kind}
    />
  );
}
