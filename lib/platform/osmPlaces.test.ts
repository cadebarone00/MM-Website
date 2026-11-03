import { test } from "node:test";
import assert from "node:assert/strict";
import { areaCenter, areaKey, needsRefresh, OSM_MAX_PLACES, overpassQuery, parseOverpass } from "./osmPlaces.ts";

test("nearby trips share one area (≈5 km grid)", () => {
  assert.equal(areaKey(33.4942, -111.9261), "33.50,-111.95");
  assert.equal(areaKey(33.5101, -111.9399), "33.50,-111.95", "a hotel a mile away → same area");
  assert.notEqual(areaKey(33.6, -111.93), areaKey(33.49, -111.93));
  assert.deepEqual(areaCenter("33.50,-111.95"), { latitude: 33.5, longitude: -111.95 });
  assert.equal(areaKey(-33.87, 151.21), "-33.85,151.20", "southern / eastern hemispheres");
});

test("the Overpass request: one category, named places, around the area centre, capped", () => {
  const q = overpassQuery("bars", { latitude: 33.5, longitude: -111.95 });
  assert.match(q, /^\[out:json\]\[timeout:25\];\(/);
  assert.ok(q.includes('nwr["amenity"~"^(bar|pub|biergarten)$"]["name"](around:8000,33.50000,-111.95000);'), "drinks: town-sized search");
  assert.ok(q.includes('nwr["craft"="brewery"]["name"]'));
  assert.ok(q.endsWith(`out center tags ${OSM_MAX_PLACES};`));
  assert.ok(overpassQuery("golf", { latitude: 1, longitude: 2 }).includes('["leisure"="golf_course"]["name"](around:15000,'), "golf: wider search");
});

test("parsing: named + located only, ways use their centre, one per OSM id, readable details", () => {
  const json = { elements: [
    { type: "node", id: 1, lat: 33.49, lon: -111.92, tags: { name: "Goldwater Brewing", craft: "brewery", "addr:housenumber": "3608", "addr:street": "N Scottsdale Rd", "addr:city": "Scottsdale", website: "https://goldwaterbrewing.com", opening_hours: "Mo-Su 12:00-22:00" } },
    { type: "way", id: 2, center: { lat: 33.6, lon: -111.9 }, tags: { name: "TPC Scottsdale", leisure: "golf_course" } },
    { type: "node", id: 1, lat: 33.49, lon: -111.92, tags: { name: "Duplicate" } },
    { type: "node", id: 3, lat: 33.4, lon: -111.9, tags: { amenity: "bar" } },
    { type: "node", id: 4, tags: { name: "No location" } },
    { type: "node", id: 5, lat: 33.48, lon: -111.91, tags: { name: "  The   Mission ", cuisine: "mexican;latin_american", website: "javascript:alert(1)" } },
  ] };
  const bars = parseOverpass(json, "bars");
  assert.deepEqual(bars.map((p) => p.sourceId), ["node/1", "way/2", "node/5"]);
  assert.deepEqual(bars[0], { sourceId: "node/1", name: "Goldwater Brewing", category: "bars", latitude: 33.49, longitude: -111.92,
    address: "3608 N Scottsdale Rd, Scottsdale", detail: "Brewery", website: "https://goldwaterbrewing.com", phone: null, openingHours: "Mo-Su 12:00-22:00" });
  assert.equal(bars[1].latitude, 33.6);
  assert.equal(parseOverpass(json, "golf")[1].detail, "Golf course");
  assert.equal(bars[2].name, "The Mission");
  assert.equal(bars[2].detail, "Mexican, Latin American");
  assert.equal(bars[2].website, null, "only http(s) links are kept");
  assert.deepEqual(parseOverpass(null, "food"), []);
  assert.deepEqual(parseOverpass({ elements: "x" }, "food"), []);
});

test("refresh: never fetched or older than 30 days", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  assert.equal(needsRefresh(null, now), true);
  assert.equal(needsRefresh("2026-10-20T12:00:00Z", now), false);
  assert.equal(needsRefresh("2026-09-20T12:00:00Z", now), true);
  assert.equal(needsRefresh("garbage", now), true);
});

test("daily job: upcoming trips' areas that need a lookup, soonest first, shared areas once, capped", async () => {
  const { areasToRefresh } = await import("./osmPlaces.ts");
  const now = new Date("2026-11-03T09:00:00Z");
  const trips = [
    { latitude: 35.19, longitude: -79.47, startDate: "2027-05-01" },   // Pinehurst, later
    { latitude: 33.4942, longitude: -111.9261, startDate: "2027-04-22" }, // Scottsdale, sooner
    { latitude: 33.51, longitude: -111.94, startDate: "2027-06-01" },   // same Scottsdale area
    { latitude: null, longitude: null, startDate: "2027-01-01" },       // no destination
  ];
  const fetched = new Map([["33.50,-111.95|food", "2026-10-30T00:00:00Z"]]); // fresh: skipped
  const jobs = areasToRefresh(trips, fetched, now, ["food", "golf"], 10);
  assert.deepEqual(jobs, [{ area: "33.50,-111.95", category: "golf" }, { area: "35.20,-79.45", category: "food" }, { area: "35.20,-79.45", category: "golf" }]);
  assert.equal(areasToRefresh(trips, fetched, now, ["food", "golf"], 2).length, 2);
});
