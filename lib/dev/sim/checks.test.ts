import { test } from "node:test";
import assert from "node:assert/strict";
import { startFakeSupabase } from "../../../scripts/fake-supabase.mjs";
import { SIM_MIGRATIONS } from "./migrations";
import { scenarioById } from "./scenarios";
import type { SimCheckResult, SimDb, SimSeeded } from "./types";
import { personalRound, type PersonalRoundSetup } from "../../platform/personalRound";
import { playerRoundPayload } from "../../platform/playerRoundsRows";

const fresh = () => startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS });
const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

async function runAll(scenarioId: string, db: any, seeded: SimSeeded) {
  const out: Record<string, SimCheckResult> = {};
  for (const check of scenarioById(scenarioId)!.checks) out[check.id] = await check.run(db, seeded);
  return out;
}

const person = (seeded: SimSeeded, key: string) => seeded.people.find((p) => p.key === key)!;

/** Host keeps score for the given players (18 holes of par + 1) and for the guest. */
async function enterScores(db: any, seeded: SimSeeded, keys: string[]) {
  const host = person(seeded, "cam");
  for (const key of keys) for (let hole = 1; hole <= 18; hole++) {
    await db.query("select set_shared_round_strokes($1, $2, $3, $4, $5)", [host.id, seeded.refs.round, person(seeded, key).id, hole, PAR[hole - 1] + 1]);
  }
}

/** Saves each player's card the way the Submit button does (the same personalRound the route uses). */
async function savePlayerRounds(db: any, seeded: SimSeeded, keys: string[], tee: { name: string; rating: number | null; slope: number | null }) {
  const round = seeded.refs.round;
  const setup: PersonalRoundSetup = {
    course: { ref: "sim:stevens-park", name: "Stevens Park Golf Course", place: "Dallas, TX", par: PAR, tees: [tee] },
    tee, holes: "18", stats: false, countForHandicap: true, datePlayed: new Date().toISOString().slice(0, 10),
  };
  const card = { strokes: PAR.map((p) => p + 1), putts: PAR.map(() => null), fairways: PAR.map(() => null), greens: PAR.map(() => null) };
  for (const key of keys) {
    const id = person(seeded, key).id;
    const saved = personalRound(id, setup, card, round);
    await db.query("select save_player_round($1, $2::jsonb)", [id, JSON.stringify(playerRoundPayload(saved, null))]);
  }
}

test("a fresh round: linked passes, everything else waits", async () => {
  const fake = await fresh();
  try {
    const seeded = await scenarioById("play-friends")!.seed(fake);
    const r = await runAll("play-friends", fake.db, seeded);
    assert.equal(r.linked.status, "pass");
    for (const id of ["saved", "ended", "profile-once", "handicap", "guest", "deleted"]) assert.equal(r[id].status, "waiting", `${id}: ${r[id].detail}`);
  } finally { await fake.close(); }
});

