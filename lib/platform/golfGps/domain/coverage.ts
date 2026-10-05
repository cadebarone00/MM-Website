/**
 * How much of a course (or hole) The Maroon has data for. Two parts:
 * - `level`: one headline rung, for sorting / badges / "can we show GPS here?" checks
 * - `features`: exactly which kinds of data exist, because two courses on the same rung can still differ
 *
 * Rungs, lowest to highest (each one includes everything below it):
 * - scorecard: course info and scorecard only (pars, yardages, tees) — no map positions
 * - gps: tee and green front / center / back points, enough for GPS yardages
 * - mapped: real shapes for most of the course (greens, fairways, hazards)
 * - verified: the mapped shapes have been reviewed and approved
 * - premium: professional-grade geometry plus elevation and / or green slope, from any provider that supplies it
 */
export type GolfCoverageLevel = "scorecard" | "gps" | "mapped" | "verified" | "premium";

/** The rungs in order, lowest first. */
export const GOLF_COVERAGE_LEVELS: readonly GolfCoverageLevel[] = ["scorecard", "gps", "mapped", "verified", "premium"];

/** Which kinds of data exist. `true` only when the data is actually present — never guessed. */
export interface GolfCoverageFeatures {
  scorecard: boolean;
  teeCoordinates: boolean;
  greenPoints: boolean;
  greenPolygons: boolean;
  fairways: boolean;
  /** Bunkers / penalty areas located by at least a point (enough for "carry the bunker" yardages). */
  hazardLocations: boolean;
  /** Bunkers / penalty areas with mapped outlines (enough to draw them). */
  hazardPolygons: boolean;
  holeBoundaries: boolean;
  centerlines: boolean;
  elevation: boolean;
  greenSlope: boolean;
}

export interface GolfDataCoverage {
  level: GolfCoverageLevel;
  features: GolfCoverageFeatures;
  /** For a course: how many of its holes have at least GPS-level data (lets the UI say "GPS on 12 of 18 holes"). */
  holesWithGps?: number;
}

/** True when `level` is at or above `minimum`, e.g. hasCoverage(course.coverage.level, "gps"). */
export function hasCoverage(level: GolfCoverageLevel, minimum: GolfCoverageLevel): boolean {
  return GOLF_COVERAGE_LEVELS.indexOf(level) >= GOLF_COVERAGE_LEVELS.indexOf(minimum);
}
