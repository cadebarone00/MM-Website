/**
 * "Courses near me" for Play a round / Explore → Courses. OpenGolf has no free search by location, so: the phone's
 * location → its US state (from the National Weather Service, free, already used for trip weather) → that state's
 * courses (which carry map points) → sorted by straight-line distance. Pure helpers here; the server wires them up.
 */

export interface NearbyCandidate { id: string; name: string; city: string | null; state: string | null; latitude: number | null; longitude: number | null; par: number | null }
export interface NearbyCourse { ref: string; name: string; city: string | null; state: string | null; par: number | null; miles: number }

const EARTH_MILES = 3958.8;
const rad = (degrees: number) => degrees * Math.PI / 180;

/** Straight-line ("as the crow flies") miles between two points. */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The closest courses (with a known map point), nearest first, distances to a tenth of a mile. Same course twice = once. */
export function nearestCourses(candidates: NearbyCandidate[], latitude: number, longitude: number, limit = 8): NearbyCourse[] {
  const seen = new Set<string>();
  return candidates
    .flatMap((c) => c.latitude === null || c.longitude === null || seen.has(c.id) ? [] : (seen.add(c.id), [{ c, miles: milesBetween(latitude, longitude, c.latitude, c.longitude) }]))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit)
    .map(({ c, miles }) => ({ ref: c.id, name: c.name, city: c.city, state: c.state, par: c.par, miles: Math.round(miles * 10) / 10 }));
}

/** The two-letter state from an NWS /points reply (properties.relativeLocation.properties.state), or null. */
export function stateFromPoints(json: unknown): string | null {
  const state = (json as { properties?: { relativeLocation?: { properties?: { state?: unknown } } } } | null)?.properties?.relativeLocation?.properties?.state;
  return typeof state === "string" && /^[A-Z]{2}$/.test(state) ? state : null;
}
