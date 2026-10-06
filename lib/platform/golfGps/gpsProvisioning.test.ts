import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { PlayableCourse } from "./courseEnrichment";
import type { GolfCoordinate, GolfCourse } from "./domain";
import { createGpsProvisioner } from "./gpsProvisioning";
import { GolfProviderError } from "./providers/GolfCourseProvider";
import { normalizeOpenGolfCourse } from "./providers/openGolf/adapter";
import { parseCourseDetail } from "./providers/openGolf/client";
import { createCourseRepository } from "./repository/courseRepository";
import { createGolfCourseStore, type DatabaseCall } from "./repository/courseStore";
import { deriveCourseGreenTargets } from "./targets/deriveGreenTargets";

// The real migration in an in-memory Postgres, a fake import pipeline that counts provider work, and made-up geometry.
async function setup(importer: (id: string) => Promise<PlayableCourse | null>, now = () => new Date()) {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(readFileSync("supabase/golf_course_data.sql", "utf8"));
  const call: DatabaseCall = async (fn, args) => {
    const names = Object.keys(args);
    const { rows } = await db.query<{ r: unknown }>(`select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`,
      names.map((n) => (typeof args[n] === "object" ? JSON.stringify(args[n]) : args[n])));
    return rows[0].r;
  };
  const calls: string[] = [];
  const store = createGolfCourseStore(call);
  const repository = createCourseRepository({ store, now, importOpenGolf: async (id) => { calls.push(id); return importer(id); } });
  return { db, store, repository, calls, provisioner: createGpsProvisioner({ repository, now }) };
}

const OG = "e52240da-a538-46b3-ae9a-b46396b20123";
const NOW = "2026-10-05T17:00:00.000Z";
const SCORECARD = normalizeOpenGolfCourse(parseCourseDetail({
  id: OG, course_name: "Tobacco Road Golf Club", city: "Sanford", state: "NC", lat: 35.396, lng: -79.2127, holes: 2,
  holes_data: [{ number: 1, par: 5, yardages: {} }, { number: 2, par: 3, yardages: {} }],
})!, NOW).course;
const M = (Math.PI / 180) * 6_371_008.8;
const at = (e: number, n: number): GolfCoordinate => ({ lat: 35.396 + n / M, lng: -79.2127 + e / (M * Math.cos((35.396 * Math.PI) / 180)) });
const osm = (id: string) => ({ provider: "openstreetmap" as const, providerRecordId: id, importedAt: NOW, attribution: "© OpenStreetMap contributors" });
const MAPPED: GolfCourse = deriveCourseGreenTargets({
  ...SCORECARD, externalIds: [...SCORECARD.externalIds, { provider: "openstreetmap", id: "way/430227508" }], sources: [...SCORECARD.sources, osm("way/430227508")],
  holes: [{ ...SCORECARD.holes[0], green: { polygon: { coordinates: [at(-10, 440), at(10, 440), at(10, 470), at(-10, 470)], source: osm("way/21") } },
    centerline: { coordinates: [at(0, 0), at(0, 455)], source: osm("way/11") } }, SCORECARD.holes[1]],
}, NOW).course;
const playable = (course: GolfCourse) => ({ course }) as PlayableCourse;
const days = (n: number) => () => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

test("not stored → built once and saved; the next request comes from the library with zero provider calls", async () => {
  const { provisioner, calls, repository } = await setup(async () => playable(MAPPED));
  const first = await provisioner.provision(OG);
  assert.equal(first.status, "ready");
  const stored = await repository.findCourseByExternalId("open_golf", OG);
  assert.equal(first.status === "ready" && first.maroonCourseId, stored?.course.id, "returns the saved Maroon id");
  assert.equal(await provisioner.provision(OG).then((r) => r.status), "ready");
  assert.deepEqual(calls, [OG], "providers ran exactly once");
});

test("a stored scorecard-only course is enriched in place: same course id, same hole ids", async () => {
  const { provisioner, store, calls } = await setup(async () => playable(MAPPED), days(8));
  const before = await store.save(SCORECARD);
  const result = await provisioner.provision(OG);
  assert.deepEqual(result, { status: "ready", maroonCourseId: before.course.id });
  const after = await store.load(before.course.id);
  assert.deepEqual(after?.course.holes.map((h) => h.id), before.course.holes.map((h) => h.id));
  assert.ok(after?.course.holes[0].green?.front);
  assert.equal(calls.length, 1);
});

test("no playable GPS data: saved honestly as unavailable, and not re-imported on every tap (only after 7 days)", async () => {
  const fresh = await setup(async () => playable(SCORECARD));
  assert.deepEqual(await fresh.provisioner.provision(OG), { status: "unavailable" });
  assert.deepEqual(await fresh.provisioner.provision(OG), { status: "unavailable" });
  assert.equal(fresh.calls.length, 1, "second tap used the recent check");
  const stored = await fresh.repository.findCourseByExternalId("open_golf", OG);
  assert.ok(stored && stored.course.holes.every((h) => !h.green), "no geometry invented");
  assert.equal(fresh.provisioner.canPrepare(stored), false);
  const later = createGpsProvisioner({ repository: fresh.repository, now: days(8) });
  assert.equal(later.canPrepare(stored), true, "after a week Prepare GPS is offered again");
});

test("provider busy / failing: nothing saved or changed, and the reply is a simple category", async () => {
  const busy = await setup(async () => { throw new GolfProviderError("openstreetmap", "rate_limited", "Overpass rate limit", 429); }, days(8));
  const stored = await busy.store.save(SCORECARD);
  assert.deepEqual(await busy.provisioner.provision(OG), { status: "busy" });
  assert.deepEqual(await busy.store.load(stored.course.id), stored, "stored course untouched");
  const broken = await setup(async () => { throw new Error("database exploded"); });
  assert.deepEqual(await broken.provisioner.provision(OG), { status: "failed" });
  assert.equal((await broken.db.query<{ n: number }>("select count(*)::int n from golf_courses")).rows[0].n, 0, "nothing partial stored");
  const missing = await setup(async () => null);
  assert.deepEqual(await missing.provisioner.provision(OG), { status: "not_found" });
});

test("simultaneous taps for the same course share one run", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { provisioner, calls } = await setup(async () => { await gate; return playable(MAPPED); });
  const both = Promise.all([provisioner.provision(OG), provisioner.provision(OG), provisioner.provision(OG)]);
  release();
  const results = await both;
  assert.ok(results.every((r) => r.status === "ready"));
  assert.equal(calls.length, 1);
});

test("protected stored data is never overwritten: reported as unavailable", async () => {
  const { provisioner, store, db } = await setup(async () => playable(MAPPED), days(8));
  const stored = await store.save(SCORECARD);
  await db.query(`update golf_courses set verification = '{"status":"admin_verified"}'`);
  assert.deepEqual(await provisioner.provision(OG), { status: "unavailable" });
  assert.equal((await store.load(stored.course.id))?.course.verification.status, "admin_verified");
});
