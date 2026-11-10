import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { areaKey } from "./placeAreas";
import { PLACE_CATEGORIES, type Place, type PlaceCategory } from "./venuePlaces";

/**
 * Venue places (supabase/venue_places.sql; project_specs.md "Venue tab → Places recommendations"). Reads a trip's places
 * from OUR database only. The places themselves are imported once a day by a free GitHub Actions job
 * (scripts/places/import_overture.py, from Overture Maps Places), so nobody ever waits on an outside service here.
 */
export type StoredPlace = Place & { website: string | null; phone: string | null; openingHours: string | null; savedByMe: boolean; source: "overture" | "osm" | "user" };
export type TripPlacesResult =
  | { status: "ok"; area: string; places: StoredPlace[]; pending: PlaceCategory[] }
  | { status: "no-destination" } | { status: "unavailable" };

/** The categories a request covers: one, or all of them. */
export const categoriesFor = (category: PlaceCategory | null): PlaceCategory[] => category ? [category] : PLACE_CATEGORIES.map((c) => c.key);

/** A member's places for their trip. `pending` = categories the daily import hasn't reached yet ("Finding places…"). */
export async function tripPlaces(input: { profileId: string; tripId: string; latitude: number | null; longitude: number | null; category: PlaceCategory | null }): Promise<TripPlacesResult> {
  if (input.latitude == null || input.longitude == null) return { status: "no-destination" };
  const db = createSupabaseServiceRoleClient();
  const area = areaKey(input.latitude, input.longitude);
  const pending: PlaceCategory[] = [];
  for (const category of categoriesFor(input.category)) {
    const { data, error } = await db.rpc("place_area_fetched_at", { p_area: area, p_category: category });
    if (error) return { status: "unavailable" }; // venue_places.sql not installed yet
    if (!data) pending.push(category);
  }
  const { data, error } = await db.rpc("list_trip_places", { p_profile: input.profileId, p_trip: input.tripId, p_area: area, p_category: input.category });
  if (error) return { status: "unavailable" };
  return { status: "ok", area, places: (Array.isArray(data) ? data : []) as StoredPlace[], pending };
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type PlaceActionResult = "ok" | "not-found" | "unavailable";

/** Phase 3: heart / un-heart a place for the trip (members only; the database checks membership again). */
export async function setPlaceSave(profileId: string, tripId: string, placeId: string, saved: boolean): Promise<PlaceActionResult> {
  if (!isUuid(placeId)) return "not-found";
  const { error } = await createSupabaseServiceRoleClient().rpc("set_place_save", { p_profile: profileId, p_trip: tripId, p_place: placeId, p_saved: saved });
  return !error ? "ok" : error.code === "P0002" ? "not-found" : "unavailable";
}

/** Phase 3: the place was put on the trip's itinerary ("Added by N trips"; counted once per trip). */
export async function recordPlaceAdd(profileId: string, tripId: string, placeId: string): Promise<PlaceActionResult> {
  if (!isUuid(placeId)) return "not-found";
  const { error } = await createSupabaseServiceRoleClient().rpc("record_place_trip_add", { p_profile: profileId, p_trip: tripId, p_place: placeId });
  return !error ? "ok" : error.code === "P0002" ? "not-found" : "unavailable";
}

/** Phase 4: places this member already rated or skipped on this trip (the "How was yesterday?" prompt leaves them out). */
export async function placesDone(profileId: string, tripId: string): Promise<string[] | null> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("my_place_rating_status", { p_profile: profileId, p_trip: tripId });
  return error ? null : Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : [];
}

export type RatingAnswer = { placeId: string; rating: number; visitedOn: string };
/** Keeps only well-formed answers: a place id, a whole 1-10 rating and a real YYYY-MM-DD day (at most 50 in all). */
export function ratingAnswers(body: unknown): { ratings: RatingAnswer[]; skips: string[] } | null {
  const record = (body && typeof body === "object" ? body : {}) as { ratings?: unknown; skips?: unknown };
  if (!Array.isArray(record.ratings) || (record.skips !== undefined && !Array.isArray(record.skips))) return null;
  const ratings = record.ratings.filter((r): r is RatingAnswer => !!r && typeof r === "object" && isUuid(String((r as RatingAnswer).placeId))
    && Number.isInteger((r as RatingAnswer).rating) && (r as RatingAnswer).rating >= 1 && (r as RatingAnswer).rating <= 10
    && /^\d{4}-\d{2}-\d{2}$/.test(String((r as RatingAnswer).visitedOn)) && Number.isFinite(Date.parse(`${(r as RatingAnswer).visitedOn}T12:00:00Z`)))
    .map(({ placeId, rating, visitedOn }) => ({ placeId, rating, visitedOn }));
  const skips = ((record.skips ?? []) as unknown[]).filter((id): id is string => typeof id === "string" && isUuid(id));
  if (ratings.length + skips.length === 0 || ratings.length + skips.length > 50) return null;
  return { ratings, skips };
}

/** Phase 4: store one prompt's ratings and skips. Returns how many ratings were new, or null if it couldn't be saved. */
export async function submitRatings(profileId: string, tripId: string, answers: { ratings: RatingAnswer[]; skips: string[] }): Promise<number | null> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("submit_place_ratings", { p_profile: profileId, p_trip: tripId, p_ratings: answers.ratings, p_skips: answers.skips });
  return error ? null : Number(data) || 0;
}
