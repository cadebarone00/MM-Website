import type { PlaceCategory } from "./venuePlaces";

/**
 * Venue places: AREAS (project_specs.md "Venue tab → Places recommendations"). Pure. Places are stored per area: the trip
 * destination rounded to a ~5 km grid square, so nearby trips share one set of places. The daily import
 * (scripts/places/import_overture.py, GitHub Actions) fills each area from Overture Maps Places and refreshes it every
 * 30 days; scripts/places/import_overture.py uses the SAME grid (keep them in step).
 */
export const PLACE_REFRESH_DAYS = 30;
const GRID = 0.05; // degrees (~5.5 km north-south)

/** The shared key for a spot: its ~5 km grid square, e.g. "33.50,-111.95". */
export function areaKey(latitude: number, longitude: number): string {
  const snap = (value: number) => (Math.round(value / GRID) * GRID).toFixed(2);
  return `${snap(latitude)},${snap(longitude)}`;
}
/** The grid square's centre, from its key. */
export function areaCenter(key: string): { latitude: number; longitude: number } {
  const [latitude, longitude] = key.split(",").map(Number);
  return { latitude, longitude };
}

/** Whether an area + category needs a fresh import (never imported, or older than PLACE_REFRESH_DAYS). */
export function needsRefresh(fetchedAt: string | null | undefined, now: Date): boolean {
  if (!fetchedAt) return true;
  const age = now.getTime() - Date.parse(fetchedAt);
  return !Number.isFinite(age) || age > PLACE_REFRESH_DAYS * 86_400_000;
}

/** Shown on the Venue tab wherever these places appear (Overture Maps Places' open licences ask for credit). */
export const PLACES_CREDIT = "Places data © Overture Maps Foundation";
export type { PlaceCategory };
