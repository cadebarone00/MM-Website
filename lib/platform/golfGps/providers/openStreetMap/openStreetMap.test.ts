import assert from "node:assert/strict";
import test from "node:test";
import type { GolfCourse, GolfHole } from "../../domain";
import { GolfProviderError } from "../GolfCourseProvider";
import { createOverpassClient, OSM_ATTRIBUTION, OVERPASS_CACHE_SECONDS, OVERPASS_ENDPOINT, parseOverpassReply } from "./client";
import { deriveCourseGreenTargets } from "../../targets/deriveGreenTargets";
import { parseHoleRef } from "./adapter";
import { nameSimilarity } from "./matching";
import { createOpenStreetMapGeometryProvider } from "./provider";

// A made-up two-hole course laid out in meters around ORIGIN (not real geometry — only for checking the logic).
const ORIGIN = { lat: 35.39, lng: -79.21 };
const M_PER_DEG = (Math.PI / 180) * 6_371_008.8;
const at = (east: number, north: number) => ({ lat: ORIGIN.lat + north / M_PER_DEG, lon: ORIGIN.lng + east / (M_PER_DEG * Math.cos((ORIGIN.lat * Math.PI) / 180)) });
const box = (east: number, north: number, width: number, height = width) => {
  const w = width / 2, h = height / 2;
  const ring = [at(east - w, north - h), at(east + w, north - h), at(east + w, north + h), at(east - w, north + h)];
  return [...ring, ring[0]];
};
const way = (id: number, tags: Record<string, string>, geometry: unknown[]) => ({ type: "way", id, tags, geometry });
const node = (id: number, tags: Record<string, string>, east: number, north: number) => ({ type: "node", id, tags, ...at(east, north) });

const COURSE_OUTLINE = way(100, { leisure: "golf_course", name: "Test Pines Golf Club" }, box(400, 250, 1000, 700));
const OTHER_COURSE = way(200, { leisure: "golf_course", name: "Other Valley Golf Course" }, box(1300, 250, 600, 700));
const FEATURES = [
  way(11, { golf: "hole", ref: "1", par: "4" }, [at(0, 0), at(0, 350)]),
  way(12, { golf: "hole", ref: "2", par: "3" }, [at(200, 350), at(200, 180)]),
  way(13, { golf: "hole" }, [at(600, 0), at(600, 300)]),
  way(21, { golf: "green" }, box(0, 355, 30)),
  way(22, { golf: "green" }, box(200, 175, 25)),
  way(23, { golf: "green" }, box(500, 500, 20)),
  way(31, { golf: "tee" }, box(0, -10, 10)),
  node(32, { golf: "tee" }, 0, 30),
  way(33, { golf: "tee" }, box(200, 360, 10)),
  { type: "relation", id: 41, tags: { golf: "fairway", type: "multipolygon" }, members: [
    { type: "way", ref: 410, role: "outer", geometry: box(0, 200, 40, 150) },
    { type: "way", ref: 411, role: "inner", geometry: box(5, 200, 8) },
  ] },
  way(51, { golf: "bunker" }, box(25, 300, 10)),
  node(52, { golf: "bunker" }, 190, 260),
  way(53, { golf: "bunker" }, box(1200, 300, 10)),
  way(61, { golf: "lateral_water_hazard" }, box(-40, 150, 30)),
  way(62, { natural: "water" }, box(100, 250, 120)),
  way(63, { natural: "water" }, [at(300, 0), null, at(320, 20), at(300, 0)]),
];

const hole = (number: number, par: number): GolfHole => ({
  id: `c:hole-${number}`, number, par, tees: [{ id: `c:hole-${number}:blue`, teeSetId: "blue", name: "Blue", yardage: 300 }],
  fairways: [], bunkers: [], penaltyAreas: [],
  coverage: { level: "scorecard", features: SCORECARD }, verification: { status: "imported" },
});
const SCORECARD = { scorecard: true, teeCoordinates: false, greenPoints: false, greenPolygons: false, fairways: false, hazardLocations: false,
  hazardPolygons: false, holeBoundaries: false, centerlines: false, elevation: false, greenSlope: false };
const COURSE: GolfCourse = {
  id: "open_golf:abc", externalIds: [{ provider: "open_golf", id: "abc" }], name: "Test Pines Golf Club", address: {},
  location: ORIGIN, holeCount: 2, holes: [hole(1, 4), hole(2, 3)], teeSets: [{ id: "blue", name: "Blue" }],
  sources: [{ provider: "open_golf", providerRecordId: "abc" }], coverage: { level: "scorecard", features: SCORECARD, holesWithGps: 0 },
  verification: { status: "imported" },
};
const NOW = new Date("2026-10-05T18:00:00Z");

