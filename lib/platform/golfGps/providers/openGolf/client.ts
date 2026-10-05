import { GolfProviderError } from "../GolfCourseProvider";
import type { OpenGolfCourseDetail, OpenGolfHole, OpenGolfSearchCourse, OpenGolfSearchReply, OpenGolfTee } from "./types";

/**
 * OpenGolfAPI (api.opengolfapi.org): the only file that knows its URLs and checks its replies. Server-only.
 *
 * Rate limits (OpenGolf's published limits, checked 2026-10-05):
 * - anonymous (what we use — no key): 1,000 requests / day per IP
 * - free API key: 10,000 requests / day (sent as a Bearer token; not set up yet)
 * Going over returns HTTP 429 (→ GolfProviderError "rate_limited"). The live X-RateLimit-Limit header showed 500 for
 * anonymous use on 2026-10-05, so the real ceiling may be lower than published; that header is the source of truth.
 *
 * Cache: requests go through Next.js's server fetch cache keyed by URL, so repeat searches and course opens don't spend
 * the daily limit. Only status-200 replies are stored. Reply bodies are never logged.
 */

export const OPEN_GOLF_BASE_URL = "https://api.opengolfapi.org";
/** Required wherever OpenGolf data is shown (opengolfapi.org/attribution): visible or one click away. */
export const OPEN_GOLF_ATTRIBUTION = "© OpenStreetMap contributors (ODbL 1.0) via OpenGolfAPI";
const TIMEOUT_MS = 8000;
export const SEARCH_CACHE_SECONDS = 60 * 60;
export const DETAIL_CACHE_SECONDS = 24 * 60 * 60;
const MAX_LIMIT = 50;

/**
 * Every OpenGolf path we call, in one place.
 *
 * Course detail: the live API (and the `_upgrade` hint in its own replies) serves full detail — course info, tees and
 * holes in one reply — at /api/v1/courses/{id}. Some OpenGolf GitHub / homepage examples still show /v1/courses/{id},
 * which returns less (scorecard pars only, no tees or yardages). We use /api/v1; if OpenGolf moves it, change it here.
 */
export const OPEN_GOLF_PATHS = {
  search: "/v1/courses/search",
  courseDetail: (id: string) => `/api/v1/courses/${encodeURIComponent(id)}`,
};
const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Fetch = typeof fetch;

export interface OpenGolfClient {
  search(text: string, options?: { state?: string; limit?: number }): Promise<OpenGolfSearchReply>;
  /** Null when OpenGolf has no course with this id. */
  courseDetail(id: string): Promise<OpenGolfCourseDetail | null>;
}

export function createOpenGolfClient({ fetchImpl = fetch, baseUrl = OPEN_GOLF_BASE_URL, timeoutMs = TIMEOUT_MS }: { fetchImpl?: Fetch; baseUrl?: string; timeoutMs?: number } = {}): OpenGolfClient {
  const fail = (kind: ConstructorParameters<typeof GolfProviderError>[1], message: string, status?: number) => new GolfProviderError("open_golf", kind, message, status);

  /** JSON from OpenGolf, or null for a 404 when `notFoundIsNull`. Throws GolfProviderError for everything else. */
  async function get(path: string, revalidate: number, notFoundIsNull = false): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        headers: { Accept: "application/json" },
        next: { revalidate },
        signal: AbortSignal.timeout(timeoutMs),
      } as RequestInit);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") throw fail("timeout", `OpenGolf did not answer within ${timeoutMs / 1000}s`);
      throw fail("network", "Could not reach OpenGolf");
    }
    if (response.status === 404 && notFoundIsNull) return null;
    if (response.status === 429) throw fail("rate_limited", "OpenGolf's daily request limit was reached", 429);
    if (!response.ok) throw fail("http", `OpenGolf answered ${response.status}`, response.status);
    try {
      return await response.json();
    } catch {
      throw fail("malformed", "OpenGolf's reply was not JSON");
    }
  }

  return {
    async search(text, { state, limit = 20 } = {}) {
      const q = text.trim();
      if (q.length < 2 || q.length > 100) throw fail("bad_request", "Search needs 2–100 characters");
      if (state !== undefined && !/^[A-Za-z]{2}$/.test(state)) throw fail("bad_request", "State must be a two-letter code");
      const params = new URLSearchParams({ q, limit: String(Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))) });
      if (state) params.set("state", state.toUpperCase());
      const reply = parseSearchReply(await get(`${OPEN_GOLF_PATHS.search}?${params}`,SEARCH_CACHE_SECONDS));
      if (!reply) throw fail("malformed", "OpenGolf's search reply had no course list");
      return reply;
    },
    async courseDetail(id) {
      if (!UUID.test(id)) throw fail("bad_request", "Not an OpenGolf course id");
      const json = await get(OPEN_GOLF_PATHS.courseDetail(id),DETAIL_CACHE_SECONDS, true);
      if (json === null) return null;
      const detail = parseCourseDetail(json);
      if (!detail) throw fail("malformed", "OpenGolf's course reply had no course id");
      return detail;
    },
  };
}

