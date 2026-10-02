import { test } from "node:test";
import assert from "node:assert/strict";
import { FORECAST_CACHE_SECONDS, nwsUserAgent, parseForecasts, parsePoints, POINTS_CACHE_SECONDS, pointsUrl } from "./providers/nws.ts";
import { getTripWeather } from "./weatherService.ts";

// Trimmed from real api.weather.gov replies for Pinehurst, NC (2026-10-01, evening).
const FORECAST = "https://api.weather.gov/gridpoints/RAH/48,28/forecast";
const HOURLY = "https://api.weather.gov/gridpoints/RAH/48,28/forecast/hourly";
const POINTS = { properties: { forecast: FORECAST, forecastHourly: HOURLY, relativeLocation: { properties: { city: "Pinehurst", state: "NC" } } } };
const period = (startTime: string, endTime: string, isDaytime: boolean, temperature: number, rain: number | null, windSpeed: string, windDirection: string, shortForecast: string) =>
  ({ startTime, endTime, isDaytime, temperature, temperatureUnit: "F", probabilityOfPrecipitation: { unitCode: "wmoUnit:percent", value: rain }, windSpeed, windDirection, shortForecast });
const DAILY = { properties: { updateTime: "2026-10-01T22:05:50+00:00", periods: [
  period("2026-10-01T22:00:00-04:00", "2026-10-02T06:00:00-04:00", false, 63, 0, "3 mph", "S", "Mostly Clear"),
  period("2026-10-02T06:00:00-04:00", "2026-10-02T18:00:00-04:00", true, 89, 20, "3 to 7 mph", "SW", "Areas Of Fog then Mostly Sunny"),
] } };
const HOURLY_REPLY = { properties: { updateTime: "2026-10-01T22:05:50+00:00", periods: [
  period("2026-10-01T22:00:00-04:00", "2026-10-01T23:00:00-04:00", false, 72, 0, "2 mph", "S", "Clear"),
  period("2026-10-01T23:00:00-04:00", "2026-10-02T00:00:00-04:00", false, 70, 10, "4 mph", "SE", "Partly Cloudy"),
] } };
const NOW = new Date("2026-10-01T23:30:00-04:00");
const PINEHURST = { temperature: 70, temperatureUnit: "F", condition: "Partly Cloudy", high: 89, low: 63, precipitationChance: 10,
  windSpeed: "4 mph", windDirection: "SE", updatedAt: "2026-10-01T22:05:50+00:00" };

