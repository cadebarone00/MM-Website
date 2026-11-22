import assert from "node:assert/strict";
import test from "node:test";
import { GolfProviderError } from "../GolfCourseProvider";
import { golfCourseApiName } from "./adapter";
import { createGolfCourseApiClient, DETAIL_CACHE_SECONDS, GOLF_COURSE_API_ATTRIBUTION, SEARCH_CACHE_SECONDS } from "./client";
import { createGolfCourseApiProvider } from "./provider";

// Trimmed from real api.golfcourseapi.com replies (2026-11-21): Pinehurst No. 8, 3 of 18 holes, some tees.
const BASE = "https://api.golfcourseapi.com";
const KEY = "TESTKEY0000000000000000000";
const ID = "02j2ef0d";
const PINEHURST = { address: "1 Carolina Vista Dr, Pinehurst, NC 28374, USA", city: "Pinehurst", state: "NC", country: "United States", latitude: 35.1898113, longitude: -79.4682901 };
const SEARCH = { courses: [
  { id: ID, club_name: "Pinehurst Cc", course_name: "No. 8", location: PINEHURST, tees: { female: 5, male: 8 } },
  { id: "d6j016jb", club_name: "Pinehurst Cc", course_name: "No. 6", location: PINEHURST, tees: { female: 6, male: 9 } },
  { id: "7k2m9qb4", club_name: "Lubbock Country Club", course_name: "Lubbock Country Club", location: { city: "Lubbock", state: "TX" }, tees: { male: 4 } },
  { id: "not-valid!", club_name: "Bad id — dropped" },
  { id: "ab12cd34" },
] };
const hole = (par: number, yardage: number, handicap: number) => ({ par, yardage, handicap });
const DETAIL = { course: {
  id: ID, club_name: "Pinehurst Cc", course_name: "No. 8", location: PINEHURST,
  tees: {
    male: [
      { tee_name: "Gold", course_rating: 74.9, slope_rating: 137, bogey_rating: 99.1, total_yards: 7092, total_meters: 6485, number_of_holes: 3, par_total: 13,
        holes: [hole(4, 389, 11), hole(5, 563, 7), hole(4, 414, 9)] },
      { tee_name: "White Tees", course_rating: 70.1, slope_rating: 128, total_yards: 6247, number_of_holes: 3, par_total: 13,
        holes: [hole(4, 320, 11), hole(5, 498, 7), hole(4, 349, 9)] },
    ],
    female: [
      { tee_name: "White Tees", course_rating: 76.2, slope_rating: 140, total_yards: 6247, number_of_holes: 3, par_total: 14,
        holes: [hole(4, 320, 11), hole(5, 498, 7), hole(5, 349, 5)] },
      { tee_name: "Red", course_rating: 69.9, slope_rating: 122, total_yards: 4900, number_of_holes: 3, par_total: 13,
        holes: [hole(4, 280, 13), hole(5, 410, 1), hole(4, 300, 9)] },
    ],
  },
} };
const NOW = new Date("2026-11-21T17:00:00Z");

