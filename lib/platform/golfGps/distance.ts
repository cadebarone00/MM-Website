import type { LatLng } from "./types";

/** Mean Earth radius (IUGG), in meters. */
const EARTH_RADIUS_METERS = 6_371_008.8;
const METERS_PER_YARD = 0.9144;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle (Haversine) distance between two points, in meters. Accurate to well under a yard at golf distances. */
export function distanceMeters(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Straight-line distance between two points, rounded to whole yards. */
export function distanceYards(from: LatLng, to: LatLng): number {
  return Math.round(distanceMeters(from, to) / METERS_PER_YARD);
}

/** Compass direction from one point to another, in degrees (0 = north, 90 = east), 0–360. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const dLng = toRadians(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRadians(to.lat));
  const x = Math.cos(toRadians(from.lat)) * Math.sin(toRadians(to.lat)) - Math.sin(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The point `yards` away from `point` in compass direction `bearing` (degrees). */
export function moveAlong(point: LatLng, bearing: number, yards: number): LatLng {
  const radians = toRadians(bearing);
  return offsetByYards(point, yards * Math.cos(radians), yards * Math.sin(radians));
}

/** The point `north` yards north and `east` yards east of `point` (negative = south / west). Used to build and move mock geometry. */
export function offsetByYards(point: LatLng, north: number, east: number): LatLng {
  const metersNorth = north * METERS_PER_YARD;
  const metersEast = east * METERS_PER_YARD;
  const lat = point.lat + (metersNorth / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const lng = point.lng + (metersEast / (EARTH_RADIUS_METERS * Math.cos(toRadians(point.lat)))) * (180 / Math.PI);
  return { lat, lng };
}

/**
 * Yards from a point to a hazard. With a mapped outline: to its nearest edge (0 when standing in it). Without one: to its
 * middle point, as before. Nearest edge is not a carry distance — that needs the line of the shot.
 */
export function distanceToHazardYards(from: LatLng, hazard: { center: LatLng; outline?: LatLng[] }): number {
  const outline = hazard.outline;
  if (!outline || outline.length < 3) return distanceYards(from, hazard.center);
  // Flat grid in yards around the player (accurate to well under a yard at golf distances).
  const cos = Math.cos(toRadians(from.lat));
  const yardsPerDegree = (EARTH_RADIUS_METERS * Math.PI) / 180 / METERS_PER_YARD;
  const ring = outline.map((p) => ({ x: (p.lng - from.lng) * yardsPerDegree * cos, y: (p.lat - from.lat) * yardsPerDegree }));
  let inside = false, nearest = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > 0) !== (b.y > 0) && 0 < ((b.x - a.x) * -a.y) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, (-a.x * dx - a.y * dy) / length2)) : 0;
    nearest = Math.min(nearest, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return inside ? 0 : Math.round(nearest);
}
