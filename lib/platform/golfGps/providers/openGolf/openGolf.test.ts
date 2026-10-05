import assert from "node:assert/strict";
import test from "node:test";
import { toPrototypeGpsCourse } from "../../domain";
import { GolfProviderError } from "../GolfCourseProvider";
import { createOpenGolfClient, DETAIL_CACHE_SECONDS, OPEN_GOLF_ATTRIBUTION, parseCourseDetail, SEARCH_CACHE_SECONDS } from "./client";
import { createOpenGolfProvider } from "./provider";

// Trimmed from real api.opengolfapi.org replies for Pinehurst No. 2 (2026-10-05): 3 of 18 holes, 4 of 10 tees.
const ID = "b25a4e85-561a-4ca4-8028-7c3480c9bbc0";
const BASE = "https://api.opengolfapi.org";
const ATTRIBUTION_FIELDS = { _license: "ODbL-1.0", _attribution: "© OpenStreetMap contributors (ODbL 1.0) via OpenGolfAPI — https://opengolfapi.org/attribution" };
const EMPTY_GEOMETRY = { tee_coords: null, green: { center: null, front: null, back: null }, green_polygon: null, fairway_polygon: null,
  green_depth_yards: null, green_width_yards: null, landing_zone: null, dogleg: null, elevation: null, plays_like_yards: null, hazards: [] };
const SEARCH = { courses: [
  { id: ID, name: "Pinehurst No. 2", course_name: "Pinehurst No. 2", latitude: 35.1917072, longitude: -79.4607309, state: "NC", city: "Pinehurst", type: "Resort", par: 70, phone: "(800) 487-4653", website: "http://www.pinehurst.com/nc-golf-courses.php" },
  { id: "1fd2236e-6dfe-4307-928a-5e78343b3285", name: "Pinehurst Resort Country Club No 10", latitude: null, longitude: null, state: "NC", city: "Aberdeen", par: null },
  { name: "No id — dropped" },
], total: 22, ...ATTRIBUTION_FIELDS };
const DETAIL = {
  id: ID, course_name: "Pinehurst No. 2", club_name: "Pinehurst No. 2", city: "Pinehurst", state: "NC", lat: 35.1917072, lng: -79.4607309,
  type: "Resort", par: 70, holes: 18, yardage: 7588, timezone: null, architect: "Donald Ross", year_built: 1907, phone: "(800) 487-4653",
  website: "http://www.pinehurst.com/nc-golf-courses.php", address: null, postal_code: "28374", ratings: null, sources: null,
  tees: [
    { tee_key: "us-open-male", tee_name: "US Open", tee_color: null, gender: "Male", course_rating: 76.5, slope: 138, par: 70, yardage: 7588 },
    { tee_key: "us-open-female", tee_name: "US Open", tee_color: null, gender: "Female", course_rating: 77.8, slope: 140, par: 70, yardage: 7588 },
    { tee_key: "blue-male", tee_name: "Blue", tee_color: "blue", gender: "Male", course_rating: 73.7, slope: 133, par: 72, yardage: 6961 },
    { tee_key: "white-male", tee_name: "White", tee_color: "white", gender: "Male", course_rating: 70.7, slope: 126, par: 72, yardage: 6307 },
  ],
  holes_data: [
    { number: 1, par: 4, handicap_index: 11, yardages: { web: 403, blue: 393, white: 376 }, ...EMPTY_GEOMETRY },
    { number: 2, par: 4, handicap_index: 3, yardages: { web: 500, blue: 439, white: 411 }, ...EMPTY_GEOMETRY },
    { number: 3, par: 4, handicap_index: 9, yardages: { web: 387, blue: 350, white: 330 }, ...EMPTY_GEOMETRY },
  ],
  climate: { season_start: 2 }, nearby: { hotels: [] }, booking_link: "https://api.opengolfapi.org/api/v1/book/t/x", ...ATTRIBUTION_FIELDS,
};
const NOW = new Date("2026-10-05T17:00:00Z");

