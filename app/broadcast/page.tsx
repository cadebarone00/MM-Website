import type { Metadata } from "next";
import { getBroadcastPayload } from "@/lib/broadcast/state";
import { getBroadcastLeaderboard } from "@/lib/broadcast/leaderboardData";
import { getBroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { getNextTournament } from "@/lib/data/activeSeasonOverlay";
import { BroadcastStage } from "@/components/broadcast/BroadcastStage";
import { DEFAULT_SCENE_DURATIONS_MS, type BroadcastPayload, type BroadcastPlayerVideo, type BroadcastScene } from "@/lib/broadcast/types";
import { isValidDisplayYear } from "@/lib/broadcast/displayYears";
import { getMockRunPosition } from "@/lib/broadcast/mockRun";

export const metadata: Metadata = {
  title: "Watch Live — The Maroon Masters",
};

export const dynamic = "force-dynamic";

const VALID_SCENES = ["holding", "individual_leaderboard", "match_play", "video_transition", "player_video"] as const;
type PreviewScene = (typeof VALID_SCENES)[number];

const PREVIEW_VIDEO: BroadcastPlayerVideo = {
  id: "preview-player-video", playerSlug: "cade-barone", playerName: "Cade Barone", round: 1, hole: 16, shotNumber: 1,
  par: 4, yards: 611, scoreToPar: -13, individualPlace: 1, courseName: "Maroon Masters Golf Club", format: "Singles",
  match: { team: "white", ownPlayers: ["Barone"], opposingPlayers: ["Sherrell"], ownStatus: "1 UP", opposingStatus: "1 DN" },
  videoUrl: "/loading/desktop.mp4",
};

function previewVideoFromParams(params: { [key: string]: string | undefined }): BroadcastPlayerVideo {
  const number = (key: string, fallback: number) => {
    const value = Number(params[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  const names = (key: string, fallback: string[]) => params[key]?.split(",").map((name) => name.trim()).filter(Boolean) ?? fallback;
  const team = params.videoTeam === "maroon" ? "maroon" : "white";
  const showMatch = params.videoMatch !== "0";
  return {
    ...PREVIEW_VIDEO,
    playerName: params.videoPlayer?.trim() || PREVIEW_VIDEO.playerName,
    individualPlace: number("videoPlace", PREVIEW_VIDEO.individualPlace ?? 1),
    scoreToPar: number("videoToPar", PREVIEW_VIDEO.scoreToPar ?? 0),
    round: number("videoRound", PREVIEW_VIDEO.round), hole: number("videoHole", PREVIEW_VIDEO.hole), par: number("videoPar", PREVIEW_VIDEO.par),
    yards: number("videoYards", PREVIEW_VIDEO.yards), shotNumber: number("videoShot", PREVIEW_VIDEO.shotNumber),
    courseName: params.videoCourse?.trim() || PREVIEW_VIDEO.courseName,
    format: params.videoFormat?.trim() || PREVIEW_VIDEO.format,
    videoUrl: params.videoUrl?.trim() || PREVIEW_VIDEO.videoUrl,
    match: showMatch
      ? {
          team,
          ownPlayers: names("videoOwn", PREVIEW_VIDEO.match?.ownPlayers ?? []),
          opposingPlayers: names("videoOpposing", PREVIEW_VIDEO.match?.opposingPlayers ?? []),
          ownStatus: params.videoOwnStatus?.trim() || PREVIEW_VIDEO.match?.ownStatus || "AS",
          opposingStatus: params.videoOpposingStatus?.trim() || PREVIEW_VIDEO.match?.opposingStatus || "AS",
        }
      : null,
  };
}

/**
 * `?preview=1&year=2026&scene=match_play` — Tiger Center's Broadcast
 * Controls rehearsal iframe (components/portal/tiger/BroadcastControlsPanel.tsx).
 * Renders that exact year/scene, statically, from URL params alone — never
 * reads or subscribes to the real broadcast_state/broadcast_display_year,
 * so it can never affect (or be affected by) the real, published broadcast.
 * Leaderboard/match-play data is still read live for the requested year —
 * that's real tournament data, not "the show" itself, so there's no reason
 * to fake it.
 */
function previewPayload(year: number, scene: PreviewScene, video: BroadcastPlayerVideo, mock = false): BroadcastPayload {
  const videoPhase = scene === "video_transition" ? "transition" : scene === "player_video" ? "playing" : null;
  return {
    seasonYear: year,
    state: {
      seasonYear: year,
      currentScene: scene === "video_transition" || scene === "player_video" ? "holding" : scene,
      sceneStartedAt: new Date().toISOString(),
      automationMode: "producer",
      paused: false,
      tournamentLive: true,
      overlayText: null,
      overlayExpiresAt: null,
      audioTrackId: null,
      audioStartedAt: null,
      audioLoopMode: "all",
      audioShuffle: false,
      videoPhase,
      activeVideoQueueId: videoPhase ? video.id : null,
      videoPhaseStartedAt: videoPhase ? new Date().toISOString() : null,
    },
    config: { seasonYear: year, sceneDurationsMs: DEFAULT_SCENE_DURATIONS_MS, overlayDurationMs: 6000, takeoverDurationMs: 8000 },
    events: [],
    activeVideo: videoPhase || mock ? video : null,
  };
}

export default async function BroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const previewYear = Number(params.year);
  const preview = params.preview === "1" && isValidDisplayYear(previewYear) && VALID_SCENES.includes(params.scene as PreviewScene);
  const mock = preview && params.mock === "1";
  const mockOffsetMs = Math.max(0, Number(params.mockOffset) || 0);
  const mockStartedAt = Number(params.mockStart);
  const mockVideoDurationMs = Math.max(1_000, Number(params.mockVideoDuration) || 16_000);
  const mockSeed = Number.isFinite(Number(params.mockSeed)) ? Number(params.mockSeed) : 1;
  const mockBirdieDelayMs = Math.max(0, Number(params.mockBirdieDelay) || 7000);
  const mockRowMoveMs = Math.max(0, Number(params.mockRowMove) || 1000);
  const mockRun = mock
    ? {
        startedAt: Number.isFinite(mockStartedAt) && mockStartedAt > 0 ? mockStartedAt : null,
        offsetMs: mockOffsetMs,
        videoDurationMs: mockVideoDurationMs,
        seed: mockSeed,
        leaderboardAnimation: { birdieEnabled: params.mockBirdieEnabled !== "0", birdieDelayMs: mockBirdieDelayMs, rowMoveMs: mockRowMoveMs },
      }
    : null;
  const animationTest = preview && (params.animationTest === "birdie" || params.animationTest === "eagle")
    ? {
        kind: params.animationTest as "birdie" | "eagle",
        startedAt: Number(params.animationTestStart) || Date.now(),
        seed: Number.isFinite(Number(params.animationTestSeed)) ? Number(params.animationTestSeed) : 1,
      }
    : null;
  const initialMockPosition = mockRun
    ? getMockRunPosition(mockRun.offsetMs + (mockRun.startedAt ? Math.max(0, Date.now() - mockRun.startedAt) : 0), mockRun.videoDurationMs)
    : null;

  const [broadcast, { standings, final: leaderboardFinal }, matchPlay, nextTournament] = await Promise.all([
    preview ? previewPayload(previewYear, initialMockPosition?.videoPhase === "transition" ? "video_transition" : initialMockPosition?.videoPhase === "playing" ? "player_video" : (initialMockPosition?.scene ?? params.scene as PreviewScene), previewVideoFromParams(params), mock) : getBroadcastPayload(),
    getBroadcastLeaderboard(preview ? previewYear : undefined),
    getBroadcastMatchPlay(preview ? previewYear : undefined),
    getNextTournament(),
  ]);

  return (
    <BroadcastStage
      broadcast={broadcast}
      standings={standings}
      leaderboardFinal={leaderboardFinal}
      matchPlay={matchPlay}
      holding={{ venue: nextTournament.venue, dateLabel: nextTournament.dateLabel }}
      preview={preview}
      mockRun={mockRun}
      animationTest={animationTest}
    />
  );
}
