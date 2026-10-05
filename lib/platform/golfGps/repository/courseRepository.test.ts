import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { GolfCoordinate, GolfCourse, GolfSourceMetadata } from "../domain";
import { normalizeOpenGolfCourse } from "../providers/openGolf/adapter";
import { parseCourseDetail } from "../providers/openGolf/client";
import { deriveCourseGreenTargets } from "../targets/deriveGreenTargets";
import { createCourseRepository } from "./courseRepository";
import { createGolfCourseStore, GolfCourseStoreError, type DatabaseCall } from "./courseStore";
import { UnsupportedCourseDataError } from "./storageRows";

// Runs supabase/golf_course_data.sql in an in-memory Postgres (PGlite) — no real database, no live providers.
async function database() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(readFileSync("supabase/golf_course_data.sql", "utf8"));
  const call: DatabaseCall = async (fn, args) => {
    const names = Object.keys(args);
    const { rows } = await db.query<{ result: unknown }>(`select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as result`,
      names.map((n) => (typeof args[n] === "object" ? JSON.stringify(args[n]) : args[n])));
    return rows[0].result;
  };
  return { db, store: createGolfCourseStore(call) };
}
const count = async (db: PGlite, table: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;

// --- Fixtures ---------------------------------------------------------------------------------------------------------
const OG_ID = "e52240da-a538-46b3-ae9a-b46396b20123";
const NOW = "2026-10-05T17:01:42.090Z";
const SCORECARD = normalizeOpenGolfCourse(parseCourseDetail({
  id: OG_ID, course_name: "Tobacco Road Golf Club", city: "Sanford", state: "NC", postal_code: "27332", lat: 35.3960739636, lng: -79.2127389438,
  timezone: "America/New_York", holes: 2, par: 8, type: "Public", architect: "Mike Strantz",
  tees: [{ tee_name: "Ripper", gender: "Male", course_rating: 72.5, slope: 145, par: 71, yardage: 6557 }, { tee_name: "Plow", gender: "Female", course_rating: 75.7, slope: 145 }],
  holes_data: [{ number: 1, par: 5, handicap_index: 3, yardages: { ripper: 558, plow: 521 } }, { number: 2, par: 3, handicap_index: 11, yardages: { ripper: 152 } }],
})!, NOW).course;

// A mapped version: OSM-style geometry laid out in meters around the course (made-up shapes, real structure).
const M = (Math.PI / 180) * 6_371_008.8, ORIGIN = SCORECARD.location!, COS = Math.cos((ORIGIN.lat * Math.PI) / 180);
const at = (e: number, n: number): GolfCoordinate => ({ lat: ORIGIN.lat + n / M, lng: ORIGIN.lng + e / (M * COS) });
const box = (e: number, n: number, w: number, h = w) => [at(e - w / 2, n - h / 2), at(e + w / 2, n - h / 2), at(e + w / 2, n + h / 2), at(e - w / 2, n + h / 2)];
const osm = (id: string, confidence?: number): GolfSourceMetadata => ({ provider: "openstreetmap", providerRecordId: id, importedAt: NOW, attribution: "© OpenStreetMap contributors", ...(confidence !== undefined && { confidence }) });
function mapped(): GolfCourse {
  const [one, two] = SCORECARD.holes;
  const course: GolfCourse = {
    ...SCORECARD,
    externalIds: [...SCORECARD.externalIds, { provider: "openstreetmap", id: "way/430227508" }],
    sources: [...SCORECARD.sources, osm("way/430227508", 0.95)],
    holes: [
      { ...one, externalIds: [{ provider: "openstreetmap", id: "way/11" }], sources: [osm("way/11")],
        tees: [...one.tees, { id: `${one.id}:osm:way/31`, name: "Tee box", location: { kind: "polygon", polygon: { coordinates: box(0, -5, 10), source: osm("way/31", 0.85) } } },
          { id: `${one.id}:osm:node/32`, name: "Tee box", location: { kind: "point", coordinate: at(0, 20), source: osm("node/32", 0.85) } }],
        green: { polygon: { coordinates: box(0, 455, 30), source: osm("way/21", 0.95) } },
        fairways: [{ id: "osm:relation/41", polygon: { coordinates: box(0, 250, 40, 200), innerRings: [box(5, 250, 8)], source: osm("relation/41", 0.85) } }],
        bunkers: [{ id: "osm:way/51", geometry: { kind: "polygon", polygon: { coordinates: box(25, 400, 10), source: osm("way/51", 0.85) } } },
          { id: "osm:node/52", geometry: { kind: "point", point: at(-20, 300), source: osm("node/52", 0.7) }, label: "Waste bunker" }],
        penaltyAreas: [{ id: "osm:way/61", kind: "water", geometry: { kind: "polygon", polygon: { coordinates: box(-40, 150, 30), source: osm("way/61", 0.85) } } }],
        centerline: { coordinates: [at(0, 0), at(0, 200), at(0, 455)], source: osm("way/11", 0.95) } },
      two,
    ],
  };
  return deriveCourseGreenTargets(course, NOW).course;
}
/** Stored copies get Maroon UUIDs; compare everything else exactly. */
const sameExceptIds = (stored: GolfCourse, original: GolfCourse) => {
  assert.match(stored.id, /^[0-9a-f-]{36}$/);
  stored.holes.forEach((h) => assert.match(h.id, /^[0-9a-f-]{36}$/));
  const strip = (c: GolfCourse) => JSON.parse(JSON.stringify({ ...c, id: "", holes: c.holes.map((h) => ({ ...h, id: "" })) }));
  assert.deepEqual(strip(stored), strip(original));
};

// --- Tests -------------------------------------------------------------------------------------------------------------

test("scorecard-only course: saves and reads back exactly, with no geometry or targets invented", async () => {
  const { db, store } = await database();
  const saved = await store.save(SCORECARD);
  sameExceptIds(saved.course, SCORECARD);
  assert.equal(saved.importedAt, NOW);
  for (const table of ["golf_hole_features", "golf_green_targets"]) assert.equal(await count(db, table), 0, `${table} stays empty`);
  assert.ok(saved.course.holes.every((h) => !h.green && h.tees.every((t) => !t.location)));
});

test("mapped course: geometry, OSM provenance, external ids and derived targets all survive the round trip", async () => {
  const { store } = await database();
  const original = mapped();
  assert.ok(original.holes[0].green?.front && original.holes[0].green.derivation?.frontBack, "fixture has derived targets");
  const saved = await store.save(original);
  sameExceptIds(saved.course, original);
  const hole = saved.course.holes[0];
  assert.deepEqual(hole.green?.polygon?.source, osm("way/21", 0.95), "raw outline keeps its OSM source");
  assert.equal(hole.green?.derivation?.frontBack?.derivedBy, "maroon");
  assert.deepEqual(hole.green?.derivation?.frontBack?.inputs.map((i) => i.providerRecordId), ["way/21", "way/11"]);
  assert.deepEqual(hole.fairways[0].polygon.innerRings?.length, 1);
  assert.deepEqual(saved.course.externalIds, [{ provider: "open_golf", id: OG_ID }, { provider: "openstreetmap", id: "way/430227508" }]);
  assert.equal(await store.findIdByExternalId("openstreetmap", "way/430227508"), saved.course.id);
  assert.equal(await store.findIdByExternalId("open_golf", OG_ID), saved.course.id);
});

test("provenance in the rows: every row has a provider + license; derived targets are kept apart from raw shapes", async () => {
  const { db, store } = await database();
  await store.save(mapped());
  const features = (await db.query<{ kind: string; provider: string; license: string; data: Record<string, unknown> }>("select kind, provider, license, data from golf_hole_features")).rows;
  assert.ok(features.every((f) => f.provider === "openstreetmap" && f.license === "ODbL-1.0"));
  const green = features.find((f) => f.kind === "green")!;
  assert.deepEqual(Object.keys(green.data).sort(), ["coordinates", "source"], "the raw green row has no derived points");
  const [targets] = (await db.query<{ license: string; front_back_derivation: { derivedBy: string } }>("select license, front_back_derivation from golf_green_targets")).rows;
  assert.equal(targets.license, "ODbL-1.0", "derived from ODbL inputs → still ODbL");
  assert.equal(targets.front_back_derivation.derivedBy, "maroon");
  const tees = (await db.query<{ provider: string; license: string; location: unknown }>("select t.provider, t.license, t.location from golf_hole_tees t join golf_holes h on h.id = t.hole_id order by h.number, t.position")).rows;
  assert.deepEqual(tees.map((t) => [t.provider, t.license, t.location !== null]), [
    ["open_golf", "ODbL-1.0", false], ["open_golf", "ODbL-1.0", false], ["openstreetmap", "ODbL-1.0", true], ["openstreetmap", "ODbL-1.0", true],
    ["open_golf", "ODbL-1.0", false]], "hole 1: two scorecard tees + two OSM tee boxes; hole 2: one scorecard tee");
  // The database itself refuses a derived target that doesn't say who derived it.
  await assert.rejects(db.query(`update golf_green_targets set front_back_derivation = '{"derivedBy":"osm"}'`), /check constraint/);
});

test("library: a stored course loads without calling any provider", async () => {
  const { store } = await database();
  const stored = await store.save(mapped());
  const repository = createCourseRepository({ store, importOpenGolf: async () => { throw new Error("providers must not be called"); } });
  const result = await repository.getOrImportOpenGolfCourse(OG_ID);
  assert.equal(result?.from, "library");
  assert.equal(result?.entry.course.id, stored.course.id);
  assert.deepEqual(result?.entry.course, stored.course);
});

test("import flow: not stored yet → imported once, saved, then served from the library", async () => {
  const { store } = await database();
  let calls = 0;
  const repository = createCourseRepository({ store, importOpenGolf: async () => { calls++; return { course: SCORECARD } as never; } });
  const first = await repository.getOrImportOpenGolfCourse(OG_ID);
  const second = await repository.getOrImportOpenGolfCourse(OG_ID);
  assert.deepEqual([first?.from, second?.from, calls], ["import", "library", 1]);
  assert.equal(await repository.getOrImportOpenGolfCourse("00000000-0000-0000-0000-000000000000").then(() => "ok", () => "threw"), "ok");
});

test("refresh: rebuilds in place — same course and hole ids, new data, newer refreshedAt", async () => {
  const { store } = await database();
  const before = await store.save(SCORECARD);
  const updated = mapped();
  const repository = createCourseRepository({ store, importOpenGolf: async () => ({ course: updated }) as never });
  const after = await repository.refreshCourse(before.course.id);
  assert.equal(after.course.id, before.course.id);
  assert.deepEqual(after.course.holes.map((h) => h.id), before.course.holes.map((h) => h.id));
  assert.ok(after.course.holes[0].green?.front, "now has targets");
  assert.ok(after.refreshedAt >= before.refreshedAt);
  sameExceptIds(after.course, updated);
});

test("a failing provider never touches the stored course", async () => {
  const { store } = await database();
  const stored = await store.save(mapped());
  const repository = createCourseRepository({ store, importOpenGolf: async () => { throw new Error("Overpass is too busy right now"); } });
  await assert.rejects(repository.refreshCourse(stored.course.id), /too busy/);
  assert.deepEqual(await store.load(stored.course.id), stored);
  const gone = createCourseRepository({ store, importOpenGolf: async () => null });
  await assert.rejects(gone.refreshCourse(stored.course.id), /stored copy was kept/);
  assert.deepEqual((await store.load(stored.course.id))?.course, stored.course);
});

test("refresh rule: a course holding non-open (e.g. proprietary) or verified data can't be overwritten by an import", async () => {
  const { db, store } = await database();
  const stored = await store.save(mapped());
  await db.query("update golf_hole_features set license = 'proprietary' where kind = 'bunker'");
  await assert.rejects(store.save(mapped()), (error) => error instanceof GolfCourseStoreError && error.code === "protected_data");
  assert.equal(await count(db, "golf_hole_features where license = 'proprietary'"), 2, "protected rows untouched");
  await db.query("update golf_hole_features set license = 'ODbL-1.0'");
  await db.query(`update golf_courses set verification = '{"status":"admin_verified"}'`);
  await assert.rejects(store.save(mapped()), (error) => error instanceof GolfCourseStoreError && error.code === "protected_data");
  assert.equal((await store.load(stored.course.id))?.course.verification.status, "admin_verified");
});

test("data the storage can't hold yet is refused, not dropped", async () => {
  const { db, store } = await database();
  const withElevation = { ...SCORECARD, holes: [{ ...SCORECARD.holes[0], elevation: { teeToGreenMeters: -4 } }, SCORECARD.holes[1]] };
  await assert.rejects(store.save(withElevation), UnsupportedCourseDataError);
  assert.equal(await count(db, "golf_courses"), 0);
});

test("stale flag after 180 days, and the tables are closed to the browser roles", async () => {
  const { db, store } = await database();
  const saved = await store.save(SCORECARD);
  const later = createCourseRepository({ store, importOpenGolf: async () => null, now: () => new Date(Date.now() + 181 * 24 * 60 * 60 * 1000) });
  assert.equal((await later.getCourseById(saved.course.id))?.stale, true);
  assert.equal((await createCourseRepository({ store, importOpenGolf: async () => null }).getCourseById(saved.course.id))?.stale, false);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from golf_courses"), /permission denied/);
    await assert.rejects(db.query(`select public.get_golf_course('${saved.course.id}')`), /permission denied/);
    await db.exec("reset role");
  }
});

