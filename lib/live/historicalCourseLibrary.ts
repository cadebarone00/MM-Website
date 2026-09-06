import { careerArchiveRecords } from "@/lib/data/careerArchive.generated";
import type { LiveCourse, LiveHole } from "@/lib/live/types";

/**
 * The named setups used by the Maroon Masters before the live platform.
 * Each setup is rebuilt from the corrected individual Career Archive, not
 * from the original workbook display labels, so this is safe to seed once
 * into the shared Course Library.
 */
const HISTORICAL_COURSE_NAMES = [
  "Mid Pines Golf Club",
  "Pine Needles Golf Club",
  "The Mid South Club",
  "Tobacco Road Golf Club",
  "Danzante Bay",
  "Palmer",
  "Pete Dye",
  "Classic",
  "Cove",
  "Tournament",
] as const;

export function historicalCourseLibrary(): Omit<LiveCourse, "id">[] {
  return HISTORICAL_COURSE_NAMES.map((name) => {
    const byHole = new Map<number, LiveHole>();
    for (const row of careerArchiveRecords) {
      if (row.course !== name || byHole.has(row.hole)) continue;
      byHole.set(row.hole, { number: row.hole, par: row.par, yards: row.yards });
    }
    const holes = [...byHole.values()].sort((a, b) => a.number - b.number);
    if (holes.length !== 18) throw new Error(`Historical course setup is incomplete: ${name}.`);
    return { name, holes, rating: null, slope: null };
  });
}
