import type { RealMatch, IndividualStanding, Tournament } from "@/lib/data/types";
import type { PropMarket, FutureLadderEntry, TeamFutureOdds } from "./types";

/**
 * Deterministic pseudo-random placeholder odds — every function here is
 * seeded off IDs already in the data, so the same match/player always
 * produces the same mock odds, but nothing here reacts to live match
 * state. This is explicitly a stand-in for a real, stats-driven odds
 * engine (a later phase); it's meant to be replaced wholesale, not
 * extended.
 */
function seededFraction(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 10000) / 10000;
}

export function matchWinnerOdds(match: RealMatch): { maroon: number; white: number } {
  const r = seededFraction(`match-winner-${match.id}`);
  const favorite = -120 - Math.round(r * 200); // -120 to -320
  const underdog = 100 + Math.round(r * 220); // +100 to +320
  return r < 0.5 ? { maroon: favorite, white: underdog } : { maroon: underdog, white: favorite };
}

const PROP_STAT_TYPES: { label: string; baseLine: number; lineSpread: number }[] = [
  { label: "Strokes (this match)", baseLine: 70, lineSpread: 6 },
  { label: "Birdies (this match)", baseLine: 2, lineSpread: 3 },
];

export function matchPropMarkets(match: RealMatch): PropMarket[] {
  const players = [...match.maroonPlayers, ...match.whitePlayers];
  return players.flatMap((player) =>
    PROP_STAT_TYPES.map((stat) => {
      const lineSeed = seededFraction(`prop-line-${match.id}-${player}-${stat.label}`);
      // Always lands on a half-line (X.5) so a market never pushes.
      const line = Math.round(stat.baseLine + lineSeed * stat.lineSpread) + 0.5;
      return {
        id: `prop-${match.id}-${player}-${stat.label}`,
        matchId: match.id,
        player,
        statLabel: stat.label,
        line,
        overOdds: -110,
        underOdds: -110,
      };
    })
  );
}

export function tournamentWinnerLadder(standings: IndividualStanding[]): FutureLadderEntry[] {
  return standings
    .map((standing) => ({
      player: standing.player,
      odds: 300 + Math.round(seededFraction(`future-player-${standing.player}`) * 4000),
    }))
    .sort((a, b) => a.odds - b.odds);
}

export function teamWinnerOdds(tournament: Tournament): TeamFutureOdds {
  const r = seededFraction(`future-team-${tournament.slug}`);
  const maroonFavored = r < 0.5;
  const favorite = -130 - Math.round(r * 100);
  const underdog = 110 + Math.round(r * 100);
  return maroonFavored ? { maroon: favorite, white: underdog } : { maroon: underdog, white: favorite };
}