type Reply = { status: number; body?: unknown; text?: string } | Error;
/** A stand-in for api.opengolfapi.org that records every request. Unknown URLs get a 404. */
function fakeOpenGolf(replies: Record<string, Reply>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[url];
    if (reply instanceof Error) throw reply;
    if (!reply) return new Response(JSON.stringify({ error: "Course not found" }), { status: 404 });
    return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const providerWith = (replies: Record<string, Reply>) => {
  const fake = fakeOpenGolf(replies);
  return { ...fake, provider: createOpenGolfProvider({ client: createOpenGolfClient({ fetchImpl: fake.fetchImpl }), now: () => NOW }) };
};
const DETAIL_URL = `${BASE}/api/v1/courses/${ID}`;
const rejectsWith = (promise: Promise<unknown>, kind: string) =>
  assert.rejects(promise, (error) => error instanceof GolfProviderError && error.kind === kind && error.provider === "open_golf");

test("search: one keyless GET to /v1/courses/search, cached, with a timeout; hits become Maroon search results", async () => {
  const { provider, calls } = providerWith({ [`${BASE}/v1/courses/search?q=Pinehurst&limit=5&state=NC`]: { status: 200, body: SEARCH } });
  const reply = await provider.searchCourses({ text: "  Pinehurst ", state: "nc", limit: 5 });
  assert.equal(calls.length, 1);
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("authorization"), null, "no API key");
  assert.ok(calls[0].init.signal, "has a timeout signal");
  assert.equal(calls[0].init.next?.revalidate, SEARCH_CACHE_SECONDS);
  assert.equal(reply.total, 22);
  assert.equal(reply.attribution, OPEN_GOLF_ATTRIBUTION);
  assert.deepEqual(reply.results, [
    { externalId: { provider: "open_golf", id: ID }, name: "Pinehurst No. 2", city: "Pinehurst", state: "NC", location: { lat: 35.1917072, lng: -79.4607309 }, par: 70 },
    { externalId: { provider: "open_golf", id: "1fd2236e-6dfe-4307-928a-5e78343b3285" }, name: "Pinehurst Resort Country Club No 10", city: "Aberdeen", state: "NC" },
  ]);
});

test("detail: OpenGolf course → Maroon GolfCourse with provider id, source and scorecard", async () => {
  const { provider, calls } = providerWith({ [DETAIL_URL]: { status: 200, body: DETAIL } });
  const result = await provider.getCourseDetail(ID);
  assert.ok(result);
  const { course } = result;
  assert.equal(calls[0].init.next?.revalidate, DETAIL_CACHE_SECONDS);
  assert.equal(course.id, `open_golf:${ID}`);
  assert.deepEqual(course.externalIds, [{ provider: "open_golf", id: ID }]);
  assert.deepEqual(course.sources, [{ provider: "open_golf", providerRecordId: ID, importedAt: NOW.toISOString(), attribution: OPEN_GOLF_ATTRIBUTION }]);
  assert.deepEqual(course.verification, { status: "imported", updatedAt: NOW.toISOString() });
  assert.equal(course.name, "Pinehurst No. 2");
  assert.equal(course.facilityName, undefined, "club name same as course name");
  assert.deepEqual(course.address, { city: "Pinehurst", state: "NC", postalCode: "28374" });
  assert.deepEqual(course.location, { lat: 35.1917072, lng: -79.4607309 });
  assert.equal("timezone" in course, false, "null timezone stays absent");
  assert.equal(course.holeCount, 18);
  assert.deepEqual(course.metadata, { architect: "Donald Ross", yearOpened: 1907, access: "resort", website: "http://www.pinehurst.com/nc-golf-courses.php", phone: "(800) 487-4653" });
  assert.deepEqual(course.holes.map((h) => [h.number, h.par, h.strokeIndex]), [[1, 4, 11], [2, 4, 3], [3, 4, 9]]);
  assert.deepEqual(course.holes[0].tees.map((t) => [t.teeSetId, t.yardage]), [["blue", 393], ["white", 376]]);
  assert.equal(course.holes[0].tees[0].id, `open_golf:${ID}:hole-1:blue`);
});

test("rating / slope: per-gender OpenGolf tees become one tee set with a rating per gender", async () => {
  const { provider } = providerWith({ [DETAIL_URL]: { status: 200, body: DETAIL } });
  const { course } = (await provider.getCourseDetail(ID))!;
  assert.deepEqual(course.teeSets, [
    { id: "us-open", name: "US Open", totalYards: 7588, par: 70, ratings: [{ gender: "men", courseRating: 76.5, slopeRating: 138 }, { gender: "women", courseRating: 77.8, slopeRating: 140 }] },
    { id: "blue", name: "Blue", color: "blue", totalYards: 6961, par: 72, ratings: [{ gender: "men", courseRating: 73.7, slopeRating: 133 }] },
    { id: "white", name: "White", color: "white", totalYards: 6307, par: 72, ratings: [{ gender: "men", courseRating: 70.7, slopeRating: 126 }] },
  ]);
});

test("no GPS geometry is invented: scorecard coverage, no locations, greens, hazards, elevation", async () => {
  const { provider } = providerWith({ [DETAIL_URL]: { status: 200, body: DETAIL } });
  const { course } = (await provider.getCourseDetail(ID))!;
  assert.equal(course.coverage.level, "scorecard");
  assert.equal(course.coverage.holesWithGps, 0);
  assert.deepEqual(Object.entries(course.coverage.features).filter(([, on]) => on).map(([name]) => name), ["scorecard"]);
  for (const hole of course.holes) {
    assert.equal(hole.coverage.level, "scorecard");
    assert.equal(hole.green, undefined);
    assert.deepEqual([hole.fairways, hole.bunkers, hole.penaltyAreas], [[], [], []]);
    assert.equal(hole.boundary ?? hole.centerline ?? hole.elevation, undefined);
    assert.ok(hole.tees.every((tee) => tee.location === undefined));
  }
  assert.equal(toPrototypeGpsCourse(course), null, "nothing for the GPS screen to show");
});