/** A stand-in for api.weather.gov that records every request. */
function fakeNws(replies: Record<string, { status: number; body?: unknown } | Error>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[url];
    if (reply instanceof Error) throw reply;
    if (!reply) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const GOOD = {
  "https://api.weather.gov/points/35.1954,-79.4695": { status: 200, body: POINTS },
  [FORECAST]: { status: 200, body: DAILY },
  [HOURLY]: { status: 200, body: HOURLY_REPLY },
};
const quiet = async <T>(run: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try { return await run(); } finally { console.error = original; }
};

test("NWS replies become our WeatherData: current hour, next day's high, next night's low", () => {
  assert.deepEqual(parseForecasts(DAILY, HOURLY_REPLY, NOW), PINEHURST);
  // Before the first hourly period starts, the first one is used.
  assert.equal(parseForecasts(DAILY, HOURLY_REPLY, new Date("2026-10-01T20:00:00-04:00"))?.temperature, 72);
  // Daytime now: high is today's, low is tonight's.
  const day = { properties: { periods: [DAILY.properties.periods[1], period("2026-10-02T18:00:00-04:00", "2026-10-03T06:00:00-04:00", false, 61, 0, "2 mph", "S", "Clear")] } };
  const noon = new Date("2026-10-02T12:00:00-04:00");
  assert.deepEqual([parseForecasts(day, HOURLY_REPLY, noon)?.high, parseForecasts(day, HOURLY_REPLY, noon)?.low], [89, 61]);
});

test("missing NWS fields become null, never a crash; no periods at all is null", () => {
  const bare = { properties: { periods: [{ startTime: "2026-10-01T22:00:00-04:00", endTime: "2026-10-01T23:00:00-04:00", probabilityOfPrecipitation: { value: null } }] } };
  const weather = parseForecasts({}, bare, NOW);
  assert.ok(weather);
  assert.deepEqual({ ...weather, updatedAt: "" }, { temperature: null, temperatureUnit: "F", condition: null, high: null, low: null,
    precipitationChance: null, windSpeed: null, windDirection: null, updatedAt: "" });
  for (const junk of [null, {}, { properties: { periods: "x" } }]) assert.equal(parseForecasts(junk, junk, NOW), null);
});

test("forecast links are used exactly as NWS gives them, and only NWS's own", () => {
  assert.deepEqual(parsePoints(POINTS), { forecast: FORECAST, forecastHourly: HOURLY });
  assert.equal(parsePoints({ properties: { forecast: FORECAST } }), null);
  assert.equal(parsePoints({ properties: { forecast: "https://evil.example/f", forecastHourly: HOURLY } }), null);
  assert.equal(parsePoints(null), null);
});

test("the points URL uses at most 4 decimals without trailing zeros, like NWS", () => {
  assert.equal(pointsUrl(35.1954345, -79.4694767), "https://api.weather.gov/points/35.1954,-79.4695");
  assert.equal(pointsUrl(35.19500001, -79.4), "https://api.weather.gov/points/35.195,-79.4");
});

test("one trip's weather: points (24h cache), then the two forecast links it returned (30 min cache), with our User-Agent", async () => {
  const nws = fakeNws(GOOD);
  const result = await getTripWeather(35.1954345, -79.4694767, { NWS_CONTACT: "cadebarone00@gmail.com" }, nws.fetchImpl, NOW);
  assert.deepEqual(result, { status: "ok", weather: PINEHURST });
  assert.deepEqual(nws.calls.map((c) => [c.url, c.init.next?.revalidate]), [
    ["https://api.weather.gov/points/35.1954,-79.4695", POINTS_CACHE_SECONDS],
    [FORECAST, FORECAST_CACHE_SECONDS],
    [HOURLY, FORECAST_CACHE_SECONDS],
  ]);
  assert.equal(POINTS_CACHE_SECONDS, 86400);
  assert.equal(FORECAST_CACHE_SECONDS, 1800);
  for (const call of nws.calls) {
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers["User-Agent"], "The Maroon App (cadebarone00@gmail.com)");
    assert.equal(headers.Accept, "application/geo+json");
  }
  assert.equal(nwsUserAgent(""), "The Maroon App");
  assert.equal(nwsUserAgent(undefined), "The Maroon App");
});

test("no coordinates: no-location, and NWS is never asked", async () => {
  const nws = fakeNws(GOOD);
  for (const [lat, lng] of [[null, null], [undefined, -79.4], [35.2, null], [Number.NaN, 1], [95, 10]] as const) {
    assert.deepEqual(await getTripWeather(lat, lng, {}, nws.fetchImpl, NOW), { status: "no-location" });
  }
  assert.equal(nws.calls.length, 0);
});

test("outside NWS's area is not-covered; any NWS failure is unavailable; it never throws", async () => {
  assert.deepEqual(await getTripWeather(51.5, -0.12, {}, fakeNws({}).fetchImpl, NOW), { status: "not-covered" });
  await quiet(async () => {
    const failures = [
      { ...GOOD, "https://api.weather.gov/points/35.1954,-79.4695": { status: 500 } },
      { ...GOOD, [FORECAST]: { status: 503 } },
      { ...GOOD, [HOURLY]: { status: 404 } },
      { ...GOOD, "https://api.weather.gov/points/35.1954,-79.4695": { status: 200, body: { properties: {} } } },
      { ...GOOD, [FORECAST]: { status: 200, body: {} }, [HOURLY]: { status: 200, body: {} } },
      { ...GOOD, [HOURLY]: new DOMException("The operation was aborted due to timeout", "TimeoutError") },
      { ...GOOD, [FORECAST]: new TypeError("fetch failed") },
    ];
    for (const replies of failures) {
      assert.deepEqual(await getTripWeather(35.1954, -79.4695, {}, fakeNws(replies as never).fetchImpl, NOW), { status: "unavailable" });
    }
  });
});
