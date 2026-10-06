import { offsetByYards } from "../distance";
import type { GpsCourse, GpsHazard, GpsHole, LatLng } from "../types";
import type { GolfCourse, GolfHazardGeometry, GolfHole, GolfTeeLocation } from "./course";
import type { GolfCoordinate, GolfPolygon } from "./geometry";

/**
 * Bridge from the new domain model to the GPS prototype's shapes (`../types.ts`), so the current GPS screen can show
 * domain data without changing. One-way only: the prototype's hazards are circles (center + radius), and turning a
 * circle into a domain polygon would invent an outline.
 *
 * MIGRATION: once components/platform/gps/* read GolfHole / GolfCourse directly, delete this file together with
 * GpsCourse / GpsHole / GpsHazard in ../types.ts and the hand-built courses (mockCourse.ts, missionHillsPeteDye.ts).
 */

const METERS_PER_YARD = 0.9144;
const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Just lat / lng — drops altitude so the prototype map gets the plain points it expects. */
const flat = (point: GolfCoordinate): LatLng => ({ lat: point.lat, lng: point.lng });

/** A polygon's middle (area-weighted) and size in square yards, on a flat local grid — accurate at golf-hole scale. */
export function polygonCentroidAndArea(polygon: GolfPolygon): { centroid: LatLng; areaSquareYards: number } | null {
  const points = polygon.coordinates;
  if (points.length < 3) return null;
  const origin = points[0];
  const yardsPerDegreeNorth = (toRadians(1) * EARTH_RADIUS_METERS) / METERS_PER_YARD;
  const yardsPerDegreeEast = yardsPerDegreeNorth * Math.cos(toRadians(origin.lat));
  const local = points.map((p) => ({ north: (p.lat - origin.lat) * yardsPerDegreeNorth, east: (p.lng - origin.lng) * yardsPerDegreeEast }));

  let twiceArea = 0, north = 0, east = 0;
  local.forEach((a, i) => {
    const b = local[(i + 1) % local.length];
    const cross = a.east * b.north - b.east * a.north;
    twiceArea += cross;
    north += (a.north + b.north) * cross;
    east += (a.east + b.east) * cross;
  });
  if (twiceArea === 0) return null;
  return { centroid: offsetByYards(origin, north / (3 * twiceArea), east / (3 * twiceArea)), areaSquareYards: Math.abs(twiceArea) / 2 };
}

function teePoint(location: GolfTeeLocation): LatLng | null {
  if (location.kind === "point") return flat(location.coordinate);
  return polygonCentroidAndArea(location.polygon)?.centroid ?? null;
}

/**
 * A hazard as the prototype's circle. Outlined: given center (else the shape's middle), radius of a circle of equal
 * area. Point-only: its point with radius 0 — the size is unknown, so the HUD still gets a yardage but nothing is drawn.
 */
function hazardCircle(geometry: GolfHazardGeometry): { center: LatLng; radiusYards: number } | null {
  if (geometry.kind === "point") return { center: flat(geometry.point), radiusYards: 0 };
  const shape = polygonCentroidAndArea(geometry.polygon);
  if (!shape) return null;
  return { center: geometry.center ? flat(geometry.center) : shape.centroid, radiusYards: Math.round(Math.sqrt(shape.areaSquareYards / Math.PI)) };
}

/**
 * The prototype hole for one domain hole, measured from `teeSetId`'s tee (or the first tee with a location). Needs green
 * front / center / back. A located tee is preferred as the hole's start; without one, the start of the mapped hole
 * line is used for framing and the mock player's start (`teeMapped: false`, so no tee marker is drawn). Returns null
 * when the hole has no green targets or no start at all, rather than guessing. Penalty areas that aren't water are left
 * out: the prototype has no kind for them.
 */
export function toPrototypeGpsHole(hole: GolfHole, teeSetId?: string): GpsHole | null {
  const located = hole.tees.filter((tee) => tee.location);
  const tee = located.find((candidate) => candidate.teeSetId === teeSetId) ?? located[0];
  const teeAt = tee?.location ? teePoint(tee.location) : null;
  const lineStart = hole.centerline?.coordinates[0];
  const green = hole.green;
  if (!(teeAt || lineStart) || !green?.front || !green.center || !green.back) return null;

  const outlineOf = (geometry: GolfHazardGeometry) => geometry.kind === "polygon" ? { outline: geometry.polygon.coordinates.map(flat) } : {};
  const hazards: GpsHazard[] = [];
  for (const bunker of hole.bunkers) {
    const circle = hazardCircle(bunker.geometry);
    if (circle) hazards.push({ id: bunker.id, kind: "bunker", label: bunker.label ?? "Bunker", ...circle, ...outlineOf(bunker.geometry) });
  }
  for (const area of hole.penaltyAreas) {
    if (area.kind !== "water") continue;
    const circle = hazardCircle(area.geometry);
    if (circle) hazards.push({ id: area.id, kind: "water", label: area.label ?? "Water", ...circle, ...outlineOf(area.geometry) });
  }

  // The hole view frames real geometry only, in this order: mapped tees, hole line, fairways, green outline, boundary.
  const frame = [
    ...located.map((t) => teePoint(t.location!)).filter((p): p is LatLng => p !== null),
    ...(hole.centerline?.coordinates ?? []),
    ...hole.fairways.flatMap((fairway) => fairway.polygon.coordinates),
    ...(green.polygon?.coordinates ?? []),
    ...(hole.boundary?.coordinates ?? []),
  ].map(flat);
  return {
    number: hole.number,
    par: tee?.par ?? hole.par,
    tee: teeAt ?? flat(lineStart!),
    ...(!teeAt && { teeMapped: false }),
    green: { front: flat(green.front), center: flat(green.center), back: flat(green.back) },
    hazards,
    ...(frame.length && { frame }),
  };
}

/**
 * The prototype course for a domain course: only the holes the prototype can show, in hole-number order, with the
 * sources' credit lines as the note. Null when no hole has GPS data (the GPS screen needs at least one hole).
 */
export function toPrototypeGpsCourse(course: GolfCourse, teeSetId?: string): GpsCourse | null {
  const holes = [...course.holes]
    .sort((a, b) => a.number - b.number)
    .map((hole) => toPrototypeGpsHole(hole, teeSetId))
    .filter((hole): hole is GpsHole => hole !== null);
  if (holes.length === 0) return null;

  const credits = [...course.sources, ...course.holes.flatMap((hole) => hole.sources ?? [])]
    .map((source) => source.attribution)
    .filter((credit): credit is string => Boolean(credit));
  return { name: course.name, note: [...new Set(credits)].join(" · "), holes };
}
