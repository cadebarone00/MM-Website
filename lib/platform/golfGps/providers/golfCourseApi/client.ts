import { GolfProviderError } from "../GolfCourseProvider";
import type { GolfCourseApiCourse, GolfCourseApiHole, GolfCourseApiSearchCourse, GolfCourseApiTeeBox } from "./types";

/**
 * GolfCourseAPI (api.golfcourseapi.com): the only file that knows its URLs, its key and its reply shapes. Server-only.
 *
 * Key: GOLF_COURSE_API_KEY (server-only env var, never sent to the browser), sent as `Authorization: Bearer <key>`.
 * Plans (golfcourseapi.com, 2026-11-21): Free = 35 requests / day, Pro = 10,000 / day. Over the limit → 429
 * (→ GolfProviderError "rate_limited"). A bad or missing key → 401 (→ "http").
 *
 * Cache: requests go through Next.js's server fetch cache keyed by URL, so repeat searches and course opens don't spend
 * the daily limit. Only status-200 replies are stored. Reply bodies are never logged. Terms allow caching data returned
 * by ordinary use of the app; never loop over search to copy their catalog, and never pass the data on to other apps.
 */

export const GOLF_COURSE_API_BASE_URL = "https://api.golfcourseapi.com";
/** Credit line shown with GolfCourseAPI data (their terms don't require one; we show it so the source is clear). */
export const GOLF_COURSE_API_ATTRIBUTION = "Course data: GolfCourseAPI";
const TIMEOUT_MS = 8000;
export const SEARCH_CACHE_SECONDS = 60 * 60;
export const DETAIL_CACHE_SECONDS = 24 * 60 * 60;

export const GOLF_COURSE_API_PATHS = {
  search: "/v1/search",
  course: (id: string) => `/v1/courses/${encodeURIComponent(id)}`,
};
/** Course ids: 8 characters from 0-9 and a-z without i, l, o, u (their docs). Case-insensitive on input. */
export const GOLF_COURSE_API_ID = /^[0-9abcdefghjkmnpqrstvwxyz]{8}$/;

type Fetch = typeof fetch;

export interface GolfCourseApiClient {
  search(text: string): Promise<GolfCourseApiSearchCourse[]>;
  /** Null when GolfCourseAPI has no course with this id. */
  course(id: string): Promise<GolfCourseApiCourse | null>;
}

