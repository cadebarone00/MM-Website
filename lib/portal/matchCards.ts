// lib/portal/matchCards.ts
//
// Normalizes both archived (static per-year Tournament data) and live
// (Supabase live_* tables, via liveMatchCards.ts) match data into one shape
// for the "My Matches" box on the player portal
// (components/portal/PortalMatches.tsx) — deliberately styled after
// components/leaderboard/CompactMatchRow.tsx (box, team-filled colors,
// stacked last names, winner-filled center) and reusing its label
// conventions rather than re-deriving them.
import { liveLabel, matchLeader } from "@/components/leaderboard/matchUtils";
import { getPlayerSlug } from "@/lib/data/players";
import type { PlayerScorecard, RealMatch, Team, Tournament } from "@/lib/data/types";

export interface PortalMatchCard {
  id: string;
  status: "Live" | "Upcoming" | "Past";
  /** Course name for the top of the box; null when a live round's course hasn't been set yet, or an archived round has no scorecard on file. */
  course: string | null;
  /** e.g. "Round 2 · Fourball" (live/upcoming) or "Round 4 · Afternoon · Singles" (archived). */
  roundFormatLabel: string;
  maroonPlayers: string[];
  whitePlayers: string[];
  maroonOdds: number | null;
  whiteOdds: number | null;
  /** Bigger center line — match-play score, e.g. "2 Up", "AS", "3&2", or "VS" before tee-off. */
  statusLabel: string;
  /** Smaller center line underneath — "Thru 8" while live, "Final" once decided, or the tee time while upcoming. */
  progressLabel: string;
  /** Winning side once decided, for the center box's win fill (see CompactMatchRow's finalLabelColor); null while undecided. */
  leader: Team | "tie" | null;
}

/**
 * The Nth session `playerSlug` played, in chronological (day, then Morning
 * before Afternoon) order — 1-indexed to match `RoundScorecard.round` from
 * the archived scorecard database (lib/data/archivedScorecards.ts). Per-
 * player (not a tournament-wide session count) so it stays correct even if
 * a player sits out a session some year.
 */
function playerRoundNumber(tournament: Tournament, playerSlug: string, day: number, session: string): number | null {
  const sessions = tournament.matches
    .filter((m) => [...m.maroonPlayers, ...m.whitePlayers].some((p) => getPlayerSlug(p) === playerSlug))
    .map((m) => ({ day: m.day, session: m.session }));
  const unique = [...new Map(sessions.map((s) => [`${s.day}|${s.session}`, s])).values()].sort(
    (a, b) => a.day - b.day || (a.session === b.session ? 0 : a.session === "Morning" ? -1 : 1)
  );
  const index = unique.findIndex((s) => s.day === day && s.session === session);
  return index === -1 ? null : index + 1;
}

/** Course + round number for one archived match, read from the real per-round scorecard archive rather than the tournament's single `venue` field. Falls back to `match.day` / the venue when no scorecard is on file for that session. */
function archivedRoundAndCourse(tournament: Tournament, match: RealMatch, scorecards: PlayerScorecard[]): { round: number; course: string | null } {
  for (const slug of [...match.maroonPlayers, ...match.whitePlayers]) {
    const playerSlug = getPlayerSlug(slug);
    const roundNumber = playerRoundNumber(tournament, playerSlug, match.day, match.session);
    if (roundNumber == null) continue;
    const card = scorecards.find((c) => getPlayerSlug(c.player) === playerSlug);
    const round = card?.rounds.find((r) => r.round === roundNumber);
    if (round) return { round: roundNumber, course: round.course };
  }
  return { round: match.day, course: tournament.venue };
}

export function archivedMatchCard(tournament: Tournament, match: RealMatch, scorecards: PlayerScorecard[]): PortalMatchCard {
  const { round, course } = archivedRoundAndCourse(tournament, match, scorecards);
  return {
    id: match.id,
    status: "Past",
    course,
    roundFormatLabel: `Round ${round} · ${match.session} · ${match.format}`,
    maroonPlayers: match.maroonPlayers,
    whitePlayers: match.whitePlayers,
    maroonOdds: match.maroonWinProbability ?? null,
    whiteOdds: match.whiteWinProbability ?? null,
    statusLabel: liveLabel(match),
    progressLabel: "Final",
    leader: matchLeader(match),
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
    return { ...base, statusLabel: "VS", progressLabel: `${teeTimeLabel} CT`, leader: null };
  }

  const official = input.official;
  const holesRemaining = official ? Math.max(0, 18 - official.thru) : 18;
  const final = input.status === "Past" || Boolean(official?.mathematicallyComplete);
  return {
    ...base,
    statusLabel: official ? liveStatusLabel(official.leader, official.margin, holesRemaining, final) : "AS",
    progressLabel: final ? "Final" : official && official.thru > 0 ? `Thru ${official.thru}` : "—",
    leader: final ? (official?.leader ?? null) : null,
  };
}
