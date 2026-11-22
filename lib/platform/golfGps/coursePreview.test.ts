import assert from "node:assert/strict";
import test from "node:test";
import type { GolfCoordinate, GolfCourse } from "./domain";
import { getCoursePreview, getSavedCourseGps } from "./coursePreview";
import { normalizeGolfCourseApiCourse } from "./providers/golfCourseApi/adapter";
import { parseCourse } from "./providers/golfCourseApi/client";
import type { CourseLibraryEntry } from "./repository/courseRepository";
import { deriveCourseGreenTargets } from "./targets/deriveGreenTargets";

// Fixtures: a GolfCourseAPI scorecard course, and the same course "saved" with OSM-style geometry (made-up shapes).
const OG = "7k2m9qb4";
const NOW = "2026-10-05T17:00:00.000Z";
const IMPORT = normalizeGolfCourseApiCourse(parseCourse({ course: {
  id: OG, club_name: "Tobacco Road Golf Club", course_name: "Tobacco Road Golf Club",
  location: { city: "Sanford", state: "NC", latitude: 35.396, longitude: -79.2127 },
  tees: { male: [
    { tee_name: "Ripper", course_rating: 72.5, slope_rating: 145, total_yards: 6557, holes: [{ par: 5, yardage: 558 }, { par: 3, yardage: 152 }] },
    { tee_name: "Plow", total_yards: 5886 },
  ] },
} })!, NOW);
const M = (Math.PI / 180) * 6_371_008.8;
const at = (e: number, n: number): GolfCoordinate => ({ lat: 35.396 + n / M, lng: -79.2127 + e / (M * Math.cos((35.396 * Math.PI) / 180)) });
const osm = (id: string) => ({ provider: "openstreetmap" as const, providerRecordId: id, importedAt: NOW, attribution: "© OpenStreetMap contributors" });
const MAROON_ID = "14aeea73-a5af-4a06-a854-663cb56cbe0e";
const savedMapped = (): GolfCourse => deriveCourseGreenTargets({
  ...IMPORT.course, id: MAROON_ID, sources: [...IMPORT.course.sources, osm("way/430227508")],
  holes: [{ ...IMPORT.course.holes[0], green: { polygon: { coordinates: [at(-10, 440), at(10, 440), at(10, 470), at(-10, 470)], source: osm("way/21") } },
    centerline: { coordinates: [at(0, 0), at(0, 455)], source: osm("way/11") } }, IMPORT.course.holes[1]],
}, NOW).course;
const entry = (course: GolfCourse): CourseLibraryEntry => ({ course, refreshedAt: NOW, stale: false });
const neverCalled = async (): Promise<never> => { throw new Error("must not be called"); };

test("unsaved course: GolfCourseAPI detail for this course only, tee names, and no GPS claim", async () => {
  const calls: string[] = [];
  const preview = await getCoursePreview(OG, { findSaved: async () => null, getDetail: async (id) => { calls.push(id); return IMPORT; } });
  assert.deepEqual(calls, [OG]);
  assert.deepEqual(preview, {
    name: "Tobacco Road Golf Club", city: "Sanford", state: "NC", holeCount: 2,
    teeSets: [{ name: "Ripper", totalYards: 6557 }, { name: "Plow", totalYards: 5886 }],
    scorecard: [{ number: 1, par: 5, yards: { Ripper: 558 } }, { number: 2, par: 3, yards: { Ripper: 152 } }],
    library: { saved: false, gpsAvailable: false, mapAvailable: false, canPrepareGps: true },
    attribution: "Course data: GolfCourseAPI",
  });
});

test("saved GPS-capable course: served from the library without any provider call; GPS available with its Maroon id", async () => {
  const course = savedMapped();
  assert.ok(course.coverage.holesWithGps! > 0);
  const preview = await getCoursePreview(OG, { findSaved: async () => entry(course), getDetail: neverCalled });
  assert.deepEqual(preview?.library, { saved: true, maroonCourseId: MAROON_ID, gpsAvailable: true, mapAvailable: true, canPrepareGps: false });
  assert.equal(preview?.attribution, "Course data: GolfCourseAPI · © OpenStreetMap contributors");
});

test("saved scorecard-only course: saved, but no GPS or map claim", async () => {
  const preview = await getCoursePreview(OG, { findSaved: async () => entry({ ...IMPORT.course, id: MAROON_ID }), getDetail: neverCalled });
  assert.deepEqual(preview?.library, { saved: true, maroonCourseId: MAROON_ID, gpsAvailable: false, mapAvailable: false, canPrepareGps: true });
});

test("library unavailable (e.g. storage not set up): falls back to GolfCourseAPI, shown as not saved", async () => {
  const preview = await getCoursePreview(OG, { findSaved: async () => { throw new Error("not set up"); }, getDetail: async () => IMPORT });
  assert.deepEqual(preview?.library, { saved: false, gpsAvailable: false, mapAvailable: false, canPrepareGps: true });
});

test("the preview carries display fields only — no raw records, provider ids, coverage or geometry", async () => {
  const preview = await getCoursePreview(OG, { findSaved: async () => entry(savedMapped()), getDetail: neverCalled });
  assert.deepEqual(Object.keys(preview!).sort(), ["attribution", "city", "holeCount", "library", "name", "scorecard", "state", "teeSets"]);
  const text = JSON.stringify(preview);
  for (const forbidden of [OG, "way/", "externalIds", "coverage", "coordinates", "providerRecordId", "golf_course_api"]) assert.ok(!text.includes(forbidden), forbidden);
});

test("saved course GPS: normalized GPS data + every hole number; null when nothing is playable", async () => {
  const gps = await getSavedCourseGps(MAROON_ID, async () => entry(savedMapped()));
  assert.equal(gps?.name, "Tobacco Road Golf Club");
  assert.deepEqual(gps?.holeNumbers, [1, 2]);
  assert.deepEqual(gps?.gps.holes.map((h) => h.number), [1]);
  assert.ok(gps?.gps.holes[0].green.front);
  assert.equal(await getSavedCourseGps(MAROON_ID, async () => entry({ ...IMPORT.course, id: MAROON_ID })), null);
  assert.equal(await getSavedCourseGps(MAROON_ID, async () => null), null);
});
