import type { HighlightVariation } from "../types.ts";

/**
 * Picks the wording for one event (spec: H2.1 "Selection"). Pure; the random source is injected.
 * Once per event: the caller stores the pick with the event and never re-picks it.
 * Anti-repetition, per trip + conditional: exclude the ⌊n/2⌋ most recently used of the n usable wordings, then pick
 * uniformly from the rest. n = 1 → always that one; n = 2 → alternates; n = 3 → never the previous one.
 */

export interface PickOptions {
  /** Variation IDs used for this conditional on this trip, most recent first. IDs no longer usable are ignored. */
  recent: string[];
  /** Returns a number in [0, 1). */
  random: () => number;
  /** Force one wording (simulator V1 / V2 / V3); ignored if it isn't usable. */
  forced?: string | null;
}

export function pickVariation(usable: HighlightVariation[], options: PickOptions): { variation: HighlightVariation | null; excluded: string[] } {
  if (usable.length === 0) return { variation: null, excluded: [] };
  const forced = options.forced ? usable.find((v) => v.id === options.forced) : undefined;
  if (forced) return { variation: forced, excluded: [] };
  const ids = new Set(usable.map((v) => v.id));
  const excluded = options.recent.filter((id) => ids.has(id)).filter((id, i, all) => all.indexOf(id) === i).slice(0, Math.floor(usable.length / 2));
  const pool = usable.filter((v) => !excluded.includes(v.id));
  const index = Math.min(pool.length - 1, Math.floor(options.random() * pool.length));
  return { variation: pool[index], excluded };
}

/** A small seeded random source (mulberry32) so the simulator's "random" pick is repeatable per seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
