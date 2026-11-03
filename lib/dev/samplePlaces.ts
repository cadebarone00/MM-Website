import type { Place, PlaceCategory } from "@/lib/platform/venuePlaces";

/**
 * DEV ONLY: made-up places around a trip's location for the Venue tab design (simulator). Real trips get places from
 * Overture Maps Places stored in our database (scripts/places/import_overture.py). Offsets are in degrees from the trip's spot, so distances look real.
 */
const SAMPLES: [string, PlaceCategory, number, number, string, string, number][] = [
  ["The Mission", "food", 0.006, -0.004, "3815 N Brown Ave", "Modern Latin · Old Town", 6],
  ["Diego Pops", "food", 0.012, 0.006, "4338 N Goldwater Blvd", "Tacos & margaritas", 3],
  ["Hash Kitchen", "food", -0.018, 0.011, "7210 E Indian School Rd", "Brunch", 0],
  ["Fat Ox", "food", 0.041, 0.004, "6316 N Scottsdale Rd", "Italian · Steak", 1],
  ["Goldwater Brewing", "bars", 0.004, 0.009, "3608 N Scottsdale Rd", "Brewery · Taproom", 9],
  ["Bottled Blonde", "bars", 0.002, -0.006, "7340 E Indian Plaza", "Bar · Patio", 2],
  ["Wren & Wolf", "bars", -0.011, -0.003, "7121 E 5th Ave", "Cocktail bar", 0],
  ["TPC Scottsdale", "golf", 0.21, 0.03, "17020 N Hayden Rd", "Stadium Course · Public", 12],
  ["Topgolf Scottsdale", "golf", -0.07, -0.09, "9500 E Talking Stick Way", "Driving range · Games", 4],
  ["Grassroots Golf Shop", "golf", 0.03, 0.02, "4224 N Craftsman Ct", "Golf shop", 0],
  ["Cartel Coffee Lab", "coffee", 0.003, 0.002, "7124 E 5th Ave", "Coffee · Pastries", 2],
  ["Press Coffee", "coffee", 0.05, -0.02, "8700 E Pinnacle Peak Rd", "Coffee roaster", 0],
  ["Old Town Scottsdale", "todo", 0.001, 0.001, "Scottsdale Rd & Main St", "Shops · Galleries · Nightlife", 7],
  ["Camelback Mountain", "todo", -0.03, -0.08, "Echo Canyon Trailhead", "Hike · Views", 3],
  ["WestWorld", "todo", 0.18, 0.05, "16601 N Pima Rd", "Events · Rodeo", 0],
];

/** Sample after-visit ratings (average, count) for a few places, so "Ranked highly by Maroon users" shows. */
const RATINGS: Record<string, [number, number]> = { "The Mission": [8.7, 9], "TPC Scottsdale": [9.1, 14], "Cartel Coffee Lab": [8.2, 6], "Bottled Blonde": [6.4, 11] };

export const SAMPLE_CENTER = { latitude: 33.4942, longitude: -111.9261 }; // Scottsdale, AZ

export function samplePlaces(center = SAMPLE_CENTER, savedIds: string[] = []): Place[] {
  return SAMPLES.map(([name, category, dLat, dLon, address, detail, tripAdds], index) => {
    const id = `sample-${index}`;
    const [ratingAverage, ratingCount] = RATINGS[name] ?? [undefined, undefined];
    return { id, name, category, latitude: center.latitude + dLat, longitude: center.longitude + dLon, address, detail, tripAdds, savedByGroup: savedIds.includes(id), ratingAverage, ratingCount };
  });
}
