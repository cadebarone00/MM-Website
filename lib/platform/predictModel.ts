import type { ProfileHistoryRound } from "./playerRoundsRows";

/**
 * Golf Trip → Predict: opening odds from each player's real history, by Monte Carlo simulation.
 *
 * 1. A scoring profile per player: how often they make eagle, birdie, par, bogey, double, triple+ — separately for par
 *    3s, 4s and 5s — from every hole they've scored. Few holes = blended toward a typical profile for their handicap
 *    (more holes, the more it's their own).
 * 2. Good / bad days: the extra round-to-round swing in their 18-hole totals beyond what hole-by-hole luck explains.
 * 3. Course difficulty: the profile is tilted so its average matches what they'd shoot on this course (rating / slope),
 *    the same adjustment handicaps use.
 * 4. Thousands of simulated rounds on the trip's real pars; markets are read off the results (ties split).
 * Plain math with a seeded random generator, so the same inputs always give the same odds.
 */

/** Score relative to par buckets: eagle or better, birdie, par, bogey, double, triple or worse. */
export const OUTCOMES = [-2, -1, 0, 1, 2, 3] as const;
type Dist = number[]; // probabilities over OUTCOMES

export interface PlayerModel {
  id: string;
  name: string;
  /** Per par type (3 / 4 / 5): chance of each outcome. */
  byPar: Record<3 | 4 | 5, Dist>;
  /** Extra per-round swing in strokes (good / bad days), as a standard deviation. */
  daySd: number;
  /** Holes of real data behind the profile (0 = handicap profile only). */
  holes: number;
  handicapIndex: number | null;
}

/** `strokeIndex`: hardest (1) to easiest per hole, for net matches; unset = hole order. */
export interface CourseSetup { par: number[]; rating: number | null; slope: number | null; strokeIndex?: (number | null)[] }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const normalise = (d: Dist) => { const s = d.reduce((a, b) => a + b, 0); return d.map((x) => x / s); };
const mean = (d: Dist) => d.reduce((a, p, i) => a + p * OUTCOMES[i], 0);
const variance = (d: Dist) => { const m = mean(d); return d.reduce((a, p, i) => a + p * (OUTCOMES[i] - m) ** 2, 0); };

/**
 * A typical profile for a handicap index on a par type: scratch ≈ 20% birdies, 60% pars; a 20 ≈ 3% birdies, 25% pars,
 * 40% bogeys, lots of doubles; par 3s play a little harder, par 5s easier. Interpolated in between.
 */
export function handicapProfile(index: number, par: 3 | 4 | 5): Dist {
  const t = clamp(index, -4, 36) / 20;
  const scratch = [0.012, 0.19, 0.6, 0.17, 0.025, 0.003];
  const twenty = [0.001, 0.03, 0.25, 0.4, 0.22, 0.099];
  const blend = scratch.map((s, i) => Math.max(0.0005, s + (twenty[i] - s) * t));
  const tilt = par === 3 ? 0.12 : par === 5 ? -0.12 : 0; // par 3s a touch harder, par 5s easier
  return tiltTo(normalise(blend), mean(normalise(blend)) + tilt);
}

/** Exponentially tilt a profile so its average becomes `target` strokes over par per hole (keeps its shape). */
export function tiltTo(d: Dist, target: number): Dist {
  let lo = -6, hi = 6;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    const m = mean(normalise(d.map((p, j) => p * Math.exp(k * OUTCOMES[j]))));
    if (m > target) hi = k; else lo = k;
  }
  const k = (lo + hi) / 2;
  return normalise(d.map((p, j) => p * Math.exp(k * OUTCOMES[j])));
}

/** How many holes of a player's own data count as much as the handicap profile (more data = more their own). */
const PRIOR_HOLES = 54;

