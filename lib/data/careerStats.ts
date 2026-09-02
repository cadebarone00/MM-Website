import type { PlayerScorecard } from "./types";

export type CareerScorecardSet = { year: number; scorecards: PlayerScorecard[] };

export type CareerPlayerStat = {
  player: string;
  years: number[];
  rounds: number;
  holes: number;
  totalStrokes: number;
  averageRound: number;
  averageHole: number;
  bestRound: number;
  worstRound: number;
  eagleOrBetter: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublesOrWorse: number;
  byYear: { year: number; rounds: number; averageRound: number; averageHole: number }[];
};

type MutableStat = Omit<CareerPlayerStat, "averageRound" | "averageHole" | "bestRound" | "worstRound" | "byYear"> & {
  roundTotals: number[];
  byYearMap: Map<number, { rounds: number; holes: number; strokes: number }>;
};

/** Rebuilds the career snapshot from the same archived hole records Tiger edits. */
export function buildCareerStats(sets: CareerScorecardSet[]): CareerPlayerStat[] {
  const players = new Map<string, MutableStat>();

  for (const { year, scorecards } of sets) {
    for (const scorecard of scorecards) {
      const stat: MutableStat = players.get(scorecard.player) ?? {
        player: scorecard.player,
        years: [],
        rounds: 0,
        holes: 0,
        totalStrokes: 0,
        eagleOrBetter: 0,
        birdies: 0,
        pars: 0,
        bogeys: 0,
        doublesOrWorse: 0,
        roundTotals: [],
        byYearMap: new Map(),
      };
      if (!stat.years.includes(year)) stat.years.push(year);

      for (const round of scorecard.rounds) {
        const holes = round.holes.filter((hole) => hole.score > 0);
        if (holes.length === 0) continue;
        const strokes = holes.reduce((total, hole) => total + hole.score, 0);
        stat.rounds += 1;
        stat.holes += holes.length;
        stat.totalStrokes += strokes;
        stat.roundTotals.push(strokes);
        const yearly = stat.byYearMap.get(year) ?? { rounds: 0, holes: 0, strokes: 0 };
        yearly.rounds += 1;
        yearly.holes += holes.length;
        yearly.strokes += strokes;
        stat.byYearMap.set(year, yearly);

        for (const hole of holes) {
          const diff = hole.score - hole.par;
          if (diff <= -2) stat.eagleOrBetter += 1;
          else if (diff === -1) stat.birdies += 1;
          else if (diff === 0) stat.pars += 1;
          else if (diff === 1) stat.bogeys += 1;
          else stat.doublesOrWorse += 1;
        }
      }
      players.set(scorecard.player, stat);
    }
  }

  return [...players.values()]
    .map(({ roundTotals, byYearMap, ...stat }) => ({
      ...stat,
      years: stat.years.sort((a, b) => a - b),
      averageRound: stat.rounds ? stat.totalStrokes / stat.rounds : 0,
      averageHole: stat.holes ? stat.totalStrokes / stat.holes : 0,
      bestRound: Math.min(...roundTotals),
      worstRound: Math.max(...roundTotals),
      byYear: [...byYearMap.entries()].sort(([a], [b]) => a - b).map(([year, value]) => ({
        year,
        rounds: value.rounds,
        averageRound: value.strokes / value.rounds,
        averageHole: value.strokes / value.holes,
      })),
    }))
    .sort((a, b) => a.averageRound - b.averageRound);
}