export function createGolfCourseApiClient({
  fetchImpl = fetch, baseUrl = GOLF_COURSE_API_BASE_URL, timeoutMs = TIMEOUT_MS, apiKey = process.env.GOLF_COURSE_API_KEY,
}: { fetchImpl?: Fetch; baseUrl?: string; timeoutMs?: number; apiKey?: string } = {}): GolfCourseApiClient {
  const fail = (kind: ConstructorParameters<typeof GolfProviderError>[1], message: string, status?: number) =>
    new GolfProviderError("golf_course_api", kind, message, status);

  /** JSON from GolfCourseAPI, or null for a 404 when `notFoundIsNull`. Throws GolfProviderError for everything else. */
  async function get(path: string, revalidate: number, notFoundIsNull = false): Promise<unknown> {
    const key = apiKey?.trim();
    if (!key) throw fail("http", "GolfCourseAPI key is not set (GOLF_COURSE_API_KEY)");
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
        next: { revalidate },
        signal: AbortSignal.timeout(timeoutMs),
      } as RequestInit);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") throw fail("timeout", `GolfCourseAPI did not answer within ${timeoutMs / 1000}s`);
      throw fail("network", "Could not reach GolfCourseAPI");
    }
    if (response.status === 404 && notFoundIsNull) return null;
    if (response.status === 429) throw fail("rate_limited", "GolfCourseAPI's daily request limit was reached", 429);
    if (response.status === 401) throw fail("http", "GolfCourseAPI refused the key (401)", 401);
    if (!response.ok) throw fail("http", `GolfCourseAPI answered ${response.status}`, response.status);
    try {
      return await response.json();
    } catch {
      throw fail("malformed", "GolfCourseAPI's reply was not JSON");
    }
  }

  return {
    async search(text) {
      const q = text.trim();
      if (q.length < 2 || q.length > 100) throw fail("bad_request", "Search needs 2–100 characters");
      const reply = parseSearchReply(await get(`${GOLF_COURSE_API_PATHS.search}?${new URLSearchParams({ search_query: q })}`, SEARCH_CACHE_SECONDS));
      if (!reply) throw fail("malformed", "GolfCourseAPI's search reply had no course list");
      return reply;
    },
    async course(id) {
      const clean = id.trim().toLowerCase();
      if (!GOLF_COURSE_API_ID.test(clean)) throw fail("bad_request", "Not a GolfCourseAPI course id");
      const json = await get(GOLF_COURSE_API_PATHS.course(clean), DETAIL_CACHE_SECONDS, true);
      if (json === null) return null;
      const course = parseCourse(json);
      if (!course) throw fail("malformed", "GolfCourseAPI's course reply had no course id");
      return course;
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
const courseId = (value: unknown): string | null => { const id = str(value)?.toLowerCase() ?? null; return id && GOLF_COURSE_API_ID.test(id) ? id : null; };

function location(value: unknown) {
  const l = record(value);
  return {
    address: str(l?.address), city: str(l?.city), state: str(l?.state), country: str(l?.country),
    latitude: between(l?.latitude, -90, 90), longitude: between(l?.longitude, -180, 180),
  };
}

/** The search reply's courses (hits without a valid id or any name are dropped), or null if there is no list at all. */
export function parseSearchReply(json: unknown): GolfCourseApiSearchCourse[] | null {
  const reply = record(json);
  if (!reply || !Array.isArray(reply.courses)) return null;
  return list(reply.courses).flatMap((c): GolfCourseApiSearchCourse[] => {
    const id = courseId(c.id), clubName = str(c.club_name), courseName = str(c.course_name);
    if (!id || (!clubName && !courseName)) return [];
    const { city, state, latitude, longitude } = location(c.location);
    return [{ id, clubName, courseName, city, state, latitude, longitude }];
  });
}

function parseHole(h: Record<string, unknown>): GolfCourseApiHole {
  return { par: between(h.par, 3, 6), yardage: positiveInt(h.yardage), handicap: between(h.handicap, 1, 18) };
}

function parseTeeBox(t: Record<string, unknown>, gender: "male" | "female"): GolfCourseApiTeeBox | null {
  const teeName = str(t.tee_name);
  if (!teeName) return null;
  // Holes keep their position (index = hole number - 1), so a bad hole becomes all-null rather than being dropped.
  const holes = Array.isArray(t.holes) ? t.holes.map((hole) => parseHole(record(hole) ?? {})) : [];
  return {
    gender, teeName,
    courseRating: between(t.course_rating, 20, 90), slopeRating: between(t.slope_rating, 55, 155),
    totalYards: positiveInt(t.total_yards), numberOfHoles: positiveInt(t.number_of_holes), parTotal: positiveInt(t.par_total),
    holes,
  };
}

/** The course reply (wrapped in `course`, as the live API sends it, or bare), or null if it isn't a course. */
export function parseCourse(json: unknown): GolfCourseApiCourse | null {
  const outer = record(json);
  const c = record(outer?.course) ?? outer;
  const id = courseId(c?.id);
  if (!c || !id) return null;
  const tees = record(c.tees);
  return {
    id,
    clubName: str(c.club_name),
    courseName: str(c.course_name),
    ...location(c.location),
    tees: [
      ...list(tees?.male).map((t) => parseTeeBox(t, "male")),
      ...list(tees?.female).map((t) => parseTeeBox(t, "female")),
    ].filter((t): t is GolfCourseApiTeeBox => t !== null),
  };
}