// --- Reply checking: anything missing or the wrong type becomes null, never a guess. ----------------------------------

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const positiveInt = (value: unknown): number | null => { const n = num(value); return n !== null && Number.isInteger(n) && n > 0 ? n : null; };
const str = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const between = (value: unknown, low: number, high: number): number | null => { const n = num(value); return n !== null && n >= low && n <= high ? n : null; };
const list = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record).filter((item): item is Record<string, unknown> => item !== null) : [];

/** The search reply's course list (hits without an id or name are dropped), or null if there is no list at all. */
export function parseSearchReply(json: unknown): OpenGolfSearchReply | null {
  const reply = record(json);
  if (!reply || !Array.isArray(reply.courses)) return null;
  const courses = list(reply.courses).flatMap((c): OpenGolfSearchCourse[] => {
    const id = str(c.id), name = str(c.name) ?? str(c.course_name);
    if (!id || !name) return [];
    return [{ id, name, city: str(c.city), state: str(c.state), latitude: between(c.latitude, -90, 90), longitude: between(c.longitude, -180, 180), par: positiveInt(c.par) }];
  });
  const total = num(reply.total);
  return { courses, total: total !== null && total >= 0 ? total : null };
}

const GEOMETRY_FIELDS = ["tee_coords", "green", "green_polygon", "fairway_polygon", "landing_zone", "dogleg", "elevation", "hazards"] as const;

/** Has OpenGolf put anything in this field? (An object of all-null values, like `green`, counts as empty.) */
function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  const object = record(value);
  return object ? Object.values(object).some(hasContent) : true;
}

function parseHole(h: Record<string, unknown>): OpenGolfHole | null {
  const number = positiveInt(h.number);
  if (number === null) return null;
  const yardages: Record<string, number> = {};
  for (const [key, value] of Object.entries(record(h.yardages) ?? {})) {
    const yards = positiveInt(value);
    if (yards !== null) yardages[key] = yards;
  }
  return {
    number,
    par: positiveInt(h.par),
    handicap_index: positiveInt(h.handicap_index),
    yardages,
    geometryFieldsPresent: GEOMETRY_FIELDS.filter((field) => hasContent(h[field])),
  };
}

function parseTee(t: Record<string, unknown>): OpenGolfTee | null {
  const tee_name = str(t.tee_name);
  if (!tee_name) return null;
  return {
    tee_key: str(t.tee_key), tee_name, tee_color: str(t.tee_color), gender: str(t.gender),
    course_rating: between(t.course_rating, 40, 90), slope: between(t.slope, 55, 155),
    par: positiveInt(t.par), yardage: positiveInt(t.yardage),
  };
}

/** The course-detail reply, or null if it isn't a course (no id). Bad tees / holes are dropped one by one. */
export function parseCourseDetail(json: unknown): OpenGolfCourseDetail | null {
  const c = record(json);
  const id = str(c?.id);
  if (!c || !id) return null;
  return {
    id,
    course_name: str(c.course_name) ?? str(c.name),
    club_name: str(c.club_name),
    address: str(c.address),
    city: str(c.city),
    state: str(c.state),
    postal_code: str(c.postal_code),
    lat: between(c.lat ?? c.latitude, -90, 90),
    lng: between(c.lng ?? c.longitude, -180, 180),
    timezone: str(c.timezone),
    type: str(c.type),
    par: positiveInt(c.par),
    holes: positiveInt(c.holes),
    architect: str(c.architect),
    year_built: between(c.year_built, 1700, 2200),
    phone: str(c.phone),
    website: str(c.website),
    tees: list(c.tees).map(parseTee).filter((t): t is OpenGolfTee => t !== null),
    holes_data: list(c.holes_data).map(parseHole).filter((h): h is OpenGolfHole => h !== null),
  };
}
