import type { ProfileHistoryRound } from "../platform/playerRoundsRows.ts";
import type { ShotResult } from "../platform/playerRounds.ts";

/**
 * DEV ONLY: a made-up golfer's saved rounds for the website's Stats and History (`/dashboard/…?sample=1` on the local
 * dev server). 32 rounds over two seasons on four courses, mostly with stats tracked, a few 9-hole rounds, one eagle
 * and one hole-in-one. The same rounds every time.
 */
const COURSES = [
  { name: "Eagle Pointe Golf Club", place: "Tracy, CA", par: [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4], rating: 70.4, slope: 124 },
  { name: "Stevens Park Golf Course", place: "Dallas, TX", par: [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5], rating: 69.1, slope: 121 },
  { name: "Pine Valley Golf Club", place: "Palm Springs, CA", par: [4, 4, 5, 3, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5], rating: 72.3, slope: 131 },
  { name: "Willow Pines GC", place: "Palm Springs, CA", par: [5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 4, 3, 5, 4, 3, 4, 5, 4], rating: 71.0, slope: 127 },
];
const SOURCES = ["personal", "personal", "trip", "league", "tourney"] as const;

/** A small seeded random number generator, so the sample is the same on every load. */
function seeded(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

export function sampleInsightsRounds(): ProfileHistoryRound[] {
  const rand = seeded(7);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
  return Array.from({ length: 32 }, (_, i): ProfileHistoryRound => {
    const course = COURSES[i % COURSES.length];
    const nine = i % 9 === 4;
    const statsTracked = i % 7 !== 3;
    const improving = i / 32; // scores drift down over time
    const holes = course.par.slice(0, nine ? 9 : 18).map((par, h) => {
      const r = rand();
      let over = r < 0.1 - improving * 0.03 ? 2 : r < 0.42 - improving * 0.1 ? 1 : r < 0.9 ? 0 : -1;
      if (i === 20 && h === 3) over = -2;
      const strokes = i === 26 && h === 2 ? 1 : par + over;
      const green: ShotResult = strokes - par <= 0 && rand() < 0.7 ? "center" : pick(["center", "left", "right", "up", "down"] as const);
      const fairway: ShotResult | null = par === 3 ? null : rand() < 0.55 ? "center" : pick(["left", "right"] as const);
      const putts = strokes === 1 ? 0 : Math.max(1, Math.min(3, (green === "center" ? strokes - (par - 2) : strokes - (par - 1)) + (rand() < 0.15 ? 1 : 0)));
      return { number: h + 1, par, strokes, putts: statsTracked ? putts : null, fairway: statsTracked ? fairway : null, green: statsTracked ? green : null, ...(statsTracked ? { penalties: { fairway: rand() < 0.04, green: false } } : {}) };
    });
    const total = holes.reduce((a, h) => a + h.strokes, 0);
    const month = String((i % 10) + 3).padStart(2, "0");
    return {
      id: `sample-${String(i).padStart(2, "0")}`, source: SOURCES[i % SOURCES.length], datePlayed: `${i < 16 ? 2025 : 2026}-${month}-${String((i * 3) % 27 + 1).padStart(2, "0")}`,
      course: { ref: null, name: course.name, place: course.place }, tee: { name: "Blue", rating: course.rating, slope: course.slope },
      holesPlayed: nine ? 9 : 18, format: "Stroke Play", holes, total, countsForHandicap: !nine,
      notCountedReason: nine ? "9 holes" : null, differential: nine ? null : Math.round(((total - course.rating) * 113 / course.slope) * 10) / 10,
      enteredBy: "player", status: "submitted",
    };
  });
}
