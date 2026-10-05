import {
  measureCourseCoverage, measureHoleCoverage,
  type GolfCoordinate, type GolfCourse, type GolfDerivation, type GolfHole, type GolfSourceMetadata, type GolfTee,
} from "../domain";
import { approachBearingFromCenterline, bearingBetween, greenCenter, greenFrontBack } from "./greenTargets";

/**
 * Playable green targets (front / center / back) for every hole that has a real green outline.
 *
 * Direction of play, best first:
 * 1. the hole's centerline — the bearing of its final 30 m onto the green (handles doglegs);
 * 2. par 3s only: a located tee → green center (on a par 3 the tee shot IS the line of play; on longer holes the
 *    tee → green line ignores doglegs, so it isn't trusted there);
 * 3. nothing reliable → the hole keeps its center target only; front / back are left out, never guessed.
 *
 * Points a source already gave are kept as they are. Every derived point records how and from what it was derived.
 */

export type DirectionSource = NonNullable<GolfDerivation["directionSource"]>;

export interface HoleTargetReport {
  number: number;
  greenPolygon: boolean;
  center: boolean;
  frontBack: boolean;
  directionSource?: DirectionSource;
  /** Why something is missing, in plain English. */
  reason?: string;
}

const teePoint = (tee: GolfTee): { point: GolfCoordinate; source?: GolfSourceMetadata } | null => {
  const location = tee.location;
  if (!location) return null;
  if (location.kind === "point") return { point: location.coordinate, source: location.source };
  const center = greenCenter(location.polygon); // the same centroid method works for any outline
  return center ? { point: center.center, source: location.polygon.source } : null;
};

export function deriveHoleGreenTargets(hole: GolfHole, derivedAt: string): { hole: GolfHole; report: HoleTargetReport } {
  const report: HoleTargetReport = { number: hole.number, greenPolygon: Boolean(hole.green?.polygon), center: Boolean(hole.green?.center), frontBack: Boolean(hole.green?.front && hole.green?.back) };
  const green = hole.green;
  const polygon = green?.polygon;
  if (!green || !polygon) return { hole, report: { ...report, ...(!report.center && { reason: "no green outline" }) } };
  const polygonInput = polygon.source ? [polygon.source] : [];

  // Center: keep a source's own center; otherwise derive it from the outline.
  let center = green.center;
  let centerDerivation: GolfDerivation | undefined;
  if (!center) {
    const derived = greenCenter(polygon);
    if (!derived) return { hole, report: { ...report, reason: "green outline has no area" } };
    center = derived.center;
    centerDerivation = { derivedBy: "maroon", method: derived.method, derivedAt, inputs: polygonInput };
  }

  // Front / back: keep a source's own; otherwise derive along the most reliable direction of play.
  let front = green.front, back = green.back;
  let frontBackDerivation: GolfDerivation | undefined;
  let reason: string | undefined;
  if (!front || !back) {
    let bearing: number | null = null, directionSource: DirectionSource | undefined, directionInput: GolfSourceMetadata | undefined;
    if (hole.centerline) {
      bearing = approachBearingFromCenterline(hole.centerline.coordinates, polygon);
      if (bearing !== null) { directionSource = "centerline_final_segment"; directionInput = hole.centerline.source; }
    }
    if (bearing === null && hole.par === 3) {
      const tee = hole.tees.map(teePoint).find((candidate) => candidate !== null);
      bearing = tee ? bearingBetween(tee.point, center) : null;
      if (bearing !== null) { directionSource = "tee_to_green"; directionInput = tee?.source; }
    }
    const edges = bearing !== null ? greenFrontBack(polygon, center, bearing) : null;
    if (edges && bearing !== null && directionSource) {
      front = edges.front;
      back = edges.back;
      frontBackDerivation = {
        derivedBy: "maroon", method: "approach_axis_intersection", derivedAt,
        inputs: [...polygonInput, ...(directionInput ? [directionInput] : [])],
        approachBearingDegrees: Math.round(bearing * 10) / 10, directionSource,
      };
    } else {
      reason = bearing === null
        ? hole.centerline ? "hole line doesn't give a usable direction onto the green" : hole.par === 3 ? "no hole line or located tee for the direction of play" : "no hole line for the direction of play (tee → green isn't trusted on a par 4 / 5)"
        : "line of play doesn't cross the green outline on both sides";
    }
  }

  const enriched: GolfHole = {
    ...hole,
    green: {
      ...green,
      center,
      ...(front && back && { front, back }),
      ...((centerDerivation || frontBackDerivation || green.derivation) && {
        derivation: { ...green.derivation, ...(centerDerivation && { center: centerDerivation }), ...(frontBackDerivation && { frontBack: frontBackDerivation }) },
      }),
    },
  };
  return {
    hole: { ...enriched, coverage: measureHoleCoverage(enriched) },
    report: { ...report, center: true, frontBack: Boolean(front && back), ...(frontBackDerivation?.directionSource && { directionSource: frontBackDerivation.directionSource }), ...(reason && { reason }) },
  };
}

/** Derive targets on every hole and re-measure the course's coverage. */
export function deriveCourseGreenTargets(course: GolfCourse, derivedAt: string): { course: GolfCourse; holes: HoleTargetReport[] } {
  const results = course.holes.map((hole) => deriveHoleGreenTargets(hole, derivedAt));
  const updated: GolfCourse = { ...course, holes: results.map((result) => result.hole) };
  return { course: { ...updated, coverage: measureCourseCoverage(updated) }, holes: results.map((result) => result.report) };
}
