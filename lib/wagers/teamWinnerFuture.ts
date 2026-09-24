import type { Market } from "./marketKeys";

/**
 * Team Winner (Maroon vs White) future — which team finishes the whole event
 * with more points. Every match is worth 1 point (a halved match is 0.5 each),
 * so the tournament can end tied.
 *
 * Pure: no database access. The server layer (teamWinnerPricing.ts) supplies
 * the rounds, the roster, and a table of per-matchup odds produced by the
 * canonical match model (lib/odds/preRoundSingles.ts) and live match
 * snapshots; this module only combines them.
 */

export type Side = "maroon" | "white";
export type Result = Side | "tie";
export type Outcome = { maroon: number; tie: number; white: number };
export type FutureFormat = "Singles" | "Fourball" | "Foursome";

export type FutureMatch = {
  maroon: string[];
  white: string[];
  /** Official result once the match is mathematically complete. */
  result: Result | null;
  /** Latest odds for a paired, unfinished match. */
  odds: Outcome | null;
};

export type FutureRound = {
  round: number;
  format: FutureFormat;
  courseKey: string;
  /** null until Tiger locks this round's pairings. */
  matches: FutureMatch[] | null;
};

export type Roster = { maroon: string[]; white: string[] };

export const TEAM_WINNER_SIMULATIONS = 10_000;
export const TEAM_WINNER_MODEL_VERSION = "team-winner-monte-carlo-v1";

export function teamWinnerMarketKey(seasonYear: number): string {
  return `team-winner:${seasonYear}`;
}

export function sideSize(format: FutureFormat): 1 | 2 {
  return format === "Singles" ? 1 : 2;
}

/** Stable key for one matchup's odds in the pair table. Order within a side never matters. */
export function pairKey(format: FutureFormat, courseKey: string, maroon: string[], white: string[]): string {
  return `${format}|${courseKey}|${[...maroon].sort().join("+")}|${[...white].sort().join("+")}`;
}

/** Every side Tiger could post from one team: each player (Singles) or each two-player partnership. */
export function possibleSides(players: string[], size: 1 | 2): string[][] {
  if (size === 1) return players.map((player) => [player]);
  const sides: string[][] = [];
  for (let i = 0; i < players.length; i += 1) for (let j = i + 1; j < players.length; j += 1) sides.push([players[i], players[j]]);
  return sides;
}

/** Every matchup an unpaired round could produce — the pair-table entries it needs. */
export function possibleMatchups(round: FutureRound, roster: Roster): { key: string; maroon: string[]; white: string[] }[] {
  const size = sideSize(round.format);
  const maroonSides = possibleSides(roster.maroon, size);
  const whiteSides = possibleSides(roster.white, size);
  return maroonSides.flatMap((maroon) => whiteSides.map((white) => ({ key: pairKey(round.format, round.courseKey, maroon, white), maroon, white })));
}

