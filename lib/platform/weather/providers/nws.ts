import type { WeatherData } from "../types.ts";

/**
 * National Weather Service (api.weather.gov): the only file that knows NWS's URLs and reply shapes. Server-only.
 * Free, no key; NWS asks every app to identify itself in the User-Agent. US locations only.
 *
 * Cache: every request goes through Next.js's server fetch cache, keyed by its URL, so everyone viewing a trip at
 * the same place shares one copy. Only status-200 replies are stored, so failures are never cached.
 */

const BASE = "https://api.weather.gov";
const TIMEOUT_MS = 5000;
/** The grid for a spot almost never changes. */
export const POINTS_CACHE_SECONDS = 24 * 60 * 60;
export const FORECAST_CACHE_SECONDS = 30 * 60;

type Fetch = typeof fetch;

/** NWS had no forecast for this spot (outside the US): not a failure, there's just nothing to show. */
export class NwsNotCovered extends Error {}

export function nwsUserAgent(contact?: string): string {
  const who = contact?.trim();
  return who ? `The Maroon App (${who})` : "The Maroon App";
}

/** NWS allows at most 4 decimals (more gets a redirect); toFixed then Number drops trailing zeros the same way NWS does. */
export function pointsUrl(latitude: number, longitude: number): string {
  return `${BASE}/points/${Number(latitude.toFixed(4))},${Number(longitude.toFixed(4))}`;
}

/** Current conditions and high/low at a spot. Throws NwsNotCovered outside NWS's area, or an Error on any failure. */
export async function nwsWeather(latitude: number, longitude: number, contact?: string, fetchImpl: Fetch = fetch, now = new Date()): Promise<WeatherData> {
  const get = async (url: string, revalidate: number, { notFoundMeansNotCovered = false } = {}) => {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": nwsUserAgent(contact), Accept: "application/geo+json" },
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit);
    if (response.status === 404 && notFoundMeansNotCovered) throw new NwsNotCovered("NWS has no forecast for this location");
    if (!response.ok) throw new Error(`NWS answered ${response.status} for ${url}`);
    return response.json() as Promise<unknown>;
  };

  const links = parsePoints(await get(pointsUrl(latitude, longitude), POINTS_CACHE_SECONDS, { notFoundMeansNotCovered: true }));
  if (!links) throw new Error("NWS points reply had no forecast links");
  const [daily, hourly] = await Promise.all([get(links.forecast, FORECAST_CACHE_SECONDS), get(links.forecastHourly, FORECAST_CACHE_SECONDS)]);
  const weather = parseForecasts(daily, hourly, now);
  if (!weather) throw new Error("NWS forecast replies had no periods");
  return weather;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

/** The forecast URLs exactly as NWS gave them (we never build grid URLs ourselves). Only NWS's own https URLs are used. */
export function parsePoints(json: unknown): { forecast: string; forecastHourly: string } | null {
  const properties = record(record(json)?.properties);
  const forecast = str(properties?.forecast);
  const forecastHourly = str(properties?.forecastHourly);
  const nws = (url: string | null) => url !== null && url.startsWith(`${BASE}/`);
  return nws(forecast) && nws(forecastHourly) ? { forecast: forecast!, forecastHourly: forecastHourly! } : null;
}

interface Period { start: number; end: number; isDaytime: boolean | null; temperature: number | null; unit: string | null;
  rain: number | null; windSpeed: string | null; windDirection: string | null; condition: string | null }

function periods(json: unknown): { list: Period[]; updatedAt: string | null } {
  const properties = record(record(json)?.properties);
  const raw = Array.isArray(properties?.periods) ? properties.periods : [];
  const list = raw.map(record).filter((p): p is Record<string, unknown> => p !== null).map((p) => ({
    start: Date.parse(String(p.startTime)), end: Date.parse(String(p.endTime)),
    isDaytime: typeof p.isDaytime === "boolean" ? p.isDaytime : null,
    temperature: num(p.temperature), unit: str(p.temperatureUnit),
    rain: num(record(p.probabilityOfPrecipitation)?.value),
    windSpeed: str(p.windSpeed), windDirection: str(p.windDirection), condition: str(p.shortForecast),
  }));
  return { list, updatedAt: str(properties?.updateTime) ?? str(properties?.generatedAt) };
}

/**
 * Current = the hourly period happening now (else the first one). High = the next daytime period's temperature,
 * low = the next night period's, from the daily forecast. Null when neither reply has any periods.
 */
export function parseForecasts(dailyJson: unknown, hourlyJson: unknown, now = new Date()): WeatherData | null {
  const daily = periods(dailyJson);
  const hourly = periods(hourlyJson);
  const time = now.getTime();
  const current = hourly.list.find((p) => p.start <= time && time < p.end) ?? hourly.list[0] ?? daily.list[0];
  if (!current) return null;
  const upcoming = daily.list.filter((p) => !(p.end <= time));
  const unit = current.unit === "C" ? "C" : "F";
  return {
    temperature: current.temperature,
    temperatureUnit: unit,
    condition: current.condition,
    high: upcoming.find((p) => p.isDaytime === true)?.temperature ?? null,
    low: upcoming.find((p) => p.isDaytime === false)?.temperature ?? null,
    precipitationChance: current.rain,
    windSpeed: current.windSpeed,
    windDirection: current.windDirection,
    updatedAt: hourly.updatedAt ?? daily.updatedAt ?? now.toISOString(),
  };
}
