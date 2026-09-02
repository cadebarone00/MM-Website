// lib/broadcast/leaderboardData.ts
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { leaderboard, type PlayerSummary } from "@/lib/live/scoring";
import { buildLiveTournamentSnapshot } from "./liveSnapshot";

export interface BroadcastLeaderboard {
  seasonYear: number;
  standings: PlayerSummary[];
}

/** Whole-tournament individual standings for whichever season is active — what the broadcast's Individual Leaderboard scene shows. */
export async function getBroadcastLeaderboard(): Promise<BroadcastLeaderboard> {
  const seasonYear = await getActiveSeasonYear();
  const snapshot = await buildLiveTournamentSnapshot(seasonYear);
  return { seasonYear, standings: leaderboard(snapshot) };
}
