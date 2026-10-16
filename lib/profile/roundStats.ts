import { calculateHandicapIndex, calculateLowIndex } from "@/lib/handicap/whs";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";

/**
 * Profile → Stats: everything the saved rounds can honestly tell us, worked out in one place so it's easy to test.
 * Hole-by-hole numbers only use holes that recorded them (stats are optional when scoring), and every section says how
 * many rounds / holes it is based on. Nothing is guessed: no data = that section is left out.
 *
 * Old Maroon rounds (source "legacy") only stored hits: a missed fairway / green came through blank, the same as "not
 * recorded". So in a legacy round that recorded at least one hit for that stat, a blank counts as a miss (direction
 * unknown); a legacy round with no hits at all for it is treated as not tracked.
 */

/** One round on the to-par trend: only rounds whose card has every hole's par (9 or 18 holes). */
export interface ScoreTrendPoint { date: string; total: number; course: string; toPar: number; holes: number }
export interface RoundStats {
  rounds: number;
  eighteens: number;
  nines: number;
  average18: number | null;
  /**
   * Handicap-style 18-hole average: every hole capped at double bogey (par + 2) before adding up, so one blow-up hole
   * doesn't drag it. Only 18-hole rounds with a full hole-by-hole card count. (The official WHS cap is net double bogey,
   * which needs hole stroke indexes the rounds don't store.)
   */
  adjustedAverage18: number | null;
  best18: { total: number; course: string; date: string } | null;
  average9: number | null;
  handicapIndex: number | null;
  lowIndex: number | null;
  countingRounds: number;
  /** Last 20 rounds with a full card (9 or 18 holes), oldest first, as strokes to par. */
  trend: ScoreTrendPoint[];
  /** Per 18 holes, from rounds with a hole-by-hole card. */
  scoring: { holes: number; eagles: number; birdies: number; pars: number; bogeys: number; doubles: number;
    /** Share of holes: birdie or better, par or better, double bogey or worse. */
    birdiePct: number; parOrBetterPct: number; doublePct: number } | null;
  /** Average strokes and strokes over par, by hole par. */
  byPar: { par: 3 | 4 | 5; holes: number; average: number; overPar: number }[];
  putting: { holes: number; perRound: number; threePuttPct: number; onePuttPct: number } | null;
  /** Miss left / right are shares of the misses whose direction was recorded (null when none were). */
  driving: { holes: number; fairwayPct: number; missLeftPct: number | null; missRightPct: number | null } | null;
  approach: { holes: number; girPct: number } | null;
  /** Par or better after missing the green. */
  scrambling: { chances: number; pct: number } | null;
  courses: { name: string; rounds: number; best: number | null }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;

export function roundStats(rounds: ProfileHistoryRound[]): RoundStats | null {
  if (!rounds.length) return null;
  const newestFirst = [...rounds].sort((a, b) => b.datePlayed.localeCompare(a.datePlayed) || b.id.localeCompare(a.id));
  const eighteens = newestFirst.filter((r) => r.holesPlayed === 18);
  const nines = newestFirst.filter((r) => r.holesPlayed === 9);
  const counting = newestFirst.filter((r) => r.countsForHandicap && r.differential !== null).map((r) => r.differential as number);
  const fullCards = eighteens.filter((r) => r.holes.length === 18 && r.holes.every((h) => Number.isInteger(h.par) && Number.isInteger(h.strokes)));
  const capped = fullCards.map((r) => r.holes.reduce((s, h) => s + Math.min(h.strokes, h.par + 2), 0));
  const best = eighteens.reduce<ProfileHistoryRound | null>((low, r) => !low || r.total < low.total ? r : low, null);
  type Shot = "center" | "left" | "right" | "up" | "down" | "miss" | null;
  const holes = newestFirst.flatMap((r) => {
    const legacy = r.source === "legacy";
    const fairwaysTracked = legacy && r.holes.some((h) => h.fairway);
    const greensTracked = legacy && r.holes.some((h) => h.green);
    return r.holes.filter((h) => Number.isInteger(h.par) && Number.isInteger(h.strokes)).map((h) => ({
      ...h,
      fairway: (h.fairway ?? (fairwaysTracked && h.par !== 3 ? "miss" : null)) as Shot,
      green: (h.green ?? (greensTracked ? "miss" : null)) as Shot,
    }));
  });

  // Scoring mix per 18 holes.
  const mix = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 };
  for (const h of holes) {
    const d = h.strokes - h.par;
    if (d <= -2) mix.eagles++; else if (d === -1) mix.birdies++; else if (d === 0) mix.pars++; else if (d === 1) mix.bogeys++; else mix.doubles++;
  }
  const per18 = (n: number) => round1((n / holes.length) * 18);

