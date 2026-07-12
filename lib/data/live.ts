import { upcoming2027 } from "./2027-upcoming";
import type { IndividualStanding, PlayerScorecard, RealMatch, Tournament } from "./types";

export interface LiveFeedPayload {
  roster?: { maroon: string[]; white: string[] };
  individualLeaderboard?: IndividualStanding[];
  leaderboard?: IndividualStanding[];
  scorecards?: PlayerScorecard[];
  matches?: RealMatch[];
  matchBoxes?: unknown[];
  maroonPts?: number;
  whitePts?: number;
  warnings?: string[];
  updatedAt?: string;
}

function matchPoints(matches: RealMatch[], team: "maroon" | "white"): number {
  return matches.reduce((total, match) => total + (team === "maroon" ? match.maroonPts : match.whitePts), 0);
}

export function mergeLiveTournament(payload: LiveFeedPayload | null): Tournament {
  const base = upcoming2027;
  const matches = payload?.matches ?? [];
  const maroonPts = typeof payload?.maroonPts === "number" ? payload.maroonPts : matchPoints(matches, "maroon");
  const whitePts = typeof payload?.whitePts === "number" ? payload.whitePts : matchPoints(matches, "white");

  return {
    slug: base.slug,
    editionLabel: base.editionLabel,
    year: base.year,
    venue: base.venue,
    location: base.location,
    dateLabel: base.dateLabel,
    startDate: base.startDate,
    endDate: base.endDate,
    roster: payload?.roster ?? base.roster ?? { maroon: [], white: [] },
    maroonPts,
    whitePts,
    pointsAvailable: 33,
    pointsToWin: 17,
    matches,
    individualLeaderboard: payload?.individualLeaderboard ?? payload?.leaderboard ?? [],
    scorecards: payload?.scorecards ?? [],
    notes: base.notes,
  };
}