/** A player's scoring profile from their rounds (holes with a par and a score), blended with their handicap profile. */
export function buildPlayerModel(id: string, name: string, rounds: ProfileHistoryRound[], handicapIndex: number | null): PlayerModel {
  const holes = rounds.flatMap((r) => r.holes.filter((h) => Number.isInteger(h.par) && Number.isInteger(h.strokes) && h.par >= 3 && h.par <= 5));
  // No index given: estimate one from their average over par (≈ 1 stroke per hole over = index ~18).
  const avgOver = holes.length ? holes.reduce((a, h) => a + (h.strokes - h.par), 0) / holes.length : null;
  const index = handicapIndex ?? (avgOver !== null ? clamp(avgOver * 18 - 4, -4, 36) : 18);
  const byPar = {} as Record<3 | 4 | 5, Dist>;
  for (const par of [3, 4, 5] as const) {
    const counts = OUTCOMES.map(() => 0);
    for (const h of holes) if (h.par === par) counts[OUTCOMES.indexOf(clamp(h.strokes - h.par, -2, 3) as (typeof OUTCOMES)[number])]++;
    const n = counts.reduce((a, b) => a + b, 0);
    const prior = handicapProfile(index, par);
    // Weight the prior as PRIOR_HOLES / 3 holes of this par type.
    const w = PRIOR_HOLES / 3;
    byPar[par] = normalise(counts.map((c, i) => c + prior[i] * w).map((x) => x / (n + w)));
  }
  // Good / bad days: observed spread of 18-hole totals vs. what independent holes would give.
  const totals = rounds.filter((r) => r.holesPlayed === 18 && r.holes.length === 18).map((r) => r.total);
  let daySd = 1.5;
  if (totals.length >= 4) {
    const m = totals.reduce((a, b) => a + b, 0) / totals.length;
    const observed = totals.reduce((a, t) => a + (t - m) ** 2, 0) / (totals.length - 1);
    const independent = 4 * variance(byPar[3]) + 10 * variance(byPar[4]) + 4 * variance(byPar[5]);
    daySd = clamp(Math.sqrt(Math.max(0, observed - independent)), 0.5, 4);
  }
  return { id, name, byPar, daySd, holes: holes.length, handicapIndex: index };
}

/**
 * The profile tilted for this course: their expected score here = their usual over-par + (course handicap − their
 * usual course handicap), spread across the holes. Without a rating / slope the profile is used as is.
 */
export function forCourse(model: PlayerModel, course: CourseSetup): PlayerModel {
  if (course.rating === null || course.slope === null || model.handicapIndex === null) return model;
  const coursePar = course.par.reduce((a, b) => a + b, 0);
  const extra = (model.handicapIndex * (course.slope / 113 - 1) + (course.rating - coursePar)) / course.par.length;
  const byPar = { ...model.byPar };
  for (const par of [3, 4, 5] as const) byPar[par] = tiltTo(model.byPar[par], mean(model.byPar[par]) + extra);
  return { ...model, byPar };
}

/** A small, fast seeded random generator (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normal(rand: () => number) { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); }

export interface SimRound { total: number; birdies: number; /** Holes at double bogey or worse. */ doubles: number }
export interface SimResult { players: PlayerModel[]; rounds: number; sims: number; /** [sim][player][round] */ results: SimRound[][][] }

/**
 * What's already been played, so the simulation only plays out the rest: `holes[player][round][hole]` = real strokes
 * (null = not played yet). `roundTotals[player][round]` = a finished round's real total when its holes aren't known.
 */
export interface LiveScores { holes?: (number | null)[][][]; roundTotals?: (number | null)[][] }

/**
 * Plays every player through every round `sims` times. `courses[r]` = round r's course (pars, rating, slope).
 * `live` locks in real scores already posted: played holes / finished rounds use the real numbers, and only what's
 * left is simulated (the good / bad day swing shrinks with the holes left). `onRound(sim, round, holes)` sees each
 * round hole by hole (`holes[player][hole]` = strokes) — used for matches — without keeping every hole in memory.
 */
export function simulateTrip(models: PlayerModel[], courses: CourseSetup[], sims = 10000, seed = 1,
  onRound?: (sim: number, round: number, holes: number[][]) => void, live: LiveScores = {}): SimResult {
  const rand = seeded(seed);
  const tuned = courses.map((c) => models.map((m) => forCourse(m, c)));
  const cumulative = tuned.map((round) => round.map((m) => ({ 3: cum(m.byPar[3]), 4: cum(m.byPar[4]), 5: cum(m.byPar[5]) } as Record<3 | 4 | 5, number[]>)));
  const results: SimRound[][][] = [];
  for (let s = 0; s < sims; s++) {
    const perPlayer: SimRound[][] = models.map(() => []);
    courses.forEach((course, r) => {
      const holeScores: number[][] = onRound ? models.map(() => []) : [];
      models.forEach((m, p) => {
        let total = 0, birdies = 0, doubles = 0, left = 0;
        const known = live.holes?.[p]?.[r];
        course.par.forEach((par, h) => {
          const real = known?.[h];
          let strokes: number;
          if (real !== null && real !== undefined) strokes = real;
          else {
            const c = cumulative[r][p][clamp(par, 3, 5) as 3 | 4 | 5];
            const u = rand();
            let k = 0; while (k < c.length - 1 && u > c[k]) k++;
            strokes = par + OUTCOMES[k];
            left++;
          }
          total += strokes;
          if (strokes < par) birdies++;
          if (strokes >= par + 2) doubles++;
          if (onRound) holeScores[p].push(strokes);
        });
        // A finished round known only by its total: the real total wins (birdies / doubles stay estimated).
        const finished = live.roundTotals?.[p]?.[r];
        if (finished !== null && finished !== undefined) total = finished;
        // Good / bad day on top of the holes still to play (none left = no swing).
        else if (left > 0) total += Math.round(normal(rand) * m.daySd * Math.sqrt(left / course.par.length));
        perPlayer[p].push({ total, birdies, doubles });
      });
      onRound?.(s, r, holeScores);
    });
    results.push(perPlayer);
  }
  return { players: models, rounds: courses.length, sims, results };
}
function cum(d: Dist) { let a = 0; return d.map((p) => (a += p)); }

