// lib/broadcast/leaderboardData.ts
import { pastTournaments } from "@/lib/data";
import { careerArchiveRecords } from "@/lib/data/careerArchive";
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
 * TDY and THRU are round-specific values, unlike the tournament total. We
 * prefer an actively live own-ball round. Between rounds, they fall back to
 * the most recent completed own-ball round. Foursome is a shared ball and is
 * deliberately not an individual-stat sample.
 */
function liveStandings(snapshot: Awaited<ReturnType<typeof buildLiveTournamentSnapshot>>): BroadcastStanding[] {
  const totals = leaderboard(snapshot);
  const liveRound = Math.max(...snapshot.matchBoxes.filter((box) => box.state === "Live").map((box) => box.round), 0);
  const liveFormat = liveRound ? snapshot.matchBoxes.find((box) => box.round === liveRound)?.format : null;
  const individualRounds = new Set(snapshot.matchBoxes.filter((box) => box.format !== "Foursome").map((box) => box.round));
  const mostRecentIndividualRound = Math.max(
    ...[...snapshot.scores.values()]
      .filter((score) => score.score != null && score.score > 0 && individualRounds.has(score.round))
      .map((score) => score.round),
    0
  );
  const roundForTdy = liveRound ? (liveFormat === "Foursome" ? 0 : liveRound) : mostRecentIndividualRound;
  const today = roundForTdy ? new Map(leaderboard(snapshot, [roundForTdy]).map((entry) => [entry.player, entry])) : null;

  return totals.map((entry) => {
    const round = today?.get(entry.player);
    return {
      player: entry.player,
      team: entry.team,
      toPar: entry.toPar,
      todayToPar: round && round.played > 0 ? round.toPar : null,
      thru: round && round.played > 0 ? Math.min(18, round.played) : null,
    };
  });
}

function archiveKey(player: string) {
  return player.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Completed years read TDY directly from the reconciled per-hole archive. */
function archivedStandings(year: number, standings: BroadcastStanding[]): BroadcastStanding[] {
  const roundTotals = new Map<string, { player: string; round: number; toPar: number; holes: number }>();
  for (const record of careerArchiveRecords) {
    if (record.year !== year || record.format === "Foursome" || record.format === "Alternate Shot" || record.score <= 0) continue;
    const key = `${archiveKey(record.player)}:${record.round}`;
    const current = roundTotals.get(key) ?? { player: record.player, round: record.round, toPar: 0, holes: 0 };
    current.toPar += record.score - record.par;
    current.holes += 1;
    roundTotals.set(key, current);
  }

  const latestByPlayer = new Map<string, { round: number; toPar: number; holes: number }>();
  for (const round of roundTotals.values()) {
    const key = archiveKey(round.player);
    const current = latestByPlayer.get(key);
    if (!current || round.round > current.round) {
      latestByPlayer.set(key, { round: round.round, toPar: round.toPar, holes: round.holes });
    }
  }

  return standings.map((standing) => {
    const latest = latestByPlayer.get(archiveKey(standing.player));
    return { ...standing, todayToPar: latest?.toPar ?? null, thru: latest ? Math.min(18, latest.holes) : null };
  });
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
    const standings = archivedStandings(seasonYear, [...archived.individualLeaderboard].sort((a, b) => a.toPar - b.toPar));
    return { seasonYear, standings, final: true };
  }

  const snapshot = await buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true });
  const standings = liveStandings(snapshot);
  return { seasonYear, standings, final: false };
}
