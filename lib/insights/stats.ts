import { calculateHandicapIndex } from "../handicap/whs.ts";
import { countingDifferentials } from "../platform/playerRounds.ts";
import type { ProfileHistoryRound } from "../platform/playerRoundsRows.ts";

/**
 * Website → Stats (project_specs.md "Stats tab, the full breakdown"): every number from a golfer's saved rounds, in one
 * plain file so each is easy to test. Fairway / green / putt numbers only use holes where that stat was tracked, and say
 * how many rounds they come from. Directions as the app saves them: center = hit; left / right; up = long, down = short.
 */

export type InsightsRange = "last10" | "last20" | "year" | "all";
export const INSIGHTS_RANGES: [InsightsRange, string][] = [["last10", "Last 10"], ["last20", "Last 20"], ["year", "This year"], ["all", "All time"]];
export interface InsightsFilter { range: InsightsRange; only18: boolean; today: string }

type Round = ProfileHistoryRound;
type Hole = Round["holes"][number];
const SCORE_KINDS = ["eagle", "birdie", "par", "bogey", "double", "triple"] as const;
export type ScoreKind = (typeof SCORE_KINDS)[number];
export const SCORE_KIND_LABEL: Record<ScoreKind, string> = { eagle: "Eagle or better", birdie: "Birdie", par: "Par", bogey: "Bogey", double: "Double", triple: "Triple+" };
export const SOURCE_LABEL: Record<string, string> = { personal: "Play rounds", trip: "Golf trips", tourney: "Tournaments", league: "Leagues", historical: "Past trips", legacy: "The Maroon (archive)" };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const avg = (values: number[]) => values.length ? sum(values) / values.length : null;
const pct = (part: number, whole: number) => whole ? (part / whole) * 100 : null;
const round1 = (n: number | null) => n === null ? null : Math.round(n * 10) / 10;
const kindOf = (h: Hole): ScoreKind => { const d = h.strokes - h.par; return d <= -2 ? "eagle" : d === -1 ? "birdie" : d === 0 ? "par" : d === 1 ? "bogey" : d === 2 ? "double" : "triple"; };
const toPar = (r: Round) => sum(r.holes.map((h) => h.strokes - h.par));
const tracked = (rounds: Round[], key: "fairway" | "green" | "putts") => rounds.filter((r) => r.holes.some((h) => h[key] != null));

/** The rounds the filter keeps, newest first. */
export function filterRounds(rounds: Round[], f: InsightsFilter): Round[] {
  const kept = [...rounds].filter((r) => r.holes.length > 0 && (!f.only18 || r.holesPlayed === 18))
    .sort((a, b) => b.datePlayed.localeCompare(a.datePlayed) || b.id.localeCompare(a.id));
  if (f.range === "last10") return kept.slice(0, 10);
  if (f.range === "last20") return kept.slice(0, 20);
  if (f.range === "year") return kept.filter((r) => r.datePlayed.slice(0, 4) === f.today.slice(0, 4));
  return kept;
}

/** Score (or average) per 18: 9-hole rounds count as half. */
const per18 = (rounds: Round[], value: (r: Round) => number) => {
  const holes = sum(rounds.map((r) => r.holes.length));
  return holes ? (sum(rounds.map(value)) / holes) * 18 : null;
};

