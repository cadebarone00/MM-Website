/**
 * Our own weather shapes. Pages and components use only these, never a provider's reply, so the weather provider
 * (the National Weather Service today) can be swapped without touching them. Safe to import anywhere.
 */

/** Current conditions plus today's high/low at one place. Any value the provider didn't give is null. */
export interface WeatherData {
  temperature: number | null;
  temperatureUnit: "F" | "C";
  /** Short words, e.g. "Partly Cloudy". */
  condition: string | null;
  high: number | null;
  low: number | null;
  /** 0–100 */
  precipitationChance: number | null;
  /** Ready to show, e.g. "8 mph". */
  windSpeed: string | null;
  /** Compass point, e.g. "SW". */
  windDirection: string | null;
  /** ISO time the provider last updated this forecast. */
  updatedAt: string;
}

/**
 * no-location: the trip has no saved coordinates. not-covered: the provider has no forecast there (NWS is US-only).
 * unavailable: the provider failed, timed out or replied with something unexpected.
 */
export type TripWeather =
  | { status: "ok"; weather: WeatherData }
  | { status: "no-location" }
  | { status: "not-covered" }
  | { status: "unavailable" };
