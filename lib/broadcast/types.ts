// lib/broadcast/types.ts
//
// Phase 1 shape only — see
// docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md.
// broadcast_events (the queue) doesn't exist yet; that's Phase 2.

export type BroadcastScene = "holding" | "individual_leaderboard" | "match_play";
export type BroadcastAutomationMode = "auto" | "producer";
export type BroadcastTeam = "maroon" | "white";

/** Minimal shape the Individual Leaderboard scene needs — deliberately not lib/live/scoring.ts's PlayerSummary, since standings can come from either the live season or an archived one (see lib/broadcast/leaderboardData.ts), and those two sources don't share a richer shape in common. */
export interface BroadcastStanding {
  player: string;
  team: BroadcastTeam;
  toPar: number;
}

export interface BroadcastState {
  seasonYear: number;
  currentScene: BroadcastScene;
  sceneStartedAt: string; // ISO timestamp
  automationMode: BroadcastAutomationMode;
  paused: boolean;
  tournamentLive: boolean;
  overlayText: string | null;
  overlayExpiresAt: string | null; // ISO timestamp; null whenever overlayText is null
}

export interface BroadcastConfig {
  seasonYear: number;
  sceneDurationsMs: Record<BroadcastScene, number>;
}

export interface BroadcastPayload {
  seasonYear: number;
  state: BroadcastState;
  config: BroadcastConfig;
}

export const DEFAULT_SCENE_DURATIONS_MS: Record<BroadcastScene, number> = {
  individual_leaderboard: 12000,
  match_play: 12000,
  holding: 10000,
};
