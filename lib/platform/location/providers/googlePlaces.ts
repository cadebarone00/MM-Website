import type { PlaceLocation, PlaceSuggestion } from "../types.ts";

/**
 * Google Places (New): the only file that knows Google's URLs and reply shapes. Server-only (it is handed the API key).
 * Replies are never cached: Google's terms forbid it, and each search session is one-off anyway.
 */

const BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 5000;
const MAX_SUGGESTIONS = 5;

type Fetch = typeof fetch;

/** Suggestions for what has been typed so far. Throws on a network error, timeout or non-200 reply. */
export async function googleAutocomplete(apiKey: string, input: string, sessionToken: string, fetchImpl: Fetch = fetch): Promise<PlaceSuggestion[]> {
  const response = await fetchImpl(`${BASE}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({ input, sessionToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google autocomplete answered ${response.status}`);
  return parseAutocomplete(await response.json());
}

/** Name and coordinates for a picked suggestion. Same session token as its searches, so Google bills them as one. */
export async function googlePlaceDetails(apiKey: string, placeId: string, sessionToken: string, fetchImpl: Fetch = fetch): Promise<PlaceLocation> {
  const response = await fetchImpl(`${BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id,displayName,formattedAddress,location" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google place details answered ${response.status}`);
  const place = parseDetails(await response.json());
  if (!place) throw new Error("Google place details reply had no coordinates");
  return place;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const textOf = (value: unknown): string => {
  const text = record(value)?.text;
  return typeof text === "string" ? text.trim() : "";
};

/** Keeps only place suggestions with an id and a line of text (query suggestions are skipped). */
export function parseAutocomplete(json: unknown): PlaceSuggestion[] {
  const list = record(json)?.suggestions;
  if (!Array.isArray(list)) return [];
  const suggestions: PlaceSuggestion[] = [];
  for (const item of list) {
    const prediction = record(record(item)?.placePrediction);
    const placeId = prediction?.placeId;
    const text = textOf(prediction?.text);
    if (typeof placeId !== "string" || !placeId || !text) continue;
    const format = record(prediction?.structuredFormat);
    suggestions.push({ placeId, text, mainText: textOf(format?.mainText) || text, secondaryText: textOf(format?.secondaryText) });
    if (suggestions.length === MAX_SUGGESTIONS) break;
  }
  return suggestions;
}

/** The place with real, in-range coordinates, or null. */
export function parseDetails(json: unknown): PlaceLocation | null {
  const place = record(json);
  const location = record(place?.location);
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  if (typeof place?.id !== "string" || !place.id) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const name = typeof place.formattedAddress === "string" && place.formattedAddress.trim() ? place.formattedAddress.trim() : textOf(place.displayName);
  return { placeId: place.id, name, latitude, longitude };
}
