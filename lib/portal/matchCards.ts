// lib/portal/matchCards.ts
//
// Normalizes both archived (static per-year Tournament data) and live
// (Supabase live_* tables, via liveMatchCards.ts) match data into one shape
// for the "My Matches" box on the player portal
// (components/portal/PortalMatches.tsx) — deliberately styled after
// components/leaderboard/CompactMatchRow.tsx (box, team-filled colors,
// stacked last names) and reusing its label conventions rather than
// re-deriving them.
import { liveLabel } from "@/components/leaderboard/matchUtils";
import type { RealMatch, Tournament } from "@/lib/data/types";

export interface PortalMatchCard {
  id: string;
  status: "Live" | "Upcoming" | "Past";
  /** Course name for the top of the box; null when a live round's course hasn't been set yet. */
  course: string | null;
  /** e.g. "Round 2 · Fourball" (live/upcoming) or "Day 2 · Afternoon · Singles" (archived). */
  roundFormatLabel: string;
  maroonPlayers: string[];
  whitePlayers: string[];
  maroonOdds: number | null;
  whiteOdds: number | null;
  /** Bigger center line — match-play score, e.g. "2 Up", "AS", "3&2", or "VS" before tee-off. */
  statusLabel: string;
  /** Smaller center line underneath — "Thru 8" while live, "Final" once decided, or the tee time while upcoming. */
  progressLabel: string;
}

export function archivedMatchCard(tournament: Tournament, match: RealMatch): PortalMatchCard {
  return {
    id: match.id,
    status: "Past",
    course: tournament.venue,
    roundFormatLabel: `Day ${match.day} · ${match.session} · ${match.format}`,
    maroonPlayers: match.maroonPlayers,
    whitePlayers: match.whitePlayers,
    maroonOdds: match.maroonWinProbability ?? null,
    whiteOdds: match.whiteWinProbability ?? null,
    statusLabel: liveLabel(match),
    progressLabel: "Final",
  };
}

/** Same shape as matchUtils' matchLabel/liveLabel, for a live official-state result instead of a static RealMatch. */
function liveStatusLabel(leader: "maroon" | "white" | "tie", margin: number, holesRemaining: number, final: boolean): string {
  if (leader === "tie") return "AS";
  if (final && holesRemaining > 0) return `${margin}&${holesRemaining}`;
  return `${margin} Up`;
}

export interface LiveMatchCardInput {
  id: string;
  status: "Live" | "Upcoming" | "Past";
  course: string | null;
  round: number;
  format: string;
  maroonPlayers: string[];
  whitePlayers: string[];
  teeTime: Date;
  official: { leader: "maroon" | "white" | "tie"; margin: number; thru: number; mathematicallyComplete: boolean } | null;
  maroonOdds: number | null;
  whiteOdds: number | null;
}

export function liveMatchCard(input: LiveMatchCardInput): PortalMatchCard {
  const base = {
    id: input.id,
    status: input.status,
    course: input.course,
    roundFormatLabel: `Round ${input.round} · ${input.format}`,
    maroonPlayers: input.maroonPlayers,
    whitePlayers: input.whitePlayers,
    maroonOdds: input.maroonOdds,
    whiteOdds: input.whiteOdds,
  };

  if (input.status === "Upcoming") {
    const teeTimeLabel = input.teeTime.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    });
    return { ...base, statusLabel: "VS", progressLabel: `${teeTimeLabel} CT` };
  }

  const official = input.official;
  const holesRemaining = official ? Math.max(0, 18 - official.thru) : 18;
  const final = input.status === "Past" || Boolean(official?.mathematicallyComplete);
  return {
    ...base,
    statusLabel: official ? liveStatusLabel(official.leader, official.margin, holesRemaining, final) : "AS",
    progressLabel: final ? "Final" : official && official.thru > 0 ? `Thru ${official.thru}` : "—",
  };
}