/** A stand-in for Overpass: answers the course query, then the features query, and records requests. */
function fakeOverpass(replies: unknown[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[calls.length - 1];
    if (reply instanceof Error) throw reply;
    if (typeof reply === "number") return new Response("<?xml version='1.0'?><busy/>", { status: reply });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as unknown as typeof fetch;
  const provider = createOpenStreetMapGeometryProvider({ client: createOverpassClient({ fetchImpl }), now: () => NOW });
  return { calls, provider, query: (i: number) => new URL(calls[i].url).searchParams.get("data") ?? "" };
}
const matched = () => fakeOverpass([{ elements: [COURSE_OUTLINE, OTHER_COURSE] }, { elements: FEATURES }]);

test("queries: two keyless GETs, cached, bounded — nearby course outlines, then only the matched course's box", async () => {
  const { calls, provider, query } = matched();
  await provider.enrichCourse(COURSE);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url.startsWith(`${OVERPASS_ENDPOINT}?data=`)));
  assert.ok(calls.every((call) => call.init.next?.revalidate === OVERPASS_CACHE_SECONDS && call.init.signal));
  assert.match(query(0), /^\[out:json\]\[timeout:25\].*nwr\["leisure"="golf_course"\]\(around:1500,35\.390000,-79\.210000\);out geom;$/);
  assert.match(query(1), /\[bbox:[\d.,-]+\];nwr\["golf"~"\^\(hole\|tee\|green\|fairway\|bunker\|water_hazard\|lateral_water_hazard\|penalty_area\)\$"\];out geom;nwr\["natural"="water"\];out geom\([\d.,-]+\);$/);
});

test("match: the named course containing the location; the neighbour and its features are left out", async () => {
  const result = await matched().provider.enrichCourse(COURSE);
  assert.equal(result.status, "matched");
  assert.deepEqual(result.match, { candidate: { externalId: { provider: "openstreetmap", id: "way/100" }, name: "Test Pines Golf Club", distanceMeters: 0, containsLocation: true, nameSimilarity: 1 }, confidence: 0.95 });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.courseBoundary.length, 1);
  assert.ok(result.notes.includes("1 OSM features in the area belong to other courses or sit outside this course's outline, so they were left out."));
  const everyId = JSON.stringify(result.course) + JSON.stringify(result.unassigned);
  assert.ok(!everyId.includes("way/53"), "other course's bunker never appears");
});

test("green, fairway (with its cut-out), bunker polygon, water and centerline land on hole 1 with their OSM source", async () => {
  const { course } = await matched().provider.enrichCourse(COURSE);
  const one = course.holes[0];
  const osm = (id: string, confidence: number) => ({ provider: "openstreetmap", providerRecordId: id, importedAt: NOW.toISOString(), attribution: OSM_ATTRIBUTION, confidence });
  assert.deepEqual(one.green?.polygon?.source, osm("way/21", 0.95));
  assert.equal(one.green?.polygon?.coordinates.length, 4, "OSM ring copied as-is (open ring)");
  assert.deepEqual([one.green?.front, one.green?.center, one.green?.back], [undefined, undefined, undefined], "no green points invented");
  assert.equal(one.fairways.length, 1);
  assert.equal(one.fairways[0].polygon.source?.providerRecordId, "relation/41");
  assert.equal(one.fairways[0].polygon.innerRings?.length, 1);
  assert.deepEqual(one.bunkers.map((b) => [b.id, b.geometry.kind]), [["osm:way/51", "polygon"]]);
  assert.deepEqual(one.penaltyAreas.map((p) => [p.id, p.kind, p.geometry.kind]), [["osm:way/61", "water", "polygon"]]);
  assert.equal(one.centerline?.coordinates.length, 2);
  assert.equal(one.centerline?.source?.providerRecordId, "way/11");
  assert.deepEqual(one.externalIds, [{ provider: "openstreetmap", id: "way/11" }]);
});

