import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { startFakeSupabase } from "../../../../scripts/fake-supabase.mjs";
import { SIM_MIGRATIONS } from "../migrations";
import { hostsNewestRound, playChecks } from "../checks/play";
import { PRESETS } from "./setup";
import { seedSetup } from "./seedSetup";
import type { SimCheckResult } from "../types";

const fresh = () => startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS });
const fourBall = PRESETS.find((p) => p.id === "play-fourball")!.setup;

// "server-only" only exists inside Next; give plain node an empty stand-in so the real search file can be loaded here.
const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string; _cache: Record<string, unknown> };
const original = M._resolveFilename;
M._resolveFilename = (request, ...rest) => request === "server-only" ? "server-only-stub" : original(request, ...rest);
M._cache["server-only-stub"] = { id: "server-only-stub", filename: "server-only-stub", loaded: true, exports: {} };

test("seeding a four-ball makes 4 accounts, no round, the course is searchable", async () => {
  const fake = await fresh();
  try {
    const seeded = await seedSetup(fake, fourBall);
    assert.equal(seeded.people.length, 4);
    const rows = (await fake.db.query("select username, display_name from profiles order by username")).rows as { username: string; display_name: string }[];
    assert.deepEqual(rows.map((r) => [r.username, r.display_name]), [["cade", "Cade"], ["cam", "Cam"], ["jake", "Jake"], ["rob", "Rob"]]);
    assert.equal(Number(((await fake.db.query("select count(*) n from shared_rounds")).rows[0] as { n: string }).n), 0);
    assert.deepEqual(seeded.phones.map((p) => p.startPath), ["/", "/", "/", "/"]);
    assert.deepEqual(seeded.refs, { host: seeded.people.find((p) => p.key === "cam")!.id });

    // The same query function the course search route calls, pointed at the fake.
    process.env.SUPABASE_URL = fake.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
    const { searchCourseLibrary, findLibraryCourse } = await import("../../../platform/golfGps/repository/courseLibrarySearch");
    const hits = await searchCourseLibrary("stevens", 12);
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0], { ref: "sim:stevens-park", name: "Stevens Park Golf Course", city: "Dallas", state: "TX", par: 72 });
    assert.deepEqual(fake.unsupported, []);
    // Tapping it: the scorecard route reads the same course by its ref.
    const { scoringCourse } = await import("../../../platform/personalRound");
    const found = await findLibraryCourse("sim:stevens-park");
    const card = scoringCourse("sim:stevens-park", found!.course)!;
    assert.deepEqual(card.par, [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]);
    assert.deepEqual(card.tees, [{ name: "Blue", rating: 70.4, slope: 124 }]);
  } finally { await fake.close(); }
});

test("a course whose tee has no rating comes back with null rating and slope", async () => {
  const fake = await fresh();
  try {
    await seedSetup(fake, PRESETS.find((p) => p.id === "play-unrated")!.setup);
    process.env.SUPABASE_URL = fake.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
    const { findLibraryCourse } = await import("../../../platform/golfGps/repository/courseLibrarySearch");
    const { scoringCourse } = await import("../../../platform/personalRound");
    const card = scoringCourse("sim:sample-muni", (await findLibraryCourse("sim:sample-muni"))!.course)!;
    assert.deepEqual(card.tees, [{ name: "Blue", rating: null, slope: null }]);
  } finally { await fake.close(); }
});

test("checks wait with 'No round yet' until the host starts one", async () => {
  const fake = await fresh();
  try {
    const seeded = await seedSetup(fake, fourBall);
    const host = seeded.people.find((p) => p.key === "cam")!;
    const checks = playChecks({ expectCounted: true, round: hostsNewestRound() });
    const run = async () => Object.fromEntries(await Promise.all(checks.map(async (c) => [c.id, await c.run(fake.db, seeded)] as [string, SimCheckResult])));
    const before = await run();
    for (const c of checks) assert.deepEqual(before[c.id], { status: "waiting", detail: "No round yet" }, c.id);

    const setup = { course: { ref: "sim:stevens-park", name: "Stevens Park Golf Course", place: "Dallas, TX", par: [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4], strokeIndex: null, tees: [{ name: "Blue", rating: 70.4, slope: 124 }] },
      tee: { name: "Blue", rating: 70.4, slope: 124 }, holes: "18", stats: false, countForHandicap: true, datePlayed: "2026-11-24", players: [], guests: [], game: null };
    const round = (await fake.db.query<{ id: string }>("select create_shared_round($1, $2::jsonb, $3::uuid[]) as id", [host.id, JSON.stringify(setup), []])).rows[0].id;
    const after = await run();
    assert.equal(after.linked.status, "pass");
    assert.match(after.linked.detail, /Cam is the host/);
    assert.equal(after.saved.detail, "No scores yet");

    // Deleting the round: the checks still follow it, and "deleted" passes.
    await fake.db.query("select delete_shared_round($1, $2)", [host.id, round]);
    const gone = await run();
    assert.equal(gone.deleted.status, "pass");
  } finally { await fake.close(); }
});
