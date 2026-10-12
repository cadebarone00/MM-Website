import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";

/**
 * DEV ONLY: made-up rounds for previewing Profile → Stats (/dev/profile-stats and Compare's "Sample golfer"). Same
 * shape as real saved rounds, with hole-by-hole stats, a few 9-hole rounds and some old-Maroon-style rounds (hits only,
 * misses blank) so every card has something to show. `skill` shifts scores: higher = more strokes.
 */
const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const COURSES = ["Stevens Golf Course", "Cedar Crest", "Tenison Park", "Mission Hills · Pete Dye", "Pebble Beach Golf Links"];
const SHOTS = ["center", "center", "center", "left", "right", "center", "up", "down"] as const;

/** A small repeatable random number generator, so the sample looks the same every time. */
function random(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export function sampleProfileRounds(count = 25, skill = 0, seed = 7): ProfileHistoryRound[] {
  const next = random(seed);
  return Array.from({ length: count }, (_, n): ProfileHistoryRound => {
    const nine = n % 8 === 5;
    const legacy = n % 6 === 4;
    const pars = nine ? PAR.slice(0, 9) : PAR;
    const holes = pars.map((par, i) => {
      const roll = next() + skill * 0.06;
      const strokes = Math.max(2, par + (roll < 0.06 ? -1 : roll < 0.5 ? 0 : roll < 0.85 ? 1 : roll < 0.97 ? 2 : 3));
      const fairway = par === 3 ? null : SHOTS[Math.floor(next() * SHOTS.length)];
      const green = SHOTS[Math.floor(next() * SHOTS.length)];
      const putts = strokes <= par - 1 ? 1 : next() < 0.12 ? 3 : next() < 0.2 ? 1 : 2;
      // Old Maroon rounds kept only hits: a miss came through blank.
      return legacy
        ? { number: i + 1, par, strokes, putts: null, fairway: fairway === "center" ? "center" as const : null, green: green === "center" ? "center" as const : null }
        : { number: i + 1, par, strokes, putts, fairway, green };
    });
    const total = holes.reduce((sum, h) => sum + h.strokes, 0);
    const month = 12 - Math.floor(n / 2.2);
    const date = `${month > 0 ? 2026 : 2025}-${String(((month - 1 + 12) % 12) + 1).padStart(2, "0")}-${String(3 + (n * 5) % 25).padStart(2, "0")}`;
    const counts = !nine;
    return {
      id: `sample-${seed}-${n}`, source: legacy ? "legacy" : "personal", sourceLabel: legacy ? "Maroon Tournament" : undefined, datePlayed: date,
      course: { ref: null, name: COURSES[n % COURSES.length], place: "Sample" }, tee: { name: "Blue", rating: 71.6, slope: 128 },
      holesPlayed: nine ? 9 : 18, format: "Stroke Play", holes, total,
      countsForHandicap: counts, notCountedReason: counts ? null : "9-hole rounds will count once 9-hole scoring is added",
      differential: counts ? Math.round(((total - 71.6) * 113 / 128) * 10) / 10 : null, enteredBy: "player", status: "submitted",
    } as ProfileHistoryRound;
  });
}
