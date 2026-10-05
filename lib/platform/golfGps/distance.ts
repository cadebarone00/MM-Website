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

/** The point `north` yards north and `east` yards east of `point` (negative = south / west). Used to build and move mock geometry. */
export function offsetByYards(point: LatLng, north: number, east: number): LatLng {
  const metersNorth = north * METERS_PER_YARD;
  const metersEast = east * METERS_PER_YARD;
  const lat = point.lat + (metersNorth / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const lng = point.lng + (metersEast / (EARTH_RADIUS_METERS * Math.cos(toRadians(point.lat)))) * (180 / Math.PI);
  return { lat, lng };
}
