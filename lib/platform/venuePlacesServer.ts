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