test("tees: OSM tee boxes (outline and point) get a location but no tee set or yardage; scorecard tees stay as they were", async () => {
  const { course } = await matched().provider.enrichCourse(COURSE);
  const [scorecardTee, ...mapped] = course.holes[0].tees;
  assert.deepEqual(scorecardTee, COURSE.holes[0].tees[0]);
  assert.deepEqual(mapped.map((t) => [t.location?.kind, t.teeSetId, t.yardage, t.name]), [["polygon", undefined, undefined, "Tee box"], ["point", undefined, undefined, "Tee box"]]);
  const point = mapped[1].location;
  assert.ok(point?.kind === "point" && point.source?.providerRecordId === "node/32");
  assert.deepEqual(course.holes[1].tees.slice(1).map((t) => t.id), ["c:hole-2:osm:way/33"]);
});

test("point-only bunker stays a point (no outline made up) and lands on hole 2", async () => {
  const { course } = await matched().provider.enrichCourse(COURSE);
  const [bunker] = course.holes[1].bunkers;
  assert.equal(bunker.geometry.kind, "point");
  assert.ok(bunker.geometry.kind === "point" && bunker.geometry.source?.providerRecordId === "node/52");
});

test("unassigned: practice green, water between holes, unnumbered hole line — kept separately with reasons", async () => {
  const { unassigned, counts } = await matched().provider.enrichCourse(COURSE);
  assert.deepEqual(unassigned.map((u) => [u.id, u.kind, u.reason]), [
    ["way/13", "hole", 'hole line has no plain hole number (ref "")'],
    ["way/23", "green", "no hole line ends on this green (practice green?)"],
    ["way/62", "penalty_area", "between holes 1 and 2"],
  ]);
  assert.ok(unassigned.every((u) => u.source.provider === "openstreetmap" && u.source.attribution === OSM_ATTRIBUTION));
  assert.deepEqual(counts, { courseBoundary: true, holeCenterlines: 2, greens: 2, tees: 3, fairways: 1, bunkers: 2, penaltyAreas: 1, unassigned: 3 });
});

test("coverage is measured from what was attached; the course stays imported, never verified", async () => {
  const { course, notes } = await matched().provider.enrichCourse(COURSE);
  // OSM alone gives outlines, not front / center / back, so no hole is at GPS level until targets are derived.
  assert.deepEqual(course.holes.map((h) => h.coverage.level), ["scorecard", "scorecard"]);
  assert.deepEqual(course.holes[0].coverage.features, { ...SCORECARD, teeCoordinates: true, greenPolygons: true, fairways: true, hazardLocations: true, hazardPolygons: true, centerlines: true });
  const playable = deriveCourseGreenTargets(course, NOW.toISOString()).course;
  assert.deepEqual(playable.holes.map((h) => h.coverage.level), ["mapped", "mapped"], "hole 2 is a par 3, so no fairway needed");
  assert.equal(playable.coverage.level, "mapped");
  assert.equal(playable.coverage.holesWithGps, 2);
  assert.equal(course.verification.status, "imported");
  assert.ok(course.holes.every((h) => h.verification.status === "imported"));
  assert.deepEqual(course.externalIds.map((e) => e.id), ["abc", "way/100"]);
  assert.deepEqual(course.sources.at(-1), { provider: "openstreetmap", providerRecordId: "way/100", importedAt: NOW.toISOString(), attribution: OSM_ATTRIBUTION, confidence: 0.95 });
  assert.ok(notes.includes("Skipped 1 OSM water / penalty area outlines that are incomplete or clipped."));
  assert.ok(course.holes.every((h) => !h.elevation && !h.boundary && !h.green?.slope), "no elevation, hole boundary or slope invented");
});

