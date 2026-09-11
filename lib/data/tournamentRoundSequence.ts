import type { RealMatch, Tournament } from "./types";

/**
 * Every day+session of the trip in chronological order, one entry each —
 * this IS the tournament's true round numbering (array index + 1 = the
 * real round number), Alternate Shot/Foursomes included even though those
 * rounds never get an individual scorecard archived (confirmed with Cade,
 * 2026-09-11 — a player doesn't play their own ball the whole round, so
 * there's no personal score to record). Assumes one day+session is always
 * played under a single format shared by the whole group, which is true
 * for every tournament recorded so far.
 */
export function tournamentRoundSequence(tournament: Pick<Tournament, "matches">): RealMatch[] {
  const bySession = new Map<string, RealMatch>();
  for (const match of tournament.matches) {
    const key = `${match.day}-${match.session}`;
    if (!bySession.has(key)) bySession.set(key, match);
  }
  return [...bySession.values()].sort((a, b) => sessionOrder(a) - sessionOrder(b));
}

function sessionOrder(match: RealMatch): number {
  return match.day * 2 + (match.session === "Afternoon" ? 1 : 0);
}
