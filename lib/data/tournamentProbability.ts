/** One match's chances, each 0–1 and summing to 1. */
export type MatchChance = { maroon: number; tie: number; white: number };

/** One point on the tournament win-probability graph. `x` is measured in rounds (0 = before play). */
export type TournamentOddsPoint = MatchChance & { x: number; label: string };

export const EVEN: MatchChance = { maroon: 1 / 3, tie: 1 / 3, white: 1 / 3 };

export function resultChance(result: "maroon" | "white" | "tie"): MatchChance {
  return result === "maroon" ? { maroon: 1, tie: 0, white: 0 } : result === "white" ? { maroon: 0, tie: 0, white: 1 } : { maroon: 0, tie: 1, white: 0 };
}

/**
 * Each match is worth one point (a tie splits it). Combines every match's
 * chances into the chance each team finishes with more points overall.
 */
export function tournamentProbability(matches: MatchChance[]): MatchChance {
  let distribution = new Map<number, number>([[0, 1]]);
  for (const match of matches) {
    const next = new Map<number, number>();
    for (const [margin, probability] of distribution) {
      for (const [change, chance] of [[2, match.maroon], [0, match.tie], [-2, match.white]] as const) {
        if (chance > 0) next.set(margin + change, (next.get(margin + change) ?? 0) + probability * chance);
      }
    }
    distribution = next;
  }
  let maroon = 0; let tie = 0; let white = 0;
  distribution.forEach((probability, margin) => { if (margin > 0) maroon += probability; else if (margin < 0) white += probability; else tie += probability; });
  return { maroon, tie, white };
}

/**
 * Past years never saved odds, so each point counts finished rounds as their
 * real result and every later (or unscored) match as even.
 */
export function historicalOddsSeries(rounds: ("maroon" | "white" | "tie" | null)[][]): TournamentOddsPoint[] {
  return Array.from({ length: rounds.length + 1 }, (_, done) => ({
    x: done,
    label: done === 0 ? "Start" : done === rounds.length ? "Final" : `After R${done}`,
    ...tournamentProbability(rounds.flatMap((round, index) => round.map((result) => index < done && result ? resultChance(result) : EVEN))),
  }));
}

/** A live-season match: its result once finished, plus its pre-round and latest official odds. */
export type LiveRoundMatch = { result: "maroon" | "white" | "tie" | null; thru: number; opening: MatchChance | null; latest: MatchChance | null };

/**
 * Live season: one point per finished round (later matches at their pre-round
 * odds), then a "Now" point using the latest odds, placed partway through the
 * round in progress.
 */
export function liveOddsSeries(rounds: LiveRoundMatch[][]): TournamentOddsPoint[] {
  const finished = rounds.findIndex((round) => round.some((match) => !match.result));
  const completed = finished === -1 ? rounds.length : finished;
  const points: TournamentOddsPoint[] = [];
  for (let done = 0; done <= completed; done++) {
    const chances = rounds.flatMap((round, index) => round.map((match) => index < done && match.result ? resultChance(match.result) : match.opening ?? match.latest ?? EVEN));
    points.push({ x: done, label: done === 0 ? "Start" : done === rounds.length ? "Final" : `After R${done}`, ...tournamentProbability(chances) });
  }
  if (completed === rounds.length) return points;
  const current = rounds[completed];
  const progress = current.reduce((sum, match) => sum + (match.result ? 18 : match.thru), 0) / (18 * current.length);
  const now = { ...tournamentProbability(rounds.flat().map((match) => match.result ? resultChance(match.result) : match.latest ?? match.opening ?? EVEN)) };
  if (progress === 0) points[points.length - 1] = { ...points[points.length - 1], ...now };
  else points.push({ x: completed + progress, label: `Now · R${completed + 1}`, ...now });
  return points;
}
