import type { GolfCoordinate, GolfPolygon } from "../domain";

/**
 * Green targets from a real green outline. Pure geometry: nothing here invents shape, depth or position — every result
 * is either a point inside the outline (center) or a point ON the outline (front / back).
 *
 * Work happens on a flat grid in meters around the green (east = x, north = y). Over a green-sized area the error of
 * that flattening is millimetres.
 */

interface XY { x: number; y: number }
const METERS_PER_DEGREE = (Math.PI / 180) * 6_371_008.8;

function grid(origin: GolfCoordinate) {
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  return {
    toXY: (p: GolfCoordinate): XY => ({ x: (p.lng - origin.lng) * METERS_PER_DEGREE * cos, y: (p.lat - origin.lat) * METERS_PER_DEGREE }),
    toCoordinate: (p: XY): GolfCoordinate => ({ lat: origin.lat + p.y / METERS_PER_DEGREE, lng: origin.lng + p.x / (METERS_PER_DEGREE * cos) }),
  };
}

/** Signed area (shoelace; positive = counter-clockwise) and area-weighted centroid of one ring. */
function ringMoments(ring: XY[]) {
  let twiceArea = 0, cx = 0, cy = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  });
  return { area: twiceArea / 2, cx: twiceArea ? cx / (3 * twiceArea) : 0, cy: twiceArea ? cy / (3 * twiceArea) : 0 };
}

function insideRing(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface GreenCenter {
  center: GolfCoordinate;
  method: "polygon_centroid" | "polygon_interior_point";
}

/**
 * The green's center for GPS targeting.
 * 1. Area-weighted centroid of the outline minus any cut-outs (the true "center of mass" of the green surface, not an
 *    average of its corner points, which is pulled toward wherever the outline has many points).
 * 2. If that centroid falls outside the green (a strongly kidney / crescent-shaped green can do that), use instead the
 *    middle of the widest strip of green on the east-west line through the centroid — guaranteed to be on the green.
 * Null if the outline has no area.
 */
export function greenCenter(polygon: GolfPolygon): GreenCenter | null {
  if (polygon.coordinates.length < 3) return null;
  const { toXY, toCoordinate } = grid(polygon.coordinates[0]);
  const outer = polygon.coordinates.map(toXY);
  const inners = (polygon.innerRings ?? []).filter((ring) => ring.length >= 3).map((ring) => ring.map(toXY));
  const parts = [{ ...ringMoments(outer), sign: 1 }, ...inners.map((ring) => ({ ...ringMoments(ring), sign: -1 }))];
  const area = parts.reduce((sum, part) => sum + part.sign * Math.abs(part.area), 0);
  if (!(area > 0.01)) return null;
  const centroid = {
    x: parts.reduce((sum, part) => sum + part.sign * Math.abs(part.area) * part.cx, 0) / area,
    y: parts.reduce((sum, part) => sum + part.sign * Math.abs(part.area) * part.cy, 0) / area,
  };
  const onGreen = (p: XY) => insideRing(p, outer) && !inners.some((ring) => insideRing(p, ring));
  if (onGreen(centroid)) return { center: toCoordinate(centroid), method: "polygon_centroid" };

  // Interior point: cross the outline (and cut-outs) along y = centroid.y; inside stretches alternate between crossings.
  const crossings: number[] = [];
  for (const ring of [outer, ...inners]) {
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      if ((a.y > centroid.y) !== (b.y > centroid.y)) crossings.push(a.x + ((centroid.y - a.y) * (b.x - a.x)) / (b.y - a.y));
    });
  }
  crossings.sort((a, b) => a - b);
  let best: XY | null = null, widest = 0;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const width = crossings[i + 1] - crossings[i];
    if (width > widest) { widest = width; best = { x: (crossings[i] + crossings[i + 1]) / 2, y: centroid.y }; }
  }
  return best ? { center: toCoordinate(best), method: "polygon_interior_point" } : null;
}

/** Compass bearing (0 = north, 90 = east) of the vector from `a` to `b` on the local grid. */
const bearingOf = (a: XY, b: XY) => ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;

