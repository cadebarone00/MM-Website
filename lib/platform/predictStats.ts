import type { ProfileHistoryRound } from "./playerRoundsRows";
import { seeded } from "./predictModel";
import type { PlayerLine, TripSetup } from "./predictBets";

/**
 * Golf Trip → Predict: over / unders on each player's greens in regulation, fairways hit and putts — for one round or
 * the whole trip. Each player's rates come from their own holes (greens hit %, fairways hit % on par 4s and 5s, putts
 * per hole), blended with typical numbers for their handicap when they have little history; then the holes still to
 * play are simulated. Holes already played (live) count as real. Old Maroon rounds recorded only hits, so in a round
 * that recorded any hit, a blank counts as a miss (same rule as the Stats tab).
 */

export type StatKey = "gir" | "fairways" | "putts";
export const STAT_LABELS: Record<StatKey, string> = { gir: "Greens", fairways: "Fairways", putts: "Putts" };

interface Rates { gir: number; fairway: number; putts: number[] /* chance of 1, 2, 3, 4+ putts */ }
const PRIOR_HOLES = 54;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Typical numbers for a handicap: scratch ≈ 67% greens, 62% fairways, 29.5 putts; a 20 ≈ 21% greens, 46% fairways, 34 putts. */
export function typicalRates(index: number): Rates {
  const h = clamp(index, -4, 36);
  const avgPutts = 1.64 + 0.0125 * h;
  const three = clamp(0.03 + 0.004 * h, 0.01, 0.25), one = clamp(0.36 - 0.6 * (avgPutts - 1.64), 0.15, 0.45);
  return { gir: clamp(0.67 - 0.023 * h, 0.04, 0.8), fairway: clamp(0.62 - 0.008 * h, 0.25, 0.75), putts: [one, 1 - one - three - 0.005, three, 0.005] };
}

/** A player's rates: their own holes (where recorded) blended with the typical rates for their handicap. */
export function playerRates(rounds: ProfileHistoryRound[], index: number | null): Rates {
  const prior = typicalRates(index ?? 18);
  let girHits = 0, girHoles = 0, fwHits = 0, fwHoles = 0;
  const putts = [0, 0, 0, 0];
  for (const r of rounds) {
    const legacy = r.source === "legacy";
    const greensTracked = !legacy || r.holes.some((h) => h.green);
    const fairwaysTracked = !legacy || r.holes.some((h) => h.fairway);
    for (const h of r.holes) {
      const green = h.green ?? (legacy && greensTracked ? "miss" : null);
      if (green) { girHoles++; if (green === "center") girHits++; }
      const fairway = h.par === 3 ? null : h.fairway ?? (legacy && fairwaysTracked ? "miss" : null);
      if (fairway) { fwHoles++; if (fairway === "center") fwHits++; }
      if (h.putts != null) putts[Math.min(3, Math.max(0, h.putts - 1))]++;
    }
  }
  const blend = (hits: number, n: number, p: number) => (hits + p * PRIOR_HOLES) / (n + PRIOR_HOLES);
  const puttHoles = putts.reduce((a, b) => a + b, 0);
  return {
    gir: blend(girHits, girHoles, prior.gir),
    fairway: blend(fwHits, fwHoles, prior.fairway),
    putts: putts.map((c, i) => (c + prior.putts[i] * PRIOR_HOLES) / (puttHoles + PRIOR_HOLES)),
  };
}

/** Each player's over / under on a stat, for round `round` (0-based) or the whole trip. */
export function statLines(setup: TripSetup, scope: number | "trip", sims = 4000, seed = 3): Record<StatKey, PlayerLine[]> {
  const rand = seeded(seed);
  const rounds = scope === "trip" ? setup.rounds.map((_, i) => i) : [scope];
  const out: Record<StatKey, PlayerLine[]> = { gir: [], fairways: [], putts: [] };
  for (const player of setup.players) {
    const rates = playerRates(player.rounds, player.handicapIndex);
    // Holes already played count as real (greens / fairways only when the live card says; putts when entered).
    const known = { gir: 0, fairways: 0, putts: 0 };
    const left: number[] = []; // pars of holes still to play
    for (const r of rounds) setup.rounds[r].course.par.forEach((par, h) => {
      const strokes = setup.live?.holes?.[player.id]?.[r]?.[h];
      if (strokes == null) left.push(par);
      // A played hole without live stats: estimate it from the score (par or better usually means a green hit).
      else { known.gir += strokes <= par ? 1 : 0; known.fairways += par !== 3 && strokes <= par ? 1 : 0; known.putts += strokes <= par - 1 ? 1 : 2; }
    });
    const samples = { gir: [] as number[], fairways: [] as number[], putts: [] as number[] };
    for (let s = 0; s < sims; s++) {
      let gir = known.gir, fairways = known.fairways, putts = known.putts;
      for (const par of left) {
        if (rand() < rates.gir) gir++;
        if (par !== 3 && rand() < rates.fairway) fairways++;
        const u = rand(); let k = 0, acc = rates.putts[0];
        while (k < 3 && u > acc) { k++; acc += rates.putts[k]; }
        putts += k + 1;
      }
      samples.gir.push(gir); samples.fairways.push(fairways); samples.putts.push(putts);
    }
    for (const key of ["gir", "fairways", "putts"] as const) {
      const line = evenLine(samples[key], known[key]);
      out[key].push({ id: player.id, name: player.name, line, over: samples[key].filter((v) => v > line).length / sims, count: known[key] });
    }
  }
  return out;
}

/** The half-number line (at least what's already been made + 0.5) where over / under is closest to 50 / 50. */
export function evenLine(samples: number[], floor: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  let best = Math.max(floor + 0.5, mid + 0.5), gap = Infinity;
  for (let line = Math.max(floor + 0.5, mid - 3.5); line <= mid + 3.5; line += 1) {
    const over = samples.filter((v) => v > line).length / samples.length;
    if (Math.abs(over - 0.5) < gap) { gap = Math.abs(over - 0.5); best = line; }
  }
  return best;
}
