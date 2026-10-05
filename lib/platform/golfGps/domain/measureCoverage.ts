import type { GolfCourse, GolfHole } from "./course";
import { GOLF_COVERAGE_LEVELS, hasCoverage, type GolfCoverageFeatures, type GolfCoverageLevel, type GolfDataCoverage } from "./coverage";

/**
 * Coverage worked out from the data actually present — never set by hand. Rungs:
 * - gps: green front, center AND back points (given by a source or derived from the real green outline). No tee is
 *   required: on the course, yardages are measured from the player's live position, not from a tee.
 * - mapped: gps + a located tee + the hole's centerline + a fairway (par 3s don't need one). Tees are required here so
 *   dropping the tee from gps doesn't make more holes "mapped".
 * - verified: mapped and reviewed (verification admin_verified / professional_source) — never from an import alone
 * - premium: not reachable here; it needs professional elevation / slope data, which nothing imports yet
 */
export function measureHoleCoverage(hole: GolfHole): GolfDataCoverage {
  const allHazards = [...hole.bunkers, ...hole.penaltyAreas];
  const features: GolfCoverageFeatures = {
    scorecard: true,
    teeCoordinates: hole.tees.some((tee) => tee.location),
    greenPoints: Boolean(hole.green?.front && hole.green.center && hole.green.back),
    greenPolygons: Boolean(hole.green?.polygon),
    fairways: hole.fairways.length > 0,
    hazardLocations: allHazards.length > 0,
    hazardPolygons: allHazards.some((hazard) => hazard.geometry.kind === "polygon"),
    holeBoundaries: Boolean(hole.boundary),
    centerlines: Boolean(hole.centerline),
    elevation: Boolean(hole.elevation),
    greenSlope: Boolean(hole.green?.slope),
  };
  let level: GolfCoverageLevel = "scorecard";
  if (features.greenPoints) level = "gps";
  if (level === "gps" && features.teeCoordinates && features.centerlines && (features.fairways || hole.par === 3)) level = "mapped";
  if (level === "mapped" && ["admin_verified", "professional_source"].includes(hole.verification.status)) level = "verified";
  return { level, features };
}

/** A course reaches a rung when at least three quarters of its holes do; features are "any hole has it". */
export function measureCourseCoverage(course: GolfCourse): GolfDataCoverage {
  const holes = course.holes.map((hole) => hole.coverage);
  const total = Math.max(course.holeCount, course.holes.length);
  const atLeast = (level: GolfCoverageLevel) => holes.filter((coverage) => hasCoverage(coverage.level, level)).length;
  const level = [...GOLF_COVERAGE_LEVELS].reverse().find((rung) => rung === "scorecard" || (total > 0 && atLeast(rung) >= 0.75 * total)) ?? "scorecard";
  const any = (feature: keyof GolfCoverageFeatures) => holes.some((coverage) => coverage.features[feature]);
  const features = Object.fromEntries(
    (Object.keys(course.coverage.features) as (keyof GolfCoverageFeatures)[]).map((feature) => [feature, feature === "scorecard" ? course.holes.length > 0 : any(feature)]),
  ) as unknown as GolfCoverageFeatures;
  return { level, features, holesWithGps: atLeast("gps") };
}