// --- Production-safety audit checks ------------------------------------------------------------------------------------

test("migration is idempotent: running it a second time over stored data changes nothing", async () => {
  const { db, store } = await database();
  const saved = await store.save(mapped());
  await db.exec(readFileSync("supabase/golf_course_data.sql", "utf8"));
  assert.deepEqual(await store.load(saved.course.id), saved);
});

test("a save that fails half-way leaves the stored course exactly as it was (all-or-nothing)", async () => {
  const { store } = await database();
  const saved = await store.save(mapped());
  const broken = mapped();
  // Hole 2's tees get duplicate keys → unique violation, after hole 1 was already rewritten inside the same call.
  broken.holes[1] = { ...broken.holes[1], tees: [broken.holes[1].tees[0], broken.holes[1].tees[0]] };
  await assert.rejects(store.save(broken), /unique|duplicate/i);
  assert.deepEqual(await store.load(saved.course.id), saved);
});

test("SECURITY DEFINER functions pin search_path (temp schema last), so a temp table can't shadow a golf_* table", async () => {
  const { db, store } = await database();
  const saved = await store.save(SCORECARD);
  const fns = (await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
    "select proname, prosecdef, proconfig from pg_proc where proname in ('find_golf_course_id','get_golf_course','golf_course_has_protected_data','save_golf_course') order by proname")).rows;
  assert.equal(fns.length, 4);
  for (const fn of fns) assert.deepEqual([fn.prosecdef, fn.proconfig], [true, ["search_path=public, pg_temp"]], fn.proname);
  await db.exec("create temp table golf_courses (id uuid, name text)");
  await db.exec(`insert into pg_temp.golf_courses values ('${saved.course.id}', 'Shadow')`);
  assert.equal((await store.load(saved.course.id))?.course.name, "Tobacco Road Golf Club", "reads the real table, not the temp one");
});