export function insights(all: Round[], f: InsightsFilter) {
  const rounds = filterRounds(all, f);
  const holes = rounds.flatMap((r) => r.holes);
  const eighteens = rounds.filter((r) => r.holesPlayed === 18);
  const nines = rounds.filter((r) => r.holesPlayed === 9);
  const career18 = all.filter((r) => r.holesPlayed === 18);
  const last5 = [...career18].sort((a, b) => b.datePlayed.localeCompare(a.datePlayed)).slice(0, 5);

  // Handicap: today's index from every saved round, and the index after each round for the trend.
  const chronological = [...all].sort((a, b) => a.datePlayed.localeCompare(b.datePlayed) || a.id.localeCompare(b.id));
  const handicapTrend = chronological.map((r, i) => ({ date: r.datePlayed, value: calculateHandicapIndex(countingDifferentials(chronological.slice(0, i + 1)).slice(0, 20)) }))
    .filter((p): p is { date: string; value: number } => p.value !== null);

  const overview = {
    rounds: rounds.length, eighteens: eighteens.length, nines: nines.length,
    handicapIndex: handicapTrend.at(-1)?.value ?? null,
    handicapChange: handicapTrend.length > 1 ? round1(handicapTrend.at(-1)!.value - handicapTrend[Math.max(0, handicapTrend.length - 6)].value) : null,
    scoringAverage: round1(avg(eighteens.map((r) => r.total))),
    averageToPar: round1(per18(rounds, toPar)),
    best: eighteens.length ? [...eighteens].sort((a, b) => a.total - b.total)[0] : null,
    worst: eighteens.length ? [...eighteens].sort((a, b) => b.total - a.total)[0] : null,
    lowestNine: round1(lowestNine(rounds)),
    last5Average: round1(avg(last5.map((r) => r.total))),
    careerAverage: round1(avg(career18.map((r) => r.total))),
  };

  // Scoring
  const mix = Object.fromEntries(SCORE_KINDS.map((k) => [k, holes.filter((h) => kindOf(h) === k).length])) as Record<ScoreKind, number>;
  const byPar = ([3, 4, 5] as const).map((par) => { const on = holes.filter((h) => h.par === par); return { par, holes: on.length, averageToPar: round1(avg(on.map((h) => h.strokes - h.par))) }; });
  const front = rounds.flatMap((r) => r.holes.filter((h) => h.number <= 9)), back = rounds.flatMap((r) => r.holes.filter((h) => h.number > 9));
  const byHole = Array.from({ length: 18 }, (_, i) => { const on = holes.filter((h) => h.number === i + 1); return { hole: i + 1, played: on.length, averageToPar: round1(avg(on.map((h) => h.strokes - h.par))) }; });
  let bounceChances = 0, bounceBacks = 0;
  for (const r of rounds) for (let i = 1; i < r.holes.length; i++) if (r.holes[i - 1].strokes > r.holes[i - 1].par) { bounceChances++; if (r.holes[i].strokes < r.holes[i].par) bounceBacks++; }
  const scoring = {
    mix, holes: holes.length,
    mixPct: Object.fromEntries(SCORE_KINDS.map((k) => [k, round1(pct(mix[k], holes.length))])) as Record<ScoreKind, number | null>,
    birdiesPerRound: round1(per18(rounds, (r) => r.holes.filter((h) => h.strokes < h.par).length)),
    bogeyFreeRounds: rounds.filter((r) => r.holes.every((h) => h.strokes <= h.par)).length,
    byPar,
    frontNine: nineToPar(front), backNine: nineToPar(back),
    byHole, bounceBackPct: round1(pct(bounceBacks, bounceChances)),
  };

  // Off the tee (par 4s and 5s with a fairway entered)
  const teeRounds = tracked(rounds, "fairway");
  const drives = holes.filter((h) => h.par >= 4 && h.fairway != null);
  const fairwayHit = drives.filter((h) => h.fairway === "center");
  const missed = drives.filter((h) => h.fairway !== "center");
  const offTheTee = {
    rounds: teeRounds.length, drives: drives.length,
    fairwaysPct: round1(pct(fairwayHit.length, drives.length)),
    missLeftPct: round1(pct(drives.filter((h) => h.fairway === "left").length, drives.length)),
    missRightPct: round1(pct(drives.filter((h) => h.fairway === "right").length, drives.length)),
    penaltiesPerRound: round1(avg(rounds.filter((r) => r.holes.some((h) => h.penalties)).map((r) => r.holes.filter((h) => h.penalties?.fairway || h.penalties?.green).length))),
    toParWhenHit: round1(avg(fairwayHit.map((h) => h.strokes - h.par))),
    toParWhenMissed: round1(avg(missed.map((h) => h.strokes - h.par))),
  };

  // Approach (greens in regulation)
  const greenRounds = tracked(rounds, "green");
  const approaches = holes.filter((h) => h.green != null);
  const greenHit = approaches.filter((h) => h.green === "center"), greenMissed = approaches.filter((h) => h.green !== "center");
  const missDir = (dir: "up" | "down" | "left" | "right") => round1(pct(greenMissed.filter((h) => h.green === dir).length, greenMissed.length));
  const approach = {
    rounds: greenRounds.length, holes: approaches.length,
    girPct: round1(pct(greenHit.length, approaches.length)),
    miss: { long: missDir("up"), short: missDir("down"), left: missDir("left"), right: missDir("right") },
    girByPar: ([3, 4, 5] as const).map((par) => { const on = approaches.filter((h) => h.par === par); return { par, pct: round1(pct(on.filter((h) => h.green === "center").length, on.length)) }; }),
    toParWithGreen: round1(avg(greenHit.map((h) => h.strokes - h.par))),
    toParWithoutGreen: round1(avg(greenMissed.map((h) => h.strokes - h.par))),
  };

  // Short game and putting
  const puttRounds = tracked(rounds, "putts");
  const putted = holes.filter((h) => h.putts != null);
  const scrambles = holes.filter((h) => h.green != null && h.green !== "center");
  const putting = {
    rounds: puttRounds.length, holes: putted.length,
    puttsPerRound: round1(per18(puttRounds, (r) => sum(r.holes.map((h) => h.putts ?? 0)))),
    puttsPerGir: round1(avg(putted.filter((h) => h.green === "center").map((h) => h.putts!))),
    onePuttPct: round1(pct(putted.filter((h) => h.putts === 1).length, putted.length)),
    threePuttPct: round1(pct(putted.filter((h) => (h.putts ?? 0) >= 3).length, putted.length)),
    threePuttsPerRound: round1(per18(puttRounds, (r) => r.holes.filter((h) => (h.putts ?? 0) >= 3).length)),
    scramblingPct: round1(pct(scrambles.filter((h) => h.strokes <= h.par).length, scrambles.length)),
  };

  // Trends (oldest first, the filtered rounds)
  const oldestFirst = [...rounds].reverse();
  const trends = {
    score: oldestFirst.filter((r) => r.holesPlayed === 18).map((r) => ({ date: r.datePlayed, value: r.total })),
    handicap: handicapTrend.filter((p) => rounds.some((r) => r.datePlayed === p.date)),
    fairways: oldestFirst.flatMap((r) => { const d = r.holes.filter((h) => h.par >= 4 && h.fairway != null); return d.length ? [{ date: r.datePlayed, value: round1(pct(d.filter((h) => h.fairway === "center").length, d.length))! }] : []; }),
    greens: oldestFirst.flatMap((r) => { const g = r.holes.filter((h) => h.green != null); return g.length ? [{ date: r.datePlayed, value: round1(pct(g.filter((h) => h.green === "center").length, g.length))! }] : []; }),
    putts: oldestFirst.flatMap((r) => r.holes.every((h) => h.putts != null) ? [{ date: r.datePlayed, value: round1(per18([r], (x) => sum(x.holes.map((h) => h.putts ?? 0))))! }] : []),
  };

  // Courses, where you played
  const groupBy = (key: (r: Round) => string) => {
    const groups = new Map<string, Round[]>();
    for (const r of rounds) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
    return [...groups.entries()].map(([name, list]) => { const e = list.filter((r) => r.holesPlayed === 18); return { name, rounds: list.length, average: round1(avg(e.map((r) => r.total))), best: e.length ? Math.min(...e.map((r) => r.total)) : null }; })
      .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name));
  };
  const courses = groupBy((r) => r.course.name);
  const sources = groupBy((r) => SOURCE_LABEL[r.source] ?? "Other");

  // Records
  const records = {
    best: overview.best,
    mostBirdies: rounds.length ? [...rounds].map((r) => ({ round: r, birdies: r.holes.filter((h) => h.strokes < h.par).length })).sort((a, b) => b.birdies - a.birdies)[0] : null,
    longestParStreak: Math.max(0, ...rounds.map((r) => { let best = 0, run = 0; for (const h of r.holes) { run = h.strokes <= h.par ? run + 1 : 0; best = Math.max(best, run); } return best; })),
    eagles: rounds.flatMap((r) => r.holes.filter((h) => h.strokes <= h.par - 2 && h.strokes > 1).map((h) => ({ date: r.datePlayed, course: r.course.name, hole: h.number }))),
    holesInOne: rounds.flatMap((r) => r.holes.filter((h) => h.strokes === 1).map((h) => ({ date: r.datePlayed, course: r.course.name, hole: h.number }))),
  };

  return { rounds: rounds.length, overview, scoring, offTheTee, approach, putting, trends, courses, sources, records };
}
export type Insights = ReturnType<typeof insights>;

/** Average to par over 9 holes, from every hole played on that nine. */
function nineToPar(holes: Hole[]): number | null {
  const each = avg(holes.map((h) => h.strokes - h.par));
  return each === null ? null : round1(each * 9);
}

/** Lowest 9-hole score: a 9-hole round, or the front or back of an 18. */
function lowestNine(rounds: Round[]): number | null {
  const nines = rounds.flatMap((r) => r.holesPlayed === 9 ? [r.total] : [sum(r.holes.filter((h) => h.number <= 9).map((h) => h.strokes)), sum(r.holes.filter((h) => h.number > 9).map((h) => h.strokes))]);
  return nines.length ? Math.min(...nines) : null;
}
