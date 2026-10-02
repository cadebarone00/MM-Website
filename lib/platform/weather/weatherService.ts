import { NwsNotCovered, nwsWeather } from "./providers/nws.ts";
import type { TripWeather } from "./types.ts";

/**
 * Trip weather: Golf Trip Home (server) → this file → the weather provider. Server-only: the only code that reads
 * NWS_CONTACT. Never throws; every failure comes back as a status the card can show.
 */
export async function getTripWeather(latitude: number | null | undefined, longitude: number | null | undefined,
  env: Record<string, string | undefined> = process.env, fetchImpl?: typeof fetch, now?: Date): Promise<TripWeather> {
  const real = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (!real(latitude) || !real(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { status: "no-location" };
  try {
    return { status: "ok", weather: await nwsWeather(latitude, longitude, env.NWS_CONTACT, fetchImpl, now) };
  } catch (error) {
    if (error instanceof NwsNotCovered) return { status: "not-covered" };
    console.error("Trip weather failed:", error instanceof Error ? error.message : error);
    return { status: "unavailable" };
  }
}
