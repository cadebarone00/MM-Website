/**
 * Our own place shapes. Pages, routes and components use only these, never a provider's reply, so the
 * place provider (Google Places today) can be swapped without touching them. Safe to import anywhere.
 */

/** One suggestion under the Destination box. */
export interface PlaceSuggestion {
  placeId: string;
  /** The full line, e.g. "Pinehurst, NC, USA". It becomes the trip's destination when picked. */
  text: string;
  /** "Pinehurst" */
  mainText: string;
  /** "NC, USA" */
  secondaryText: string;
}

/** A picked place with its coordinates. */
export interface PlaceLocation {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
}

export type LocationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_CONFIGURED" | "BAD_INPUT" | "PROVIDER_ERROR" };
