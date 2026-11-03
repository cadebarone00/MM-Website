import type { PlaceCategory } from "./venuePlaces";

/**
 * Venue places, phase 2 (project_specs.md "Venue tab → Places recommendations"): the free OpenStreetMap side. Pure.
 * The server asks OpenStreetMap's public Overpass API for one category around one AREA (the trip destination rounded to
 * a ~5 km grid, so nearby trips share it), stores the answer in our database, and reuses it for 30 days. Data is
 * © OpenStreetMap contributors (ODbL): storing it is allowed with that credit shown.
 */
/** How far around the area to look: town-sized for food / drinks / coffee, wider for golf and things to do (courses and
 *  attractions are spread out). Smaller searches are lighter on the busy free servers. */
export const OSM_RADIUS_METERS: Record<PlaceCategory, number> = { food: 8_000, bars: 8_000, coffee: 8_000, golf: 15_000, todo: 15_000 };
export const OSM_REFRESH_DAYS = 30;
export const OSM_MAX_PLACES = 120;
const GRID = 0.05; // degrees (~5.5 km north-south)

/** The shared cache key for a spot: its ~5 km grid square, e.g. "33.50,-111.95". */
export function areaKey(latitude: number, longitude: number): string {
  const snap = (value: number) => (Math.round(value / GRID) * GRID).toFixed(2);
  return `${snap(latitude)},${snap(longitude)}`;
}
/** The grid square's centre (what the lookup is made around), from its key. */
export function areaCenter(key: string): { latitude: number; longitude: number } {
  const [latitude, longitude] = key.split(",").map(Number);
  return { latitude, longitude };
}

/** OpenStreetMap tags per category (Overpass QL filters). */
const FILTERS: Record<PlaceCategory, string[]> = {
  food: ['["amenity"~"^(restaurant|fast_food|food_court)$"]'],
  bars: ['["amenity"~"^(bar|pub|biergarten)$"]', '["craft"="brewery"]', '["microbrewery"="yes"]'],
  golf: ['["leisure"="golf_course"]', '["golf"="driving_range"]', '["shop"="golf"]'],
  coffee: ['["amenity"="cafe"]'],
  todo: ['["tourism"~"^(attraction|museum|zoo|theme_park|viewpoint|aquarium)$"]', '["leisure"="water_park"]'],
};

/** One Overpass request: named places of a category within its OSM_RADIUS_METERS of the area's centre. */
export function overpassQuery(category: PlaceCategory, center: { latitude: number; longitude: number }): string {
  const around = `(around:${OSM_RADIUS_METERS[category]},${center.latitude.toFixed(5)},${center.longitude.toFixed(5)})`;
  const parts = FILTERS[category].map((filter) => `nwr${filter}["name"]${around};`).join("");
  return `[out:json][timeout:25];(${parts});out center tags ${OSM_MAX_PLACES};`;
}

export type OsmPlace = {
  sourceId: string; name: string; category: PlaceCategory; latitude: number; longitude: number;
  address: string | null; detail: string | null; website: string | null; phone: string | null; openingHours: string | null;
};
type OverpassElement = { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> };

const clean = (value: string | undefined, max = 200) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};
const titleCase = (text: string) => text.replace(/_/g, " ").replace(/;/g, ", ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const http = (url: string | undefined) => { const value = clean(url, 300); return value && /^https?:\/\//i.test(value) ? value : null; };

/** A short "what is it" line from the tags: cuisine, brewery, course type, attraction type. */
function detailFor(tags: Record<string, string>, category: PlaceCategory): string | null {
  if (tags.cuisine) return titleCase(tags.cuisine).slice(0, 80);
  if (category === "bars") return tags.craft === "brewery" || tags.microbrewery === "yes" ? "Brewery" : tags.amenity === "pub" ? "Pub" : tags.amenity === "biergarten" ? "Beer garden" : "Bar";
  if (category === "golf") return tags.golf === "driving_range" ? "Driving range" : tags.shop === "golf" ? "Golf shop" : tags.access === "private" ? "Golf course · Private" : "Golf course";
  if (category === "todo") return titleCase(tags.tourism ?? tags.leisure ?? "Things to do");
  return null;
}

/** Overpass JSON → our places: named ones with a location only, one per OSM id, at most OSM_MAX_PLACES. */
export function parseOverpass(json: unknown, category: PlaceCategory): OsmPlace[] {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const seen = new Set<string>();
  const places: OsmPlace[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = clean(tags.name, 120);
    const latitude = element.lat ?? element.center?.lat, longitude = element.lon ?? element.center?.lon;
    if (!name || typeof latitude !== "number" || typeof longitude !== "number" || !element.type || element.id === undefined) continue;
    const sourceId = `${element.type}/${element.id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    places.push({
      sourceId, name, category, latitude, longitude,
      address: clean([street, tags["addr:city"]].filter(Boolean).join(", ")),
      detail: detailFor(tags, category),
      website: http(tags.website ?? tags["contact:website"]),
      phone: clean(tags.phone ?? tags["contact:phone"], 40),
      openingHours: clean(tags.opening_hours, 200),
    });
    if (places.length >= OSM_MAX_PLACES) break;
  }
  return places;
}

/** Whether an area + category needs a fresh lookup (never fetched, or older than OSM_REFRESH_DAYS). */
export function needsRefresh(fetchedAt: string | null | undefined, now: Date): boolean {
  if (!fetchedAt) return true;
  const age = now.getTime() - Date.parse(fetchedAt);
  return !Number.isFinite(age) || age > OSM_REFRESH_DAYS * 86_400_000;
}

/**
 * The daily job's to-do list: every area + category of an upcoming or current trip that needs a lookup, soonest trip
 * first, at most `limit` (each lookup can take tens of seconds on the busy free servers). `fetched` maps
 * "area|category" to its last lookup time.
 */
export function areasToRefresh(trips: { latitude: number | null; longitude: number | null; startDate: string }[],
  fetched: Map<string, string>, now: Date, categories: readonly PlaceCategory[], limit: number): { area: string; category: PlaceCategory }[] {
  const jobs: { area: string; category: PlaceCategory }[] = [];
  const seen = new Set<string>();
  const ordered = [...trips].filter((t) => t.latitude != null && t.longitude != null).sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const trip of ordered) {
    const area = areaKey(trip.latitude as number, trip.longitude as number);
    for (const category of categories) {
      const key = `${area}|${category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (needsRefresh(fetched.get(key), now)) jobs.push({ area, category });
      if (jobs.length >= limit) return jobs;
    }
  }
  return jobs;
}