type Reply = { status: number; body?: unknown; text?: string } | Error;
/** A stand-in for api.golfcourseapi.com that records every request. Unknown URLs get a 404. */
function fakeApi(replies: Record<string, Reply>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[url];
    if (reply instanceof Error) throw reply;
    if (!reply) return new Response(JSON.stringify({ error: "the requested resource could not be found" }), { status: 404 });
    return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const providerWith = (replies: Record<string, Reply>, apiKey: string | undefined = KEY) => {
  const fake = fakeApi(replies);
  return { ...fake, provider: createGolfCourseApiProvider({ client: createGolfCourseApiClient({ fetchImpl: fake.fetchImpl, apiKey }), now: () => NOW }) };
};
const SEARCH_URL = `${BASE}/v1/search?search_query=pinehurst`;
const DETAIL_URL = `${BASE}/v1/courses/${ID}`;
const rejectsWith = (promise: Promise<unknown>, kind: string) =>
  assert.rejects(promise, (error) => error instanceof GolfProviderError && error.kind === kind && error.provider === "golf_course_api");

test("search: one GET with the key as a Bearer token, cached, with a timeout; hits become Maroon search results", async () => {
  const { provider, calls } = providerWith({ [SEARCH_URL]: { status: 200, body: SEARCH } });
  const reply = await provider.searchCourses({ text: "  pinehurst " });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, SEARCH_URL);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${KEY}`);
  assert.equal((calls[0].init as { next?: { revalidate: number } }).next?.revalidate, SEARCH_CACHE_SECONDS);
  assert.ok(calls[0].init.signal, "has a timeout");
  assert.equal(reply.attribution, GOLF_COURSE_API_ATTRIBUTION);
  assert.equal(reply.total, 3, "bad hits (bad id, no name) are dropped");
  assert.deepEqual(reply.results[0], {
    externalId: { provider: "golf_course_api", id: ID }, name: "Pinehurst Cc – No. 8", city: "Pinehurst", state: "NC",
    location: { lat: 35.1898113, lng: -79.4682901 },
  });
  assert.deepEqual(reply.results[2], { externalId: { provider: "golf_course_api", id: "7k2m9qb4" }, name: "Lubbock Country Club", city: "Lubbock", state: "TX" },
    "no location → left out, never invented");
});

test("search: state filter and limit are applied here (GolfCourseAPI has neither)", async () => {
  const { provider } = providerWith({ [SEARCH_URL]: { status: 200, body: SEARCH } });
  assert.deepEqual((await provider.searchCourses({ text: "pinehurst", state: "tx" })).results.map((r) => r.name), ["Lubbock Country Club"]);
  assert.equal((await provider.searchCourses({ text: "pinehurst", limit: 1 })).results.length, 1);
});

test("course names: club + course joined unless one already contains the other", () => {
  assert.equal(golfCourseApiName("Pinehurst Cc", "No. 8"), "Pinehurst Cc – No. 8");
  assert.equal(golfCourseApiName("Torrey Pines", "Torrey Pines South"), "Torrey Pines South");
  assert.equal(golfCourseApiName("Bandon Dunes Golf Resort", "Bandon"), "Bandon Dunes Golf Resort");
  assert.equal(golfCourseApiName(null, "No. 8"), "No. 8");
  assert.equal(golfCourseApiName(null, null), "Unnamed course");
});

test("detail: GolfCourseAPI course → Maroon GolfCourse with provider id, source, address and scorecard", async () => {
  const { provider, calls } = providerWith({ [DETAIL_URL]: { status: 200, body: DETAIL } });
  const result = await provider.getCourseDetail(ID.toUpperCase());
  assert.equal(calls[0].url, DETAIL_URL, "ids are sent lower-case");
  assert.equal((calls[0].init as { next?: { revalidate: number } }).next?.revalidate, DETAIL_CACHE_SECONDS);
  const course = result!.course;
  assert.equal(course.id, `golf_course_api:${ID}`);
  assert.deepEqual(course.externalIds, [{ provider: "golf_course_api", id: ID }]);
  assert.equal(course.name, "Pinehurst Cc – No. 8");
  assert.equal(course.facilityName, "Pinehurst Cc");
  assert.deepEqual(course.address, { street: "1 Carolina Vista Dr", city: "Pinehurst", state: "NC", country: "US" });
  assert.deepEqual(course.location, { lat: 35.1898113, lng: -79.4682901 });
  assert.deepEqual(course.sources, [{ provider: "golf_course_api", providerRecordId: ID, importedAt: NOW.toISOString(), attribution: GOLF_COURSE_API_ATTRIBUTION }]);
  assert.equal(course.holeCount, 3);
  assert.deepEqual(course.holes.map((h) => [h.number, h.par, h.strokeIndex]), [[1, 4, 11], [2, 5, 7], [3, 4, 9]], "pars + handicaps from the first men's tee");
  assert.deepEqual(course.holes[0].tees.map((t) => [t.name, t.yardage]), [["Gold", 389], ["White Tees", 320], ["Red", 280]]);
});

test("tees: same-named men's / women's boxes become one tee set with a rating per gender; women-only tees keep their own pars", async () => {
  const { provider } = providerWith({ [DETAIL_URL]: { status: 200, body: DETAIL } });
  const { course, notes } = (await provider.getCourseDetail(ID))!;
  assert.deepEqual(course.teeSets, [
    { id: "gold", name: "Gold", totalYards: 7092, par: 13, ratings: [{ gender: "men", courseRating: 74.9, slopeRating: 137 }] },
    { id: "white-tees", name: "White Tees", totalYards: 6247, par: 13, ratings: [{ gender: "men", courseRating: 70.1, slopeRating: 128 }, { gender: "women", courseRating: 76.2, slopeRating: 140 }] },
    { id: "red", name: "Red", totalYards: 4900, par: 13, ratings: [{ gender: "women", courseRating: 69.9, slopeRating: 122 }] },
  ]);
  assert.ok(notes.some((n) => n.includes('"White Tees"') && n.includes("hole 3")), "a different women's par is reported, not silently mixed in");
  const red = course.holes[1].tees.find((t) => t.name === "Red")!;
  assert.equal(red.par, undefined, "same par as the hole → no override");
  assert.equal(red.strokeIndex, 1, "a different handicap on this tee is kept on the tee");
});

test("no GPS geometry is invented: scorecard coverage, no tee locations, greens or hazards", async () => {
  const { provider } = providerWith({ [DETAIL_URL]: { status: 200, body: DETAIL } });
  const { course } = (await provider.getCourseDetail(ID))!;
  assert.equal(course.coverage.level, "scorecard");
  assert.equal(course.coverage.holesWithGps, 0);
  for (const h of course.holes) {
    assert.equal(h.green, undefined);
    assert.deepEqual([h.fairways, h.bunkers, h.penaltyAreas], [[], [], []]);
    assert.ok(h.tees.every((t) => t.location === undefined));
  }
});

test("incomplete data: bad tees dropped, a hole without any par left out, missing fields stay absent", async () => {
  const { provider } = providerWith({ [DETAIL_URL]: { status: 200, body: { course: {
    id: ID, course_name: "No Club Course",
    tees: { male: [
      { tee_name: "Blue", course_rating: "72", slope_rating: 999, holes: [{ par: 4, yardage: 400 }, { par: 9, yardage: "x" }, { par: 3 }] },
      { course_rating: 70 },
    ] },
  } } } });
  const { course, notes } = (await provider.getCourseDetail(ID))!;
  assert.equal(course.name, "No Club Course");
  assert.equal(course.facilityName, undefined);
  assert.deepEqual(course.address, {});
  assert.equal(course.location, undefined);
  assert.deepEqual(course.teeSets, [{ id: "blue", name: "Blue" }], "bad rating / slope dropped, not guessed");
  assert.deepEqual(course.holes.map((h) => h.number), [1, 3], "hole 2 had no valid par");
  assert.ok(notes.some((n) => n.includes("Hole 2 has no par")));
  assert.equal(course.holes[1].tees.length, 0, "no yardage → no scorecard tee");
});

test("a course with no tee boxes is a course with no scorecard (not an error)", async () => {
  const { provider } = providerWith({ [DETAIL_URL]: { status: 200, body: { course: { id: ID, club_name: "Tiny Club", tees: {} } } } });
  const { course, notes } = (await provider.getCourseDetail(ID))!;
  assert.deepEqual([course.holeCount, course.holes.length, course.coverage.features.scorecard], [0, 0, false]);
  assert.ok(notes.some((n) => n.includes("no tee boxes")));
});

test("errors: 404 → null; 401, 429, 500, non-JSON, wrong shape, timeout and network → typed errors", async () => {
  assert.equal(await providerWith({}).provider.getCourseDetail(ID), null);
  await rejectsWith(providerWith({ [SEARCH_URL]: { status: 401, body: { error: "API key is missing or invalid" } } }).provider.searchCourses({ text: "pinehurst" }), "http");
  await rejectsWith(providerWith({ [SEARCH_URL]: { status: 429 } }).provider.searchCourses({ text: "pinehurst" }), "rate_limited");
  await rejectsWith(providerWith({ [SEARCH_URL]: { status: 500 } }).provider.searchCourses({ text: "pinehurst" }), "http");
  await rejectsWith(providerWith({ [SEARCH_URL]: { status: 200, text: "<html>" } }).provider.searchCourses({ text: "pinehurst" }), "malformed");
  await rejectsWith(providerWith({ [SEARCH_URL]: { status: 200, body: { results: [] } } }).provider.searchCourses({ text: "pinehurst" }), "malformed");
  await rejectsWith(providerWith({ [DETAIL_URL]: { status: 200, body: { course: { name: "no id" } } } }).provider.getCourseDetail(ID), "malformed");
  await rejectsWith(providerWith({ [SEARCH_URL]: Object.assign(new Error("slow"), { name: "TimeoutError" }) }).provider.searchCourses({ text: "pinehurst" }), "timeout");
  await rejectsWith(providerWith({ [SEARCH_URL]: new TypeError("fetch failed") }).provider.searchCourses({ text: "pinehurst" }), "network");
});

test("bad input and a missing key never call GolfCourseAPI", async () => {
  const { provider, calls } = providerWith({});
  await rejectsWith(provider.searchCourses({ text: "a" }), "bad_request");
  await rejectsWith(provider.searchCourses({ text: "x".repeat(101) }), "bad_request");
  await rejectsWith(provider.getCourseDetail("e52240da-a538-46b3-ae9a-b46396b20123"), "bad_request");
  await rejectsWith(provider.getCourseDetail("12345678".replace("1", "i")), "bad_request");
  const noKey = providerWith({ [SEARCH_URL]: { status: 200, body: SEARCH } }, "  ");
  await rejectsWith(noKey.provider.searchCourses({ text: "pinehurst" }), "http");
  assert.equal(calls.length + noKey.calls.length, 0);
});
