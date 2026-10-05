import type { GolfCoordinate } from "../../domain";
import { GolfProviderError, type GolfProviderErrorKind } from "../GolfCourseProvider";
import type { OsmElement, OsmElementType, OsmMember, OsmPoint } from "./types";

/**
 * OpenStreetMap via the public Overpass API: the only file that knows Overpass URLs, query text and reply shapes.
 * Server-only.
 *
 * Public-instance etiquette (dev.overpass-api.de/overpass-doc, "Commons"): about 10,000 requests and 1 GB per day per
 * IP; busy servers answer 429 (rate limit) or 504 (no capacity). So: one small query to find the course, then one
 * query limited to that course's bounding box; both are GET requests cached by Next.js's server fetch cache for a day;
 * no automatic retries — a busy server is reported, and the person can try again later.
 */

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
/** Required by OpenStreetMap's license (openstreetmap.org/copyright) wherever OSM data is shown. */
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
/** How far from the course's location to look for golf-course boundaries. A boundary only has to come this close. */
export const COURSE_SEARCH_RADIUS_METERS = 1500;
/** Server-side limit we ask Overpass for; the HTTP timeout is a little longer so Overpass can answer with its own error. */
const QUERY_TIMEOUT_SECONDS = 25;
const HTTP_TIMEOUT_MS = 30_000;
/** Refuse replies bigger than this (Overpass stops and reports an error instead). */
const MAX_REPLY_BYTES = 32 * 1024 * 1024;
export const OVERPASS_CACHE_SECONDS = 24 * 60 * 60;
/** The golf=* values we import. Others (cartpath, rough, clubhouse, driving_range, pin …) are left out. */
export const IMPORTED_GOLF_VALUES = ["hole", "tee", "green", "fairway", "bunker", "water_hazard", "lateral_water_hazard", "penalty_area"] as const;

export interface OsmBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const settings = (bbox?: OsmBoundingBox) =>
  `[out:json][timeout:${QUERY_TIMEOUT_SECONDS}][maxsize:${MAX_REPLY_BYTES}]${bbox ? `[bbox:${bboxText(bbox)}]` : ""};`;
const bboxText = (b: OsmBoundingBox) => [b.south, b.west, b.north, b.east].map((n) => n.toFixed(6)).join(",");

/** Step 1: every leisure=golf_course (way or multipolygon relation) whose outline comes within the radius, with its outline. */
export function courseCandidatesQuery(location: GolfCoordinate, radiusMeters = COURSE_SEARCH_RADIUS_METERS): string {
  return `${settings()}nwr["leisure"="golf_course"](around:${radiusMeters},${location.lat.toFixed(6)},${location.lng.toFixed(6)});out geom;`;
}

/**
 * Step 2: golf features and water inside the matched course's bounding box. Water outlines are clipped to the box so a
 * huge lake next door can't blow up the reply (a clipped outline is incomplete and gets skipped).
 */
export function courseFeaturesQuery(bbox: OsmBoundingBox): string {
  return `${settings(bbox)}nwr["golf"~"^(${IMPORTED_GOLF_VALUES.join("|")})$"];out geom;nwr["natural"="water"];out geom(${bboxText(bbox)});`;
}

type Fetch = typeof fetch;

export interface OverpassClient {
  run(query: string): Promise<OsmElement[]>;
}

export function createOverpassClient({ fetchImpl = fetch, endpoint = OVERPASS_ENDPOINT, timeoutMs = HTTP_TIMEOUT_MS }: { fetchImpl?: Fetch; endpoint?: string; timeoutMs?: number } = {}): OverpassClient {
  const fail = (kind: GolfProviderErrorKind, message: string, status?: number) => new GolfProviderError("openstreetmap", kind, message, status);
  return {
    async run(query) {
      let response: Response;
      try {
        response = await fetchImpl(`${endpoint}?${new URLSearchParams({ data: query })}`, {
          headers: { Accept: "application/json", "User-Agent": "TheMaroon/1.0 (golf course geometry; server-side)" },
          next: { revalidate: OVERPASS_CACHE_SECONDS },
          signal: AbortSignal.timeout(timeoutMs),
        } as RequestInit);
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "TimeoutError" || name === "AbortError") throw fail("timeout", `Overpass did not answer within ${timeoutMs / 1000}s`);
        throw fail("network", "Could not reach Overpass");
      }
      if (response.status === 429) throw fail("rate_limited", "Overpass rate limit reached — try again in a few minutes", 429);
      if (response.status === 504) throw fail("rate_limited", "Overpass is too busy right now — try again in a few minutes", 504);
      if (!response.ok) throw fail("http", `Overpass answered ${response.status}`, response.status);
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        throw fail("malformed", "Overpass's reply was not JSON");
      }
      return parseOverpassReply(json, fail);
    },
  };
}

// --- Reply checking -----------------------------------------------------------------------------------------------

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const isType = (value: unknown): value is OsmElementType => value === "node" || value === "way" || value === "relation";
const point = (value: unknown): OsmPoint | null => {
  const p = record(value);
  const lat = p?.lat, lon = p?.lon;
  return typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
};
/** A point list, or null if it's missing or any point is missing (clipped geometry comes back with gaps). */
const points = (value: unknown): OsmPoint[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const list = value.map(point);
  return list.every((p): p is OsmPoint => p !== null) ? list : null;
};
const tags = (value: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(record(value) ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));

/**
 * The elements of an Overpass reply. Overpass reports some failures (timeouts, out of memory) as a 200 reply with a
 * `remark` and partial data — those are errors here, so half a course is never imported. Bad elements are dropped.
 */
export function parseOverpassReply(json: unknown, fail = (kind: GolfProviderErrorKind, message: string) => new GolfProviderError("openstreetmap", kind, message)): OsmElement[] {
  const reply = record(json);
  if (!reply || !Array.isArray(reply.elements)) throw fail("malformed", "Overpass's reply had no element list");
  if (typeof reply.remark === "string" && /error|timed out|out of memory/i.test(reply.remark)) {
    throw fail(/timed out/i.test(reply.remark) ? "timeout" : "http", "Overpass stopped before finishing the query");
  }
  return reply.elements.flatMap((value): OsmElement[] => {
    const e = record(value);
    if (!e || !isType(e.type) || typeof e.id !== "number") return [];
    const element: OsmElement = { type: e.type, id: e.id, tags: tags(e.tags) };
    if (e.type === "node") {
      const p = point(e);
      if (!p) return [];
      element.point = p;
    } else if (e.type === "way") {
      element.geometry = points(e.geometry);
    } else {
      element.members = (Array.isArray(e.members) ? e.members : []).flatMap((m): OsmMember[] => {
        const member = record(m);
        if (!member || !isType(member.type) || typeof member.ref !== "number") return [];
        return [{ type: member.type, ref: member.ref, role: typeof member.role === "string" ? member.role : "", geometry: points(member.geometry) }];
      });
    }
    return [element];
  });
}
