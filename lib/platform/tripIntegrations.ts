/**
 * Golf Trip integration foundation: the shared shapes every trip record uses to remember outside data,
 * plus the registry of future providers. Safe to import anywhere (no secrets, no network calls).
 * Nothing here talks to a third party — see tripIntegrationsServer.ts for the server-side entry point.
 */

export type ProviderCategory =
  | "flight" | "lodging" | "transportation" | "golf" | "place" | "maps" | "weather" | "email" | "calendar";
export type ProviderStatus = "planned" | "configured" | "enabled" | "disabled";
export type ProviderCapability = "search" | "import" | "sync" | "externalLink" | "navigation" | "oauth";

export interface Provider {
  key: string;
  name: string;
  category: ProviderCategory;
  /** Default status; tripIntegrationsServer.ts upgrades it to "configured" when its env keys are set. */
  status: ProviderStatus;
  capabilities: ProviderCapability[];
  /** Server env var names this provider needs before it can be configured (never the values). */
  envKeys?: string[];
}

/** "manual" is the always-available fallback: every category the user can type into has one. */
export const MANUAL_PROVIDER_KEY = "manual";

const planned = (key: string, name: string, category: ProviderCategory, capabilities: ProviderCapability[], envKeys?: string[]): Provider =>
  ({ key, name, category, status: "planned", capabilities, envKeys });
const manual = (category: ProviderCategory): Provider =>
  ({ key: MANUAL_PROVIDER_KEY, name: "Manual", category, status: "enabled", capabilities: [] });

export const PROVIDERS: Provider[] = [
  manual("flight"),
  planned("flight-generic", "Flight data provider", "flight", ["search", "sync"], ["FLIGHT_DATA_API_KEY"]),
  planned("american", "American Airlines", "flight", ["externalLink"]),
  planned("delta", "Delta", "flight", ["externalLink"]),
  planned("united", "United", "flight", ["externalLink"]),
  planned("southwest", "Southwest", "flight", ["externalLink"]),

  manual("lodging"),
  planned("airbnb", "Airbnb", "lodging", ["externalLink"]),
  planned("vrbo", "VRBO", "lodging", ["externalLink"]),
  planned("hotel", "Hotel", "lodging", ["externalLink"]),

  manual("transportation"),
  planned("hertz", "Hertz", "transportation", ["externalLink"]),
  planned("enterprise", "Enterprise", "transportation", ["externalLink"]),
  planned("national", "National", "transportation", ["externalLink"]),
  planned("avis", "Avis", "transportation", ["externalLink"]),
  planned("uber", "Uber", "transportation", ["externalLink"]),
  planned("lyft", "Lyft", "transportation", ["externalLink"]),

  manual("golf"),
  planned("course-website", "Course website", "golf", ["externalLink"]),
  planned("tee-time-provider", "Tee-time provider", "golf", ["search", "import"], ["TEE_TIME_API_KEY"]),

  manual("place"),
  planned("yelp", "Yelp", "place", ["search", "externalLink"], ["YELP_API_KEY"]),
  planned("google-places", "Google Places", "place", ["search", "externalLink"], ["GOOGLE_PLACES_API_KEY"]),
  planned("opentable", "OpenTable", "place", ["externalLink"]),

  // Maps open a link/app — no key needed, so they are usable today.
  { key: "google-maps", name: "Google Maps", category: "maps", status: "enabled", capabilities: ["navigation", "externalLink"] },
  { key: "apple-maps", name: "Apple Maps", category: "maps", status: "enabled", capabilities: ["navigation", "externalLink"] },
  { key: "waze", name: "Waze", category: "maps", status: "enabled", capabilities: ["navigation", "externalLink"] },

  // Free and keyless; lib/platform/weather/ calls it straight from Golf Trip Home (server). US only.
  { key: "nws", name: "National Weather Service", category: "weather", status: "enabled", capabilities: ["search"] },
  manual("email"),
  planned("gmail", "Gmail confirmation import", "email", ["import", "oauth"], ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"]),
  manual("calendar"),
  planned("google-calendar", "Google Calendar", "calendar", ["import", "oauth"], ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"]),
];

export function findProvider(category: ProviderCategory, key: string): Provider | undefined {
  return PROVIDERS.find((p) => p.category === category && p.key === key);
}

/** Where a trip record's data came from. Every record type carries one (or null when typed in by hand). */
export interface ExternalReference {
  provider: string;
  externalId?: string;
  externalUrl?: string;
  sourceType: "manual" | "api" | "email" | "link";
  /** ISO timestamp. */
  lastSyncedAt?: string;
}

/** One location shape for courses, hotels, restaurants, airports. Our own fields are the identity; externalPlaceId is just a hint. */
export interface TripLocation {
  name: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  externalPlaceId?: string;
}

/** A button the UI can show without knowing anything provider-specific. */
export interface ExternalAction {
  type: "openReservation" | "checkIn" | "navigate" | "call" | "openProvider" | "viewWebsite";
  label: string;
  url: string;
}

export function navigateAction(location: TripLocation, maps: "google-maps" | "apple-maps" | "waze" = "google-maps"): ExternalAction {
  const hasCoords = location.latitude !== undefined && location.longitude !== undefined;
  const coords = `${location.latitude},${location.longitude}`;
  const query = encodeURIComponent([location.name, location.address, location.city, location.region].filter(Boolean).join(", "));
  const url = maps === "apple-maps" ? `https://maps.apple.com/?q=${hasCoords ? coords : query}`
    : maps === "waze" ? (hasCoords ? `https://waze.com/ul?ll=${coords}&navigate=yes` : `https://waze.com/ul?q=${query}&navigate=yes`)
    : `https://www.google.com/maps/search/?api=1&query=${hasCoords ? coords : query}`;
  return { type: "navigate", label: "Navigate", url };
}

export function callAction(phone: string): ExternalAction {
  return { type: "call", label: "Call", url: `tel:${phone.replace(/[^\d+]/g, "")}` };
}
