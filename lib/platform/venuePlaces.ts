/**
 * Venue tab → place recommendations (project_specs.md "Venue tab → Places recommendations", owner 2026-11-02). Pure.
 * Places come from OpenStreetMap (stored in our own database, phase 2) plus what our users do with them (saves, itinerary
 * adds), which is what ranks them. There is no in-app map: Open in Maps hands the place to Apple Maps or Google Maps.
 */
export const PLACE_CATEGORIES = [
  { key: "food", label: "Food" },
  { key: "bars", label: "Bars & Breweries" },
  { key: "golf", label: "Golf" },
  { key: "coffee", label: "Coffee" },
  { key: "todo", label: "Things to do" },
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]["key"];

export type Place = {
  id: string; name: string; category: PlaceCategory; latitude: number; longitude: number;
  address?: string; detail?: string;
  /** Our own layer: how many trips added it to an itinerary, whether my group saved it, and after-visit ratings (1-10). */
  tripAdds: number; savedByGroup?: boolean; ratingAverage?: number; ratingCount?: number;
};

/** Phase 4 (after-visit ratings): an average of 8+ from at least 5 Maroon users = "Ranked highly by Maroon users". */
export const RANKED_HIGHLY = { average: 8, count: 5 } as const;
export const RATING_MIN = 1, RATING_MAX = 10;
export function rankedHighly(place: Pick<Place, "ratingAverage" | "ratingCount">): boolean {
  return (place.ratingCount ?? 0) >= RANKED_HIGHLY.count && (place.ratingAverage ?? 0) >= RANKED_HIGHLY.average;
}
export const validRating = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= RATING_MIN && (value as number) <= RATING_MAX;
/** A place's average and count with new ratings folded in (one decimal). */
export function withRatings(place: Pick<Place, "ratingAverage" | "ratingCount">, ratings: number[]): { ratingAverage: number; ratingCount: number } {
  const valid = ratings.filter(validRating);
  const count = (place.ratingCount ?? 0) + valid.length;
  const total = (place.ratingAverage ?? 0) * (place.ratingCount ?? 0) + valid.reduce((sum, r) => sum + r, 0);
  return { ratingAverage: count ? Math.round((total / count) * 10) / 10 : 0, ratingCount: count };
}
/** "Yesterday" for the prompt: the plans whose day was the day before `today` (YYYY-MM-DD) and that I haven't rated. */
export function placesToRate<T extends { placeId?: string; startsAt: string }>(plans: T[], today: string, rated: string[]): T[] {
  const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - 1);
  const yesterday = day.toISOString().slice(0, 10);
  const seen = new Set<string>();
  return plans.filter((plan) => {
    if (!plan.placeId || plan.startsAt.slice(0, 10) !== yesterday || rated.includes(plan.placeId) || seen.has(plan.placeId)) return false;
    seen.add(plan.placeId);
    return true;
  });
}

/** Straight-line distance in miles (haversine). */
export function distanceMiles(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(to.latitude - from.latitude), dLon = rad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
export const distanceLabel = (miles: number) => miles < 0.1 ? "Right here" : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;

/** Apple devices open Apple Maps; everything else (Android, desktop) opens Google Maps. A plain link: no API, no cost. */
export function mapsLink(place: Pick<Place, "name" | "latitude" | "longitude" | "address">, apple: boolean): string {
  const query = [place.name, place.address].filter(Boolean).join(", ");
  return apple
    ? `https://maps.apple.com/?q=${encodeURIComponent(query)}&ll=${place.latitude},${place.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
export const isAppleDevice = (userAgent: string) => /iPhone|iPad|iPod|Macintosh/.test(userAgent);

/** Our ranking: group saves first, then "Ranked highly by Maroon users", then how many trips added it, then nearest. */
export function rankPlaces(places: Place[], from: { latitude: number; longitude: number }): Place[] {
  return [...places].sort((a, b) => Number(!!b.savedByGroup) - Number(!!a.savedByGroup) || Number(rankedHighly(b)) - Number(rankedHighly(a))
    || b.tripAdds - a.tripAdds || distanceMiles(from, a) - distanceMiles(from, b));
}

/** The badge under a card's name ("Your group saved this", then "Ranked highly by Maroon users", then "Added by N trips"). */
export function placeBadge(place: Place): string | null {
  if (place.savedByGroup) return "Your group saved this";
  if (rankedHighly(place)) return "Ranked highly by Maroon users";
  if (place.tripAdds > 0) return `Added by ${place.tripAdds} ${place.tripAdds === 1 ? "trip" : "trips"}`;
  return null;
}
