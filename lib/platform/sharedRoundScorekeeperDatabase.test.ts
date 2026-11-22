import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/shared_round_scorekeeper.sql (one scorekeeper, guests, player stats) ---------------------

type Round = { holes: { profileId: string; hole: number; strokes: number | null; putts: number | null; fairway: string | null; green: string | null }[];
  guestHoles: { guestId: string; hole: number; strokes: number }[] } | null;

async function setup(roundSetup: object = { holes: "18" }) {
  const db = await database();
  await db.exec(sqlFile("shared_rounds.sql"));
  await db.exec(sqlFile("shared_round_scorekeeper.sql"));
  await db.exec(sqlFile("shared_round_scorekeeper.sql")); // safe to run twice
  const [cam, cade, jake, mike] = [await profile(db, "cam"), await profile(db, "cade"), await profile(db, "jake"), await profile(db, "mike")];
  const id = (await db.query<{ id: string }>("select create_shared_round($1, $2, $3) as id", [cam, JSON.stringify(roundSetup), [cade]])).rows[0].id;
  await db.query("select answer_shared_round_invite($1, $2, true)", [cade, id]);
  return { db, cam, cade, jake, mike, id };
}
const call = (db: PGlite, sql: string, args: unknown[]) => db.query(sql, args);
const get = async (db: PGlite, who: string, id: string) => (await db.query<{ r: Round }>("select get_shared_round($1, $2) as r", [who, id])).rows[0].r;
const guests = (...names: string[]) => names.map((name, i) => ({ id: `g${i}`, name, handicap: null }));

test("only the host writes strokes, for players and guests", async () => {
  const { db, cam, cade, id } = await setup({ holes: "18", guests: guests("Uncle Rob") });
  await assert.rejects(call(db, "select set_shared_round_strokes($1, $2, $3, $4, $5)", [cade, id, cade, 1, 4]), "a player can't write their own strokes");
  await call(db, "select set_shared_round_strokes($1, $2, $3, $4, $5)", [cam, id, cade, 1, 5]);
  await call(db, "select set_shared_round_guest_strokes($1, $2, $3, $4, $5)", [cam, id, "g0", 1, 6]);
  await assert.rejects(call(db, "select set_shared_round_guest_strokes($1, $2, $3, $4, $5)", [cade, id, "g0", 1, 3]), "a player can't write a guest's strokes");
  await assert.rejects(call(db, "select set_shared_round_guest_strokes($1, $2, $3, $4, $5)", [cam, id, "nobody", 1, 3]), "not a guest in this round");
  const round = (await get(db, cade, id))!;
  assert.equal(round.holes.find((h) => h.profileId === cade)!.strokes, 5);
  assert.deepEqual(round.guestHoles.map((g) => [g.guestId, g.hole, g.strokes]), [["g0", 1, 6]]);
});

test("players write only their own stats, only when the host turned player stats on; stats never touch strokes", async () => {
  const { db, cam, cade, id } = await setup();
  await assert.rejects(call(db, "select set_shared_round_stats($1, $2, $3, $4, $5, $6)", [cade, id, 1, 2, "center", "left"]), "stats are off");
  await call(db, "select update_shared_round($1, $2, $3, false)", [cam, id, JSON.stringify({ holes: "18", playerStats: true })]);
  await call(db, "select set_shared_round_strokes($1, $2, $3, $4, $5)", [cam, id, cade, 1, 5]);
  await call(db, "select set_shared_round_stats($1, $2, $3, $4, $5, $6)", [cade, id, 1, 2, "center", "left"]);
  await assert.rejects(call(db, "select set_shared_round_stats($1, $2, $3, $4, $5, $6)", [cade, id, 2, 2, "sideways", null]), "only known directions");
  await call(db, "select set_shared_round_strokes($1, $2, $3, $4, $5)", [cam, id, cade, 1, 4]);
  const hole = (await get(db, cam, id))!.holes.find((h) => h.profileId === cade && h.hole === 1)!;
  assert.deepEqual([hole.strokes, hole.putts, hole.fairway, hole.green], [4, 2, "center", "left"]);
});

test("guests count toward 5 players: no invite, code join or extra guest past 5", async () => {
  const { db, cam, jake, mike, id } = await setup({ holes: "18", guests: guests("A", "B") });
  await call(db, "select invite_to_shared_round($1, $2, $3)", [cam, id, jake]); // cam + cade + jake + 2 guests = 5
  await assert.rejects(call(db, "select invite_to_shared_round($1, $2, $3)", [cam, id, mike]), "full");
  await assert.rejects(call(db, "select update_shared_round($1, $2, $3, false)", [cam, id, JSON.stringify({ holes: "18", guests: guests("A", "B", "C") })]), "a third guest doesn't fit");
  await assert.rejects(call(db, "select update_shared_round($1, $2, $3, false)", [cam, id, JSON.stringify({ holes: "18", guests: [{ id: "g0", name: "" }] })]), "a guest needs a name");
  await assert.rejects(call(db, "select update_shared_round($1, $2, $3, false)", [cam, id, JSON.stringify({ holes: "18", guests: [{ id: "x", name: "A" }, { id: "x", name: "B" }] })]), "guest ids are unique");
  await assert.rejects(call(db, "select create_shared_round($1, $2, $3)", [mike, JSON.stringify({ guests: guests("A", "B", "C", "D", "E") }), []]), "host + 5 guests is too many");
  const solo = (await db.query<{ id: string }>("select create_shared_round($1, $2, $3) as id", [mike, JSON.stringify({ guests: guests("A", "B", "C", "D") }), []])).rows[0].id;
  assert.ok(solo, "host + 4 guests and no invites starts");
});

test("nothing can be scored once the round has ended", async () => {
  const { db, cam, id } = await setup({ holes: "18", guests: guests("A") });
  await call(db, "select update_shared_round($1, $2, null, true)", [cam, id]);
  await assert.rejects(call(db, "select set_shared_round_guest_strokes($1, $2, $3, $4, $5)", [cam, id, "g0", 1, 4]));
  await assert.rejects(call(db, "select set_shared_round_stats($1, $2, $3, $4, $5, $6)", [cam, id, 1, 2, null, null]));
});