/** How many matches an unpaired round holds: every player plays, sides are split evenly. */
export function unpairedMatchCount(format: FutureFormat, roster: Roster): number {
  const size = sideSize(format);
  return Math.min(Math.floor(roster.maroon.length / size), Math.floor(roster.white.length / size));
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** One random, legal set of pairings for an unpaired round. */
export function randomPairings(round: FutureRound, roster: Roster, random: () => number): { maroon: string[]; white: string[] }[] {
  const size = sideSize(round.format);
  const count = unpairedMatchCount(round.format, roster);
  const maroon = shuffled(roster.maroon, random);
  const white = shuffled(roster.white, random);
  return Array.from({ length: count }, (_, index) => ({
    maroon: maroon.slice(index * size, index * size + size),
    white: white.slice(index * size, index * size + size),
  }));
}

const RESULT_POINTS: Record<Result, { maroon: number; white: number }> = {
  maroon: { maroon: 1, white: 0 },
  white: { maroon: 0, white: 1 },
  tie: { maroon: 0.5, white: 0.5 },
};

export type TeamPoints = { maroon: number; white: number; remaining: number };

/** Points already banked, plus how many match points are still to be played. */
export function teamPoints(rounds: FutureRound[], roster: Roster): TeamPoints {
  const points = { maroon: 0, white: 0, remaining: 0 };
  for (const round of rounds) {
    if (!round.matches) {
      points.remaining += unpairedMatchCount(round.format, roster);
      continue;
    }
    for (const match of round.matches) {
      if (match.result) {
        points.maroon += RESULT_POINTS[match.result].maroon;
        points.white += RESULT_POINTS[match.result].white;
      } else {
        points.remaining += 1;
      }
    }
  }
  return points;
}

/** The team result once nothing left to play can change it; null while it is still open. */
export function decidedResult(points: TeamPoints): Result | null {
  if (points.maroon > points.white + points.remaining) return "maroon";
  if (points.white > points.maroon + points.remaining) return "white";
  if (points.remaining === 0) return "tie";
  return null;
}

export type Matchup = { key: string; format: FutureFormat; courseKey: string; maroon: string[]; white: string[] };

/** Pair-table entries (or live odds) the simulation needs but doesn't have. */
export function missingOdds(rounds: FutureRound[], roster: Roster, pairTable: Map<string, Outcome>): Matchup[] {
  const missing = new Map<string, Matchup>();
  const need = (round: FutureRound, maroon: string[], white: string[]) => {
    const key = pairKey(round.format, round.courseKey, maroon, white);
    if (!pairTable.has(key)) missing.set(key, { key, format: round.format, courseKey: round.courseKey, maroon, white });
  };
  for (const round of rounds) {
    if (!round.matches) {
      for (const matchup of possibleMatchups(round, roster)) need(round, matchup.maroon, matchup.white);
      continue;
    }
    for (const match of round.matches) if (!match.result && !match.odds) need(round, match.maroon, match.white);
  }
  return [...missing.values()];
}

function sample(outcome: Outcome, random: () => number): Result {
  const roll = random();
  if (roll < outcome.maroon) return "maroon";
  if (roll < outcome.maroon + outcome.tie) return "tie";
  return "white";
}

/**
 * Plays the rest of the tournament `simulations` times. Finished matches keep
 * their real result; paired matches draw from their latest odds; unpaired
 * rounds draw a fresh random set of legal pairings in every simulation.
 * Callers must check missingOdds() first.
 */
export function simulateTeamWinner({
  rounds,
  roster,
  pairTable,
  simulations = TEAM_WINNER_SIMULATIONS,
  random = Math.random,
}: {
  rounds: FutureRound[];
  roster: Roster;
  pairTable: Map<string, Outcome>;
  simulations?: number;
  random?: () => number;
}): Outcome {
  const tally = { maroon: 0, tie: 0, white: 0 };
  for (let run = 0; run < simulations; run += 1) {
    let maroon = 0;
    let white = 0;
    for (const round of rounds) {
      const matches = round.matches ?? randomPairings(round, roster, random).map((pairing) => ({ ...pairing, result: null, odds: null }));
      for (const match of matches) {
        const result = match.result ?? sample(match.odds ?? pairTable.get(pairKey(round.format, round.courseKey, match.maroon, match.white))!, random);
        maroon += RESULT_POINTS[result].maroon;
        white += RESULT_POINTS[result].white;
      }
    }
    tally[maroon > white ? "maroon" : white > maroon ? "white" : "tie"] += 1;
  }
  return { maroon: tally.maroon / simulations, tie: tally.tie / simulations, white: tally.white / simulations };
}

/** Fair (no vig) American odds; null when an outcome is certain or impossible. */
export function fairAmericanOdds(probability: number): number | null {
  if (probability <= 0 || probability >= 1) return null;
  return probability >= 0.5 ? -Math.round((100 * probability) / (1 - probability)) : Math.round((100 * (1 - probability)) / probability);
}

export type TeamWinnerOdds = { maroon: number | null; tie: number | null; white: number | null };

export function teamWinnerMarket(seasonYear: number, odds: TeamWinnerOdds): Market {
  const selections = [
    { key: "maroon", label: `Maroon wins the ${seasonYear} Maroon Masters`, odds: odds.maroon },
    { key: "tie", label: `The ${seasonYear} Maroon Masters ends tied`, odds: odds.tie },
    { key: "white", label: `White wins the ${seasonYear} Maroon Masters`, odds: odds.white },
  ];
  return {
    marketKey: teamWinnerMarketKey(seasonYear),
    groupLabel: "Maroon vs White",
    selections: selections.filter((selection): selection is { key: string; label: string; odds: number } => selection.odds !== null),
  };
}