// --- Reading markets off the simulation -----------------------------------------------------------------------

/** Chance each player has the outright / shared low score (ties split evenly). `round` = a round index, or "trip" for the total. */
export function chanceOfLowest(sim: SimResult, round: number | "trip"): number[] {
  const wins = sim.players.map(() => 0);
  for (const s of sim.results) {
    const scores = s.map((rounds) => round === "trip" ? rounds.reduce((a, r) => a + r.total, 0) : rounds[round].total);
    const low = Math.min(...scores);
    const tied = scores.flatMap((x, i) => x === low ? [i] : []);
    for (const i of tied) wins[i] += 1 / tied.length;
  }
  return wins.map((w) => w / sim.sims);
}

/** Chance each player makes the most birdies (in a round, or the whole trip); ties split. */
export function chanceOfMostBirdies(sim: SimResult, round: number | "trip"): number[] {
  const wins = sim.players.map(() => 0);
  for (const s of sim.results) {
    const counts = s.map((rounds) => round === "trip" ? rounds.reduce((a, r) => a + r.birdies, 0) : rounds[round].birdies);
    const top = Math.max(...counts);
    const tied = counts.flatMap((x, i) => x === top ? [i] : []);
    for (const i of tied) wins[i] += 1 / tied.length;
  }
  return wins.map((w) => w / sim.sims);
}

/** Chance a player shoots under `score` in a round (e.g. breaks 80), or anyone does when `player` is "anyone". */
export function chanceToBreak(sim: SimResult, player: number | "anyone", round: number, score: number): number {
  let hits = 0;
  for (const s of sim.results) {
    const ok = player === "anyone" ? s.some((rounds) => rounds[round].total < score) : s[player][round].total < score;
    if (ok) hits++;
  }
  return hits / sim.sims;
}

/** Head to head over a round or the trip: [a wins, b wins, tie]. */
export function headToHead(sim: SimResult, a: number, b: number, round: number | "trip"): [number, number, number] {
  let wa = 0, wb = 0, tie = 0;
  for (const s of sim.results) {
    const sa = round === "trip" ? s[a].reduce((x, r) => x + r.total, 0) : s[a][round].total;
    const sb = round === "trip" ? s[b].reduce((x, r) => x + r.total, 0) : s[b][round].total;
    if (sa < sb) wa++; else if (sb < sa) wb++; else tie++;
  }
  return [wa / sim.sims, wb / sim.sims, tie / sim.sims];
}

/** Over / under for the group's total birdies (a round or the trip): the line where it's closest to 50 / 50, and the chance of over. */
export function totalBirdiesLine(sim: SimResult, round: number | "trip"): { line: number; over: number } {
  const totals = sim.results.map((s) => s.reduce((a, rounds) => a + (round === "trip" ? rounds.reduce((x, r) => x + r.birdies, 0) : rounds[round].birdies), 0)).sort((x, y) => x - y);
  // Try each half-number line around the middle and keep the one closest to an even split.
  const mid = totals[Math.floor(totals.length / 2)];
  let best = { line: mid + 0.5, over: 0 }, gap = Infinity;
  for (let line = Math.max(0.5, mid - 2.5); line <= mid + 2.5; line += 1) {
    const over = totals.filter((t) => t > line).length / totals.length;
    if (Math.abs(over - 0.5) < gap) { gap = Math.abs(over - 0.5); best = { line, over }; }
  }
  return best;
}

/** A player's expected score and a typical range (10th–90th percentile) for a round. */
export function scoreRange(sim: SimResult, player: number, round: number): { expected: number; low: number; high: number } {
  const totals = sim.results.map((s) => s[player][round].total).sort((x, y) => x - y);
  const at = (q: number) => totals[Math.min(totals.length - 1, Math.floor(q * totals.length))];
  return { expected: Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10, low: at(0.1), high: at(0.9) };
}
