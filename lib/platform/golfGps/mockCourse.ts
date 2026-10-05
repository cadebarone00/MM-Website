import { offsetByYards } from "./distance";
import type { GpsCourse, GpsHole, LatLng } from "./types";

/**
 * DEV ONLY: one mock hole for the GPS prototype, traced by eye from satellite imagery of a fairway near Rancho Mirage, CA
 * (the Maroon's Palm Springs venue area): tee at the fairway's west end, green with its bunkers to the east, the lake
 * left of the tee as the water. Positions are approximate (not surveyed), and it isn't any real course's numbered hole.
 * Built in yards from the tee so the numbers are easy to sanity-check: about a 355-yard par 4 playing east.
 */
const TEE: LatLng = { lat: 33.789452, lng: -116.421765 };

/** Yards north / east of the tee. */
const at = (north: number, east: number) => offsetByYards(TEE, north, east);

/** The green sits 73 south / 347 east of the tee; front and back are 14 yards either side along the line of play. */
const GREEN_NORTH = -73;
const GREEN_EAST = 347;
const GREEN_DEPTH = 14;
const along = (yards: number) => {
  const length = Math.hypot(GREEN_NORTH, GREEN_EAST);
  return at(GREEN_NORTH + (GREEN_NORTH / length) * yards, GREEN_EAST + (GREEN_EAST / length) * yards);
};

/** A rough oval outline around a point, for shading water on the map. */
const oval = (north: number, east: number, radiusNorth: number, radiusEast: number) =>
  Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * 2 * Math.PI;
    return at(north + radiusNorth * Math.cos(angle), east + radiusEast * Math.sin(angle));
  });

export const MOCK_HOLE: GpsHole = {
  number: 1,
  par: 4,
  tee: TEE,
  green: { front: along(-GREEN_DEPTH), center: along(0), back: along(GREEN_DEPTH) },
  hazards: [
    { id: "fairway-bunker", kind: "bunker", label: "Fairway bunker", center: at(-22, 174), radiusYards: 10 },
    { id: "green-bunker", kind: "bunker", label: "Greenside bunker", center: at(-94, 331), radiusYards: 7 },
    { id: "water", kind: "water", label: "Water", center: at(-108, -48), radiusYards: 60, outline: oval(-108, -48, 38, 95) },
  ],
};

export const MOCK_COURSE: GpsCourse = {
  name: "Mock Course",
  note: "Mock hole traced roughly from satellite imagery for testing — not surveyed, not a real course's hole.",
  holes: [MOCK_HOLE],
};

/** Where the mock player starts: on the tee. */
export const MOCK_START: LatLng = TEE;
