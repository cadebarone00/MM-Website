/** Shapes for the on-course GPS prototype (/dev/gps and the Scoring sheet's GPS view). Safe to import anywhere. */

export interface LatLng {
  lat: number;
  lng: number;
}

/** A bunker or water hazard: its middle point, a rough size, and (for water) an outline to shade on the map. */
export interface GpsHazard {
  id: string;
  kind: "bunker" | "water";
  /** Short words for the HUD, e.g. "Fairway bunker". */
  label: string;
  center: LatLng;
  radiusYards: number;
  outline?: LatLng[];
}

export interface GpsHole {
  number: number;
  par: number;
  tee: LatLng;
  green: { front: LatLng; center: LatLng; back: LatLng };
  hazards: GpsHazard[];
}

export interface GpsCourse {
  name: string;
  /** Said plainly in the UI: the hole layout is made up, not surveyed. */
  note: string;
  holes: GpsHole[];
}

/** Where the player is. `accuracy` is the device's estimate in meters (null for mock). */
export interface PlayerFix extends LatLng {
  accuracy: number | null;
  timestamp: number;
  source: GpsMode;
}

export type GpsMode = "real" | "mock";

/**
 * mock: using the mock player. locating: real GPS asked, no fix yet. tracking: real fixes arriving.
 * unsupported / denied / unavailable: real GPS can't be used, so the screen fell back to mock.
 */
export type GpsStatus = "mock" | "locating" | "tracking" | "unsupported" | "denied" | "unavailable";
