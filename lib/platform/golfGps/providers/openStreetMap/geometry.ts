import type { GolfCoordinate } from "../../domain";
import type { OsmElement, OsmPoint } from "./types";

/**
 * Plane geometry for matching OSM features to courses and holes. Points are projected onto a flat grid in meters around
 * one origin (accurate to well under a meter across a golf course). Nothing here creates new shapes — it only measures
 * and assembles what OSM already has.
 */

export interface XY { x: number; y: number }

const METERS_PER_DEGREE = (Math.PI / 180) * 6_371_008.8;

export function projector(origin: GolfCoordinate) {
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  return (p: GolfCoordinate): XY => ({ x: (p.lng - origin.lng) * METERS_PER_DEGREE * cos, y: (p.lat - origin.lat) * METERS_PER_DEGREE });
}

export const toCoordinate = (p: OsmPoint): GolfCoordinate => ({ lat: p.lat, lng: p.lon });

/** One outline with its cut-outs, in lat / lng (rings open: first point not repeated). */
export interface Ring { outer: GolfCoordinate[]; inner: GolfCoordinate[][] }

const same = (a: OsmPoint, b: OsmPoint) => a.lat === b.lat && a.lon === b.lon;
const open = (ring: OsmPoint[]) => ring.slice(0, -1).map(toCoordinate);

/** A closed way as an outline; null if it isn't closed (an open way can't be an area). */
export function wayRing(points: OsmPoint[]): GolfCoordinate[] | null {
  return points.length >= 4 && same(points[0], points[points.length - 1]) ? open(points) : null;
}

/** Join way segments end-to-end into closed rings. Returns null if any segment can't be closed (incomplete data). */
function assembleRings(segments: OsmPoint[][]): OsmPoint[][] | null {
  const left = segments.map((segment) => [...segment]);
  const rings: OsmPoint[][] = [];
  while (left.length) {
    let ring = left.shift()!;
    while (!same(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const index = left.findIndex((segment) => same(segment[0], end) || same(segment[segment.length - 1], end));
      if (index < 0) return null;
      const [next] = left.splice(index, 1);
      ring = [...ring, ...(same(next[0], end) ? next : [...next].reverse()).slice(1)];
    }
    if (ring.length < 4) return null;
    rings.push(ring);
  }
  return rings;
}

/**
 * The outlines of an area element: a closed way, or a multipolygon relation's outer rings each with the inner rings
 * that sit inside it. Null when the geometry is missing, clipped or doesn't close.
 */
export function elementRings(element: OsmElement): Ring[] | null {
  if (element.type === "way") {
    const ring = element.geometry ? wayRing(element.geometry) : null;
    return ring ? [{ outer: ring, inner: [] }] : null;
  }
  if (element.type !== "relation" || !element.members?.length) return null;
  const ways = element.members.filter((m) => m.type === "way");
  if (!ways.length || ways.some((m) => !m.geometry)) return null;
  const outers = assembleRings(ways.filter((m) => m.role !== "inner").map((m) => m.geometry!));
  const inners = assembleRings(ways.filter((m) => m.role === "inner").map((m) => m.geometry!));
  if (!outers?.length || !inners) return null;
  const rings: Ring[] = outers.map((outer) => ({ outer: open(outer), inner: [] }));
  for (const inner of inners.map(open)) {
    const home = rings.find((ring) => insideRing(inner[0], ring.outer));
    if (home) home.inner.push(inner);
  }
  return rings;
}

/** Ray-casting point-in-ring, on lat / lng (fine at course scale). */
export function insideRing(p: GolfCoordinate, ring: GolfCoordinate[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

export const insideRings = (p: GolfCoordinate, rings: Ring[]) =>
  rings.some((ring) => insideRing(p, ring.outer) && !ring.inner.some((hole) => insideRing(p, hole)));

function pointToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Meters from a point to a line (open) or a ring's edge (closed). */
export function pointToPath(p: XY, path: XY[], closed = false): number {
  if (path.length === 1) return Math.hypot(p.x - path[0].x, p.y - path[0].y);
  let best = Infinity;
  const last = closed ? path.length : path.length - 1;
  for (let i = 0; i < last; i++) best = Math.min(best, pointToSegment(p, path[i], path[(i + 1) % path.length]));
  return best;
}

/** Meters from a point to an area: 0 inside it, else to its nearest edge. */
export function pointToRings(p: GolfCoordinate, rings: Ring[], project: (c: GolfCoordinate) => XY): number {
  if (insideRings(p, rings)) return 0;
  const xy = project(p);
  return Math.min(...rings.map((ring) => pointToPath(xy, ring.outer.map(project), true)));
}

/** Area-weighted middle of an outline (average of its points if it has no area). */
export function ringCentroid(ring: GolfCoordinate[]): GolfCoordinate {
  let twiceArea = 0, lat = 0, lng = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const cross = a.lng * b.lat - b.lng * a.lat;
    twiceArea += cross;
    lat += (a.lat + b.lat) * cross;
    lng += (a.lng + b.lng) * cross;
  });
  if (Math.abs(twiceArea) < 1e-14) return { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lng: ring.reduce((s, p) => s + p.lng, 0) / ring.length };
  return { lat: lat / (3 * twiceArea), lng: lng / (3 * twiceArea) };
}

/** Points every `stepMeters` along a line (plus its vertices), for "does this line pass through that area" checks. */
export function densify(line: XY[], stepMeters = 5): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepMeters));
    for (let s = 0; s < steps; s++) out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  out.push(line[line.length - 1]);
  return out;
}

export const lineLength = (line: XY[]) => line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - line[i].x, p.y - line[i].y), 0);

/** How far along a line (meters from its start) the point nearest to `p` is. */
export function alongLine(p: XY, line: XY[]): number {
  let best = Infinity, bestAlong = 0, walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length))) : 0;
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < best) { best = d; bestAlong = walked + t * length; }
    walked += length;
  }
  return bestAlong;
}

/** The bounding box around some points, padded by `padMeters`. */
export function boundingBox(points: GolfCoordinate[], padMeters: number) {
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const padLat = padMeters / METERS_PER_DEGREE;
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const padLng = padMeters / (METERS_PER_DEGREE * Math.cos((midLat * Math.PI) / 180));
  return { south: Math.min(...lats) - padLat, west: Math.min(...lngs) - padLng, north: Math.max(...lats) + padLat, east: Math.max(...lngs) + padLng };
}
