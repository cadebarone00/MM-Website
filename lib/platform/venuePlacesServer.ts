import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { areaCenter, areaKey, needsRefresh, overpassQuery, parseOverpass } from "./osmPlaces";
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