test("green targets: every stored point must be Maroon-derived; source-given points are refused, not stored without a source", async () => {
  const { db, store } = await database();
  await store.save(mapped());
  await assert.rejects(db.query("update golf_green_targets set center_derivation = null"), /check constraint/);
  await assert.rejects(db.query("update golf_green_targets set front_back_derivation = null"), /check constraint/);
  const sourceGiven = mapped();
  const green = sourceGiven.holes[0].green!;
  sourceGiven.holes[0] = { ...sourceGiven.holes[0], green: { polygon: green.polygon, center: green.center, front: green.front, back: green.back } };
  await assert.rejects(store.save(sourceGiven), UnsupportedCourseDataError);
});

test("refresh protection also covers non-open external ids and hole-level sources", async () => {
  const { db, store } = await database();
  const saved = await store.save(mapped());
  await db.query(`insert into golf_course_external_ids values ('${saved.course.id}', 9, 'golf_intelligence', 'gi-123')`);
  await assert.rejects(store.save(mapped()), (e) => e instanceof GolfCourseStoreError && e.code === "protected_data");
  assert.equal(await store.findIdByExternalId("golf_intelligence", "gi-123"), saved.course.id, "paid-provider id kept");
  await db.query("delete from golf_course_external_ids where provider = 'golf_intelligence'");
  await db.query(`update golf_holes set sources = '[{"provider":"golf_intelligence"}]' where number = 1`);
  await assert.rejects(store.save(mapped()), (e) => e instanceof GolfCourseStoreError && e.code === "protected_data");
});

test("verification status is checked by the database (refresh protection relies on it)", async () => {
  const { db, store } = await database();
  await store.save(SCORECARD);
  await assert.rejects(db.query(`update golf_courses set verification = '{"status":"admin-verified"}'`), /check constraint/);
  await assert.rejects(db.query(`update golf_holes set verification = '{}'`), /check constraint/);
});