test("notes: odd provider data is reported, not silently fixed", async () => {
  const withMap = { ...DETAIL, holes_data: [{ ...DETAIL.holes_data[0], green: { center: { lat: 1, lng: 2 }, front: null, back: null } }, ...DETAIL.holes_data.slice(1)] };
  const { provider } = providerWith({ [DETAIL_URL]: { status: 200, body: withMap } });
  const { course, notes } = (await provider.getCourseDetail(ID))!;
  assert.equal(course.holes[0].green, undefined, "map data in an unknown format is not imported");
  assert.deepEqual(notes, [
    'Hole yardages for "web" don\'t match any tee set, so they were left out.',
    "OpenGolf sent map data for hole 1 in a format not imported yet, so no GPS data was added.",
    "OpenGolf says 18 holes but listed 3.",
  ]);
  const full = { ...DETAIL, holes: 3, par: 70, holes_data: DETAIL.holes_data.map(({ yardages, ...hole }) => ({ ...hole, yardages: { blue: yardages.blue } })) };
  const fullProvider = providerWith({ [DETAIL_URL]: { status: 200, body: full } }).provider;
  assert.deepEqual((await fullProvider.getCourseDetail(ID))!.notes, ["OpenGolf lists course par 70, but the hole pars add up to 12."]);
});

test("incomplete data: bad tees / holes are dropped one by one, missing fields stay absent", async () => {
  const messy = {
    id: ID, course_name: null, name: "Fallback Name", club_name: "Some Club", lat: 200, lng: -79.4, holes: null, type: "Private/Resort",
    tees: [{ tee_name: "Blue", course_rating: 73.7, slope: 999 }, { tee_name: "" }, "junk"],
    holes_data: [{ number: 2, par: null, yardages: {} }, { number: 1, par: 4, yardages: { blue: "400", BLUE: -3 } }, { number: 1, par: 5, yardages: {} }, { par: 3 }],
  };
  const { provider } = providerWith({ [DETAIL_URL]: { status: 200, body: messy } });
  const { course, notes } = (await provider.getCourseDetail(ID))!;
  assert.equal(course.name, "Fallback Name");
  assert.equal(course.facilityName, "Some Club");
  assert.equal(course.location, undefined, "out-of-range latitude is not used");
  assert.equal(course.metadata?.access, undefined, "an access type we can't map exactly is left out");
  assert.deepEqual(course.teeSets, [{ id: "blue", name: "Blue" }], "impossible slope dropped, so no rating");
  assert.deepEqual(course.holes.map((h) => [h.number, h.par, h.tees.length]), [[1, 4, 0]]);
  assert.equal(course.holeCount, 1);
  assert.deepEqual(notes, ["Hole 1 is listed twice; the first one was used.", "Hole 2 has no par, so it was left out.", "OpenGolf gave no hole count; using the 1 hole it listed."]);
  assert.equal(parseCourseDetail({ course_name: "No id" }), null);
  assert.equal(parseCourseDetail("nope"), null);
});

test("errors: 404 → null; 429, 500, non-JSON, wrong shape, timeout and network → typed errors; bad input never calls OpenGolf", async () => {
  const missing = "00000000-0000-0000-0000-000000000000";
  const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
  const { provider, calls } = providerWith({
    [`${BASE}/v1/courses/search?q=busy&limit=20`]: { status: 429, body: { error: "limit" } },
    [`${BASE}/v1/courses/search?q=broken&limit=20`]: { status: 500 },
    [`${BASE}/v1/courses/search?q=html&limit=20`]: { status: 200, text: "<html>" },
    [`${BASE}/v1/courses/search?q=shape&limit=20`]: { status: 200, body: { results: [] } },
    [`${BASE}/v1/courses/search?q=slow&limit=20`]: timeout,
    [`${BASE}/v1/courses/search?q=offline&limit=20`]: new TypeError("fetch failed"),
    [`${BASE}/api/v1/courses/${ID}`]: { status: 200, body: { error: "weird" } },
  });
  assert.equal(await provider.getCourseDetail(missing), null);
  await rejectsWith(provider.searchCourses({ text: "busy" }), "rate_limited");
  await rejectsWith(provider.searchCourses({ text: "broken" }), "http");
  await rejectsWith(provider.searchCourses({ text: "html" }), "malformed");
  await rejectsWith(provider.searchCourses({ text: "shape" }), "malformed");
  await rejectsWith(provider.searchCourses({ text: "slow" }), "timeout");
  await rejectsWith(provider.searchCourses({ text: "offline" }), "network");
  await rejectsWith(provider.getCourseDetail(ID), "malformed");
  const before = calls.length;
  await rejectsWith(provider.searchCourses({ text: "a" }), "bad_request");
  await rejectsWith(provider.searchCourses({ text: "pinehurst", state: "North Carolina" }), "bad_request");
  await rejectsWith(provider.getCourseDetail("../../admin"), "bad_request");
  assert.equal(calls.length, before);
});