test("low confidence: location inside an OSM course whose name doesn't match → nothing attached, no second query", async () => {
  const renamed = { ...COURSE, name: "Quail Ridge Golf Club" };
  const { provider, calls } = fakeOverpass([{ elements: [COURSE_OUTLINE, OTHER_COURSE] }]);
  const result = await provider.enrichCourse(renamed);
  assert.equal(result.status, "low_confidence");
  assert.equal(result.course, renamed, "course returned unchanged");
  assert.equal(calls.length, 1);
  assert.match(result.notes[0], /inside OSM course "Test Pines Golf Club", but the names don't match/);
});

test("ambiguous, nothing nearby, unnamed outline, and no location are all reported without attaching anything", async () => {
  const twin = way(300, { leisure: "golf_course", name: "Test Pines Golf Club" }, box(400, 250, 900, 600));
  assert.equal((await fakeOverpass([{ elements: [COURSE_OUTLINE, twin] }]).provider.enrichCourse(COURSE)).status, "ambiguous");
  assert.equal((await fakeOverpass([{ elements: [] }]).provider.enrichCourse(COURSE)).status, "no_course_found");
  const unnamed = way(400, { leisure: "golf_course" }, box(400, 250, 1000, 700));
  assert.equal((await fakeOverpass([{ elements: [unnamed] }]).provider.enrichCourse(COURSE)).status, "low_confidence");
  const { provider, calls } = fakeOverpass([]);
  const noLocation = { ...COURSE, location: undefined };
  assert.equal((await provider.enrichCourse(noLocation)).status, "no_location");
  assert.equal(calls.length, 0);
});

test("name matching: numbers must agree, a generic resort name can't stand in for one course", () => {
  assert.equal(nameSimilarity("Pinehurst No. 2", "Pinehurst No. 2"), 1);
  assert.equal(nameSimilarity("Pinehurst No. 2", "Pinehurst Resort Course No 7"), 0);
  assert.ok(nameSimilarity("Pinehurst No. 2", "Pinehurst Resort") < 0.5);
  assert.equal(nameSimilarity("Tobacco Road Golf Club", "Tobacco Road"), 1);
  assert.equal(nameSimilarity("Pebble Beach Golf Links", "Spyglass Hill Golf Course"), 0);
});

test("hole lines: a number drawn twice is unassigned (never guessed), and a line drawn green → tee is read the right way", async () => {
  const twice = [...FEATURES, way(14, { golf: "hole", ref: "2" }, [at(700, 0), at(700, 200)])];
  const dup = await fakeOverpass([{ elements: [COURSE_OUTLINE] }, { elements: twice }]).provider.enrichCourse(COURSE);
  assert.equal(dup.course.holes[1].centerline, undefined);
  assert.deepEqual(dup.unassigned.filter((u) => u.kind === "hole").map((u) => u.reason).sort(), ['hole 2 is drawn 2 times in OSM', 'hole 2 is drawn 2 times in OSM', 'hole line has no plain hole number (ref "")']);
  const reversed = FEATURES.map((f) => f.id === 11 && f.type === "way" ? way(11, { golf: "hole", ref: "1", par: "4" }, [at(0, 350), at(0, 0)]) : f);
  const fixed = await fakeOverpass([{ elements: [COURSE_OUTLINE] }, { elements: reversed }]).provider.enrichCourse(COURSE);
  assert.equal(fixed.course.holes[0].centerline?.coordinates[0].lat, ORIGIN.lat);
  assert.ok(fixed.notes.includes("Hole 1's OSM line runs green → tee, so it was read the other way round."));
});

test("hole refs: plain numbers, or \"hole - #course\" only when the course number is this course's", () => {
  assert.equal(parseHoleRef("7", null), 7);
  assert.equal(parseHoleRef("4 - #2", 2), 4);
  assert.equal(parseHoleRef("2 - #4", 2), 'hole line "2 - #4" belongs to course #4, not this course');
  assert.equal(parseHoleRef("4 - #2", null), 'hole line "4 - #2" belongs to course #2, not this course', "course has no number → not trusted");
  assert.equal(parseHoleRef("Red 3", null), 'hole line has no plain hole number (ref "Red 3")');
});

test("errors: busy (429 / 504), Overpass runtime remarks, non-JSON and network failures are typed errors", async () => {
  const kind = (error: unknown) => error instanceof GolfProviderError && error.provider === "openstreetmap" ? error.kind : null;
  for (const [reply, expected] of [[429, "rate_limited"], [504, "rate_limited"], [500, "http"], [new TypeError("fetch failed"), "network"],
    [Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"]] as const) {
    await assert.rejects(fakeOverpass([reply]).provider.enrichCourse(COURSE), (e) => kind(e) === expected);
  }
  await assert.rejects(fakeOverpass([{ remark: "runtime error: Query timed out in \"query\" at line 1 after 26 seconds.", elements: [] }]).provider.enrichCourse(COURSE), (e) => kind(e) === "timeout");
  assert.throws(() => parseOverpassReply({ nope: [] }), (e) => kind(e) === "malformed");
  assert.deepEqual(parseOverpassReply({ elements: [{ type: "way", id: 1, tags: { golf: "green" }, geometry: [{ lat: 1, lon: 2 }, null] }, { type: "blob", id: 2 }] }),
    [{ type: "way", id: 1, tags: { golf: "green" }, geometry: null }], "clipped geometry → null, unknown element dropped");
});
