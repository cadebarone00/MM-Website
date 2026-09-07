"use client";

import type { BroadcastConfig, BroadcastPlayerVideo, BroadcastStanding, BroadcastState } from "@/lib/broadcast/types";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import type { ActiveBroadcastEvent } from "@/lib/broadcast/eventDisplay";
import { useAutoScene } from "@/lib/broadcast/useAutoScene";
import { IndividualLeaderboardScene } from "./scenes/IndividualLeaderboardScene";
import { MatchPlayScene } from "./scenes/MatchPlayScene";
import { HoldingScene } from "./scenes/HoldingScene";
import { OverlayLayer } from "./OverlayLayer";
import { EventOverlay } from "./EventOverlay";
import { EventTakeover } from "./EventTakeover";
import { PlayerVideoTransitionScene } from "./scenes/PlayerVideoTransitionScene";
import { PlayerVideoScene } from "./scenes/PlayerVideoScene";

export function SceneRenderer({
  state,
  config,
  standings,
  leaderboardFinal,
  matchPlay,
  holding,
  activeEvent,
  activeVideo,
  preview = false,
  mockElapsedMs = null,
  mockVideoDurationMs = null,
  mockSeed = 1,
  mockLeaderboardAnimation = null,
}: {
  state: BroadcastState;
  config: BroadcastConfig;
  standings: BroadcastStanding[];
  leaderboardFinal: boolean;
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
  activeEvent: ActiveBroadcastEvent | null;
  activeVideo: BroadcastPlayerVideo | null;
  preview?: boolean;
  mockElapsedMs?: number | null;
  mockVideoDurationMs?: number | null;
  mockSeed?: number;
  mockLeaderboardAnimation?: { birdieEnabled: boolean; birdieDelayMs: number; rowMoveMs: number } | null;
}) {
  const isAuto = state.automationMode === "auto";
  // Producer Mode (including a host's Pause — see BroadcastControlsPanel):
  // no rotation timer running, current_scene is shown statically. Called
  // unconditionally either way — Rules of Hooks — the hook itself no-ops
  // internally when isAuto is false.
  // Freeze rotation while a takeover is showing — resumes from whatever
  // scene current elapsed time says should be playing once it ends (not
  // necessarily the one that was showing when the takeover began — see
  // the spec's Rendering section for why that's accepted, not a bug).
  const autoScene = useAutoScene(state.sceneStartedAt, config, isAuto && activeEvent?.displayMode !== "takeover");
  // Before Tiger hits "Go Live" (Broadcast Controls), the show holds on
  // this scene regardless of rotation/producer mode — same as a real
  // broadcast's pre-show hold (spec §7/§17's Holding scene).
  const scene = !state.tournamentLive ? "holding" : isAuto ? autoScene : state.currentScene;

  return (
    <>
      {(state.tournamentLive || preview) && state.videoPhase === "transition" && activeVideo ? (
        <PlayerVideoTransitionScene video={activeVideo} startedAt={state.videoPhaseStartedAt} preview={preview} />
      ) : (state.tournamentLive || preview) && state.videoPhase === "playing" && activeVideo ? (
        <PlayerVideoScene video={activeVideo} preview={preview} />
      ) : activeEvent?.displayMode === "takeover" ? (
        <EventTakeover event={activeEvent} matchPlay={matchPlay} />
      ) : (
        <>
          {scene === "individual_leaderboard" && <IndividualLeaderboardScene standings={standings} final={leaderboardFinal} mockElapsedMs={mockElapsedMs} mockVideoDurationMs={mockVideoDurationMs} mockSeed={mockSeed} mockAnimation={mockLeaderboardAnimation} />}
          {scene === "match_play" && <MatchPlayScene matchPlay={matchPlay} />}
          {scene === "holding" && <HoldingScene venue={holding.venue} dateLabel={holding.dateLabel} />}
          <EventOverlay event={activeEvent} matchPlay={matchPlay} />
        </>
      )}
      <OverlayLayer text={state.overlayText} expiresAt={state.overlayExpiresAt} />
    </>
  );
}
