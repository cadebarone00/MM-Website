import { googleAutocomplete, googlePlaceDetails } from "./providers/googlePlaces.ts";
import type { LocationResult, PlaceLocation, PlaceSuggestion } from "./types.ts";

/**
 * Destination search: page → /api/places/* → this file → the place provider. Server-only: the only code that reads
 * GOOGLE_PLACES_API_KEY. Checks every input first and never throws; failures come back as a code.
 */

const SESSION = /^[A-Za-z0-9_-]{1,36}$/;
const PLACE_ID = /^[A-Za-z0-9_-]{1,300}$/;

type Env = Record<string, string | undefined>;

export async function searchPlaces(query: string, sessionToken: string, env: Env = process.env, fetchImpl?: typeof fetch): Promise<LocationResult<PlaceSuggestion[]>> {
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return { ok: false, code: "NOT_CONFIGURED" };
  const input = query.trim();
  if (input.length < 3 || input.length > 100 || !SESSION.test(sessionToken)) return { ok: false, code: "BAD_INPUT" };
  try {
    return { ok: true, data: await googleAutocomplete(apiKey, input, sessionToken, fetchImpl) };
  } catch (error) {
    console.error("Place search failed:", error instanceof Error ? error.message : error);
    return { ok: false, code: "PROVIDER_ERROR" };
  }
}

export async function getPlace(placeId: string, sessionToken: string, env: Env = process.env, fetchImpl?: typeof fetch): Promise<LocationResult<PlaceLocation>> {
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return { ok: false, code: "NOT_CONFIGURED" };
  if (!PLACE_ID.test(placeId) || !SESSION.test(sessionToken)) return { ok: false, code: "BAD_INPUT" };
  try {
    return { ok: true, data: await googlePlaceDetails(apiKey, placeId, sessionToken, fetchImpl) };
  } catch (error) {
    console.error("Place details failed:", error instanceof Error ? error.message : error);
    return { ok: false, code: "PROVIDER_ERROR" };
  }
}

/** HTTP status for a failed lookup (the routes answer with it). */
export function locationFailureStatus(code: "NOT_CONFIGURED" | "BAD_INPUT" | "PROVIDER_ERROR"): number {
  return code === "NOT_CONFIGURED" ? 503 : code === "BAD_INPUT" ? 400 : 502;
}