test("scores entered, host submits for everyone: all pass", async () => {
  const fake = await fresh();
  try {
    const seeded = await scenarioById("play-friends")!.seed(fake);
    const cam = person(seeded, "cam");
    await enterScores(fake.db, seeded, ["cam", "cade"]);
    await fake.db.query("select set_shared_round_guest_strokes($1, $2, 'g0', 1, 5)", [cam.id, seeded.refs.round]);
    const mid = await runAll("play-friends", fake.db, seeded);
    assert.equal(mid.saved.status, "pass");
    assert.match(mid.saved.detail, /^37 holes saved \(/);
    assert.equal(mid.ended.status, "waiting");
    assert.equal(mid["profile-once"].status, "waiting");
    await savePlayerRounds(fake.db, seeded, ["cam", "cade"], { name: "Blue", rating: 70.4, slope: 124 });
    await fake.db.query("select update_shared_round($1, $2, null, true)", [cam.id, seeded.refs.round]);
    const r = await runAll("play-friends", fake.db, seeded);
    for (const id of ["linked", "saved", "ended", "profile-once", "handicap", "guest"]) assert.equal(r[id].status, "pass", `${id}: ${r[id].detail}`);
    assert.match(r.handicap.detail, /^Cam: Counts · differential .*; Cade: Counts · differential /);
    assert.equal(r.deleted.status, "waiting");
    // The lock attempt left no trace.
    const hole = (await fake.db.query("select strokes from shared_round_holes where round_id = $1 and profile_id = $2 and hole = 1", [seeded.refs.round, cam.id])).rows[0] as { strokes: number };
    assert.equal(hole.strokes, PAR[0] + 1);
    // A second save of the same round is not a second row.
    await savePlayerRounds(fake.db, seeded, ["cade"], { name: "Blue", rating: 70.4, slope: 124 });
    assert.equal((await runAll("play-friends", fake.db, seeded))["profile-once"].status, "pass");
  } finally { await fake.close(); }
});

test("ended but a player was never saved: profile-once fails; a still-open lock fails", async () => {
  const fake = await fresh();
  try {
    const seeded = await scenarioById("play-friends")!.seed(fake);
    await savePlayerRounds(fake.db, seeded, ["cam"], { name: "Blue", rating: 70.4, slope: 124 });
    await fake.db.query("select update_shared_round($1, $2, null, true)", [person(seeded, "cam").id, seeded.refs.round]);
    const r = await runAll("play-friends", fake.db, seeded);
    assert.equal(r["profile-once"].status, "fail");
    assert.equal(r.ended.status, "pass");
    // Stand-in database whose lock never refuses: the check must fail.
    const open: SimDb = { query: async (sql: string, p?: unknown[]) => sql.startsWith("do $$") ? Promise.reject(new Error("sim_result:sim_lock_open")) : fake.db.query(sql, p) } as SimDb;
    const ended = scenarioById("play-friends")!.checks.find((c) => c.id === "ended")!;
    assert.equal((await ended.run(open, seeded)).status, "fail");
    // Any other error (not the real "round has ended" refusal) must not count as a lock.
    const other: SimDb = { query: async (sql: string, p?: unknown[]) => sql.startsWith("do $$") ? Promise.reject(new Error("sim_result:function set_shared_round_strokes does not exist")) : fake.db.query(sql, p) } as SimDb;
    const otherResult = await ended.run(other, seeded);
    assert.equal(otherResult.status, "fail");
    assert.match(otherResult.detail, /does not exist/);
  } finally { await fake.close(); }
});

test("delete round: deleted passes, linked says Round deleted", async () => {
  const fake = await fresh();
  try {
    const seeded = await scenarioById("play-friends")!.seed(fake);
    await enterScores(fake.db, seeded, ["cam"]);
    await fake.db.query("select delete_shared_round($1, $2)", [person(seeded, "cam").id, seeded.refs.round]);
    const r = await runAll("play-friends", fake.db, seeded);
    assert.equal(r.deleted.status, "pass");
    assert.equal(r.linked.status, "pass");
    assert.equal(r.linked.detail, "Round deleted");
  } finally { await fake.close(); }
});

test("unrated tee: handicap passes only when not counted", async () => {
  const fake = await fresh();
  try {
    const seeded = await scenarioById("play-unrated")!.seed(fake);
    await enterScores(fake.db, seeded, ["cam"]);
    await savePlayerRounds(fake.db, seeded, ["cam"], { name: "Blue", rating: null, slope: null });
    const r = await runAll("play-unrated", fake.db, seeded);
    assert.equal(r.handicap.status, "pass", r.handicap.detail);
    assert.match(r.handicap.detail, /^Cam: Not counted: /);
    // The same saved round judged by a scenario that expects "counts" fails.
    const solo = scenarioById("play-solo")!.checks.find((c) => c.id === "handicap")!;
    assert.equal((await solo.run(fake.db, seeded)).status, "fail");
  } finally { await fake.close(); }
});