  const byPar = ([3, 4, 5] as const).flatMap((par) => {
    const these = holes.filter((h) => h.par === par);
    if (!these.length) return [];
    const average = these.reduce((s, h) => s + h.strokes, 0) / these.length;
    return [{ par, holes: these.length, average: Math.round(average * 100) / 100, overPar: Math.round((average - par) * 100) / 100 }];
  });

  const putted = holes.filter((h) => h.putts !== null && h.putts !== undefined);
  const driven = holes.filter((h) => h.par !== 3 && h.fairway);
  const approached = holes.filter((h) => h.green);
  const missedGreens = approached.filter((h) => h.green !== "center");

  const byCourse = new Map<string, { rounds: number; best: number | null }>();
  for (const r of newestFirst) {
    const entry = byCourse.get(r.course.name) ?? { rounds: 0, best: null };
    entry.rounds++;
    if (r.holesPlayed === 18) entry.best = entry.best === null ? r.total : Math.min(entry.best, r.total);
    byCourse.set(r.course.name, entry);
  }

  return {
    rounds: rounds.length, eighteens: eighteens.length, nines: nines.length,
    average18: eighteens.length ? round1(eighteens.reduce((s, r) => s + r.total, 0) / eighteens.length) : null,
    adjustedAverage18: capped.length ? round1(capped.reduce((s, n) => s + n, 0) / capped.length) : null,
    best18: best ? { total: best.total, course: best.course.name, date: best.datePlayed } : null,
    average9: nines.length ? round1(nines.reduce((s, r) => s + r.total, 0) / nines.length) : null,
    handicapIndex: calculateHandicapIndex(counting.slice(0, 20)),
    lowIndex: calculateLowIndex([...counting].reverse()),
    countingRounds: counting.length,
    trend: newestFirst.flatMap((r): ScoreTrendPoint[] => {
      if (r.holes.length !== r.holesPlayed || r.holes.some((h) => !Number.isInteger(h.par))) return [];
      return [{ date: r.datePlayed, total: r.total, course: r.course.name, toPar: r.total - r.holes.reduce((s, h) => s + h.par, 0), holes: r.holesPlayed }];
    }).slice(0, 20).reverse(),
    scoring: holes.length ? { holes: holes.length, eagles: per18(mix.eagles), birdies: per18(mix.birdies), pars: per18(mix.pars), bogeys: per18(mix.bogeys), doubles: per18(mix.doubles),
      birdiePct: pct(mix.eagles + mix.birdies, holes.length), parOrBetterPct: pct(mix.eagles + mix.birdies + mix.pars, holes.length), doublePct: pct(mix.doubles, holes.length) } : null,
    byPar,
    putting: putted.length ? {
      holes: putted.length,
      perRound: round1((putted.reduce((s, h) => s + (h.putts as number), 0) / putted.length) * 18),
      threePuttPct: pct(putted.filter((h) => (h.putts as number) >= 3).length, putted.length),
      onePuttPct: pct(putted.filter((h) => h.putts === 1).length, putted.length),
    } : null,
    driving: driven.length ? (() => {
      const aimed = driven.filter((h) => h.fairway !== "center" && h.fairway !== "miss");
      return {
        holes: driven.length,
        fairwayPct: pct(driven.filter((h) => h.fairway === "center").length, driven.length),
        missLeftPct: aimed.length ? pct(aimed.filter((h) => h.fairway === "left").length, aimed.length) : null,
        missRightPct: aimed.length ? pct(aimed.filter((h) => h.fairway === "right").length, aimed.length) : null,
      };
    })() : null,
    approach: approached.length ? { holes: approached.length, girPct: pct(approached.filter((h) => h.green === "center").length, approached.length) } : null,
    scrambling: missedGreens.length ? { chances: missedGreens.length, pct: pct(missedGreens.filter((h) => h.strokes <= h.par).length, missedGreens.length) } : null,
    courses: [...byCourse.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.rounds - a.rounds || (a.best ?? 999) - (b.best ?? 999)).slice(0, 3),
  };
}