/** How far back along the hole line to look when reading the direction of play onto the green. */
export const APPROACH_LOOKBACK_METERS = 30;
/** Shorter than this, a line can't give a direction worth trusting. */
const MIN_DIRECTION_METERS = 10;
/** The hole line has to finish on (or right next to) the green for its direction to describe the approach. */
const MAX_LINE_END_FROM_GREEN_METERS = 20;

/**
 * Direction of play onto the green from a hole's centerline (drawn tee → green): the bearing of the line's final
 * 30 m — from the point 30 m back along the line to its end. That is the last leg after any dogleg, not the overall
 * tee → green bearing. Null when the line is too short, or doesn't finish at the green.
 */
export function approachBearingFromCenterline(centerline: GolfCoordinate[], green: GolfPolygon): number | null {
  if (centerline.length < 2 || green.coordinates.length < 3) return null;
  const { toXY } = grid(green.coordinates[0]);
  const line = centerline.map(toXY);
  const end = line[line.length - 1];
  const outline = green.coordinates.map(toXY);
  const endDistance = insideRing(end, outline) ? 0 : Math.min(...outline.map((a, i) => pointToSegment(end, a, outline[(i + 1) % outline.length])));
  if (endDistance > MAX_LINE_END_FROM_GREEN_METERS) return null;

  let remaining = APPROACH_LOOKBACK_METERS, from = line[0];
  for (let i = line.length - 1; i > 0; i--) {
    const a = line[i - 1], b = line[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length >= remaining) { from = { x: b.x + ((a.x - b.x) * remaining) / length, y: b.y + ((a.y - b.y) * remaining) / length }; remaining = 0; break; }
    remaining -= length;
  }
  if (Math.hypot(end.x - from.x, end.y - from.y) < MIN_DIRECTION_METERS) return null;
  return bearingOf(from, end);
}

/** Bearing from a point (e.g. a tee) to the green center; null if they're too close to give a direction. */
export function bearingBetween(from: GolfCoordinate, to: GolfCoordinate): number | null {
  const { toXY } = grid(to);
  const a = toXY(from), b = toXY(to);
  return Math.hypot(b.x - a.x, b.y - a.y) < MIN_DIRECTION_METERS ? null : bearingOf(a, b);
}

function pointToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Front and back of the green along the line of play: draw the line through the center in the direction of play and
 * find every place it crosses the green's outline. FRONT is the crossing furthest back toward the player (the first
 * green the ball would reach); BACK is the crossing furthest ahead (the last green). Both lie exactly on the real
 * outline, so on an odd-shaped green the line may leave and re-enter the green between them — front / back are still
 * its first and last green. Null if the line doesn't cross the outline on both sides of the center.
 */
export function greenFrontBack(polygon: GolfPolygon, center: GolfCoordinate, approachBearingDegrees: number): { front: GolfCoordinate; back: GolfCoordinate } | null {
  if (polygon.coordinates.length < 3) return null;
  const { toXY, toCoordinate } = grid(center);
  const outline = polygon.coordinates.map(toXY);
  const radians = (approachBearingDegrees * Math.PI) / 180;
  const u = { x: Math.sin(radians), y: Math.cos(radians) };
  // Line: P(t) = t·u (center at origin). Segment: A + s·(B − A), 0 ≤ s ≤ 1. Solve with 2-D cross products.
  const ts: number[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const d = { x: b.x - a.x, y: b.y - a.y };
    const denominator = u.x * d.y - u.y * d.x;
    if (Math.abs(denominator) < 1e-12) return; // parallel edge
    const s = (u.y * a.x - u.x * a.y) / denominator;
    if (s < 0 || s > 1) return;
    ts.push((a.x * d.y - a.y * d.x) / denominator);
  });
  const behind = ts.filter((t) => t < 0), ahead = ts.filter((t) => t > 0);
  if (!behind.length || !ahead.length) return null;
  const at = (t: number) => toCoordinate({ x: u.x * t, y: u.y * t });
  return { front: at(Math.min(...behind)), back: at(Math.max(...ahead)) };
}
