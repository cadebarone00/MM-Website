import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { areaCenter, areaKey, areasToRefresh, needsRefresh, overpassQuery, parseOverpass } from "./osmPlaces";
import { PLACE_CATEGORIES, type Place, type PlaceCategory } from "./venuePlaces";

/**
 * Venue places, phase 2 (supabase/venue_places.sql; project_specs.md "Venue tab → Places recommendations"). Reads a trip's
 * places from OUR database and, when an area + category is missing or over 30 days old, looks it up on OpenStreetMap's
 * free Overpass servers in the background (the person never waits on it) and stores the answer for every later trip.
 * The public Overpass servers are sometimes at capacity, so several are tried in turn, each attempt is time-limited,
 * and a failed area isn't retried for COOLDOWN_MS.
 */
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const ATTEMPT_MS = 40_000;
const COOLDOWN_MS = 5 * 60_000;
// Per server instance: lookups in progress and recent failures, so one area isn't fetched twice at once or hammered.
const inFlight = new Set<string>();
const failedAt = new Map<string, number>();

export type StoredPlace = Place & { website: string | null; phone: string | null; openingHours: string | null; savedByMe: boolean; source: "osm" | "user" };
export type TripPlacesResult =
  | { status: "ok"; area: string; places: StoredPlace[]; refreshing: PlaceCategory[] }
  | { status: "no-destination" } | { status: "unavailable" };

/** The categories a request covers: one, or all of them. */
export const categoriesFor = (category: PlaceCategory | null): PlaceCategory[] => category ? [category] : PLACE_CATEGORIES.map((c) => c.key);

/**
 * A member's places for their trip. `schedule` runs work after the reply has gone (Next's after()): stale categories are
 * looked up there. Returns which categories are refreshing so the screen can say "Finding more places…".
 */
export async function tripPlaces(input: { profileId: string; tripId: string; latitude: number | null; longitude: number | null; category: PlaceCategory | null },
  schedule: (work: () => Promise<void>) => void, now = new Date()): Promise<TripPlacesResult> {
  if (input.latitude == null || input.longitude == null) return { status: "no-destination" };
  const db = createSupabaseServiceRoleClient();
  const area = areaKey(input.latitude, input.longitude);
  const refreshing: PlaceCategory[] = [];
  for (const category of categoriesFor(input.category)) {
    const { data, error } = await db.rpc("place_area_fetched_at", { p_area: area, p_category: category });
    if (error) return { status: "unavailable" }; // venue_places.sql not installed yet
    const key = `${area}|${category}`;
    if (!needsRefresh(data as string | null, now) || inFlight.has(key) || now.getTime() - (failedAt.get(key) ?? 0) < COOLDOWN_MS) continue;
    refreshing.push(category);
    inFlight.add(key);
    schedule(async () => {
      try { await refreshArea(area, category); failedAt.delete(key); }
      catch (problem) { failedAt.set(key, Date.now()); console.error("venue places lookup failed:", area, category, problem instanceof Error ? problem.message : problem); }
      finally { inFlight.delete(key); }
    });
  }
  const { data, error } = await db.rpc("list_trip_places", { p_profile: input.profileId, p_trip: input.tripId, p_area: area, p_category: input.category });
  if (error) return { status: "unavailable" };
  return { status: "ok", area, places: (Array.isArray(data) ? data : []) as StoredPlace[], refreshing };
}

/** Look one area + category up on OpenStreetMap and store it (also records the lookup, even when it found nothing). */
export async function refreshArea(area: string, category: PlaceCategory): Promise<number> {
  const json = await overpass(overpassQuery(category, areaCenter(area)));
  const places = parseOverpass(json, category);
  const { data, error } = await createSupabaseServiceRoleClient().rpc("store_osm_places", { p_area: area, p_category: category, p_places: places });
  if (error) throw new Error(`store_osm_places: ${error.message}`);
  return Number(data) || 0;
}

/** POSTs a query to each Overpass server in turn until one answers with JSON. */
async function overpass(query: string): Promise<unknown> {
  const problems: string[] = [];
  for (const server of OVERPASS_SERVERS) {
    try {
      const response = await fetch(server, {
        method: "POST", body: new URLSearchParams({ data: query }), cache: "no-store", signal: AbortSignal.timeout(ATTEMPT_MS),
        // Overpass asks every app to identify itself.
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TheMaroon/1.0 (+https://themaroon.site)" },
      });
      const json = response.ok ? await response.json().catch(() => null) : null;
      if (json && Array.isArray((json as { elements?: unknown }).elements)) return json;
      problems.push(`${new URL(server).host} ${response.status}`);
    } catch (problem) {
      problems.push(`${new URL(server).host} ${problem instanceof Error ? problem.name : "error"}`);
    }
  }
  throw new Error(`no Overpass server answered (${problems.join("; ")})`);
}

/**
 * The daily job (GET /api/internal/venue-places, vercel.json): looks up the areas of upcoming and current trips ahead of
 * time, so places are already stored when someone opens Venue. Soonest trips first, one lookup at a time, stopping
 * before `budgetMs` runs out; whatever is left (or failed) is retried the next day. Answers counts only.
 */
export async function refreshUpcomingAreas(now = new Date(), budgetMs = 50_000, limit = 6): Promise<{ planned: number; stored: number; failed: number; skipped: string | null }> {
  const started = Date.now();
  const db = createSupabaseServiceRoleClient();
  const today = now.toISOString().slice(0, 10);
  const trips = await db.from("golf_trips").select("latitude, longitude, start_date").gte("end_date", today).not("latitude", "is", null).limit(500);
  if (trips.error) return { planned: 0, stored: 0, failed: 0, skipped: "trips unavailable" };
  const rows = (trips.data ?? []) as { latitude: number | null; longitude: number | null; start_date: string }[];
  const areas = [...new Set(rows.filter((r) => r.latitude != null && r.longitude != null).map((r) => areaKey(r.latitude!, r.longitude!)))];
  if (!areas.length) return { planned: 0, stored: 0, failed: 0, skipped: null };
  const fetches = await db.from("place_area_fetches").select("area_key, category, fetched_at").in("area_key", areas);
  if (fetches.error) return { planned: 0, stored: 0, failed: 0, skipped: "venue_places.sql not installed" };
  const fetched = new Map(((fetches.data ?? []) as { area_key: string; category: string; fetched_at: string }[]).map((f) => [`${f.area_key}|${f.category}`, f.fetched_at]));
  const jobs = areasToRefresh(rows.map((r) => ({ latitude: r.latitude, longitude: r.longitude, startDate: r.start_date })), fetched, now, categoriesFor(null), limit);
  let stored = 0, failed = 0;
  for (const job of jobs) {
    if (Date.now() - started > budgetMs - ATTEMPT_MS) break; // not enough time left for another attempt
    try { await refreshArea(job.area, job.category); stored++; }
    catch (problem) { failed++; console.error("venue places daily lookup failed:", job.area, job.category, problem instanceof Error ? problem.message.slice(0, 160) : problem); }
  }
  return { planned: jobs.length, stored, failed, skipped: null };
}
