// lib/broadcast/leaderboardData.ts
import { pastTournaments } from "@/lib/data";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { leaderboard } from "@/lib/live/scoring";
import { buildLiveTournamentSnapshot } from "./liveSnapshot";
import type { BroadcastStanding } from "./types";

export interface BroadcastLeaderboard {
  seasonYear: number;
  standings: BroadcastStanding[];
  /** True for an archived year (already finished) — the scene shows "Final" instead of "Live" against it. */
  final: boolean;
}

/**
 * Whole-tournament individual standings for whichever year Broadcast
 * Controls has picked. Two real sources, picked by year — not a config
 * flag — since which one applies is a fact about the data, not a choice:
 *
 * - A year with a static `pastTournaments` entry (2026 and earlier today)
 *   already has a finished tournament's real standings on hand
 *   (`Tournament.individualLeaderboard`) — no live_* rows exist for it.
 * - Anything else falls through to the live Supabase path (2027+).
 *
 * `overrideYear` is for the Broadcast Controls preview only (see
 * app/broadcast/page.tsx's `?preview=1`) — omit it and this resolves the
 * real published display year, exactly as /broadcast itself does.
 */
export async function getBroadcastLeaderboard(overrideYear?: number): Promise<BroadcastLeaderboard> {
  const seasonYear = overrideYear ?? (await getBroadcastDisplayYear());

  const archived = pastTournaments.find((t) => t.year === seasonYear);
  if (archived) {
    const standings: BroadcastStanding[] = [...archived.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
    return { seasonYear, standings, final: true };
  }

  const snapshot = await buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true });
  const standings: BroadcastStanding[] = leaderboard(snapshot).map((p) => ({ player: p.player, team: p.team, toPar: p.toPar }));
  return { seasonYear, standings, final: false };
}
