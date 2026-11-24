import { test } from "node:test";
import assert from "node:assert/strict";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/shared_round_delete.sql (Play: the host deletes a live round for everyone) -----------------

async function setup() {
  const db = await database();
  await db.exec(sqlFile("shared_rounds.sql"));
  await db.exec(sqlFile("shared_round_scorekeeper.sql"));
  await db.exec(sqlFile("shared_round_delete.sql"));
  await db.exec(sqlFile("shared_round_delete.sql")); // safe to run twice
  const [cam, cade, jake] = [await profile(db, "cam"), await profile(db, "cade"), await profile(db, "jake")];
  const id = (await db.query<{ id: string }>("select create_shared_round($1, $2, $3) as id",
    [cam, JSON.stringify({ holes: "18", guests: [{ id: "g0", name: "Uncle Rob", handicap: null }] }), [cade, jake]])).rows[0].id;
  await db.query("select answer_shared_round_invite($1, $2, true)", [cade, id]);
  await db.query("select set_shared_round_strokes($1, $2, $3, 1, 5)", [cam, id, cade]);
  await db.query("select set_shared_round_guest_strokes($1, $2, 'g0', 1, 6)", [cam, id]);
  return { db, cam, cade, jake, id };
}
const count = async (db: Awaited<ReturnType<typeof setup>>["db"], table: string, id: string) =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${table === "shared_rounds" ? "id" : "round_id"} = $1`, [id])).rows[0].n);

test("the host deletes a live round: the round, every score, guests and invites are gone for everyone", async () => {
  const { db, cam, cade, jake, id } = await setup();
  await db.query("select delete_shared_round($1, $2)", [cam, id]);
  for (const table of ["shared_rounds", "shared_round_players", "shared_round_holes", "shared_round_guest_holes", "shared_round_picks"])
    assert.equal(await count(db, table, id), 0, `${table} is empty`);
  assert.equal((await db.query<{ r: unknown }>("select get_shared_round($1, $2) as r", [cade, id])).rows[0].r, null, "a player can't open it");
  assert.equal((await db.query<{ r: unknown }>("select my_live_shared_round($1) as r", [cade])).rows[0].r, null, "no live round left for a player");
  assert.deepEqual((await db.query<{ r: unknown }>("select list_my_round_invites($1) as r", [jake])).rows[0].r, [], "the open invite is gone");
});

test("only the host can delete, and only while the round is live", async () => {
  const { db, cam, cade, id } = await setup();
  await assert.rejects(db.query("select delete_shared_round($1, $2)", [cade, id]), /Only the host/, "a player can't delete");
  assert.equal(await count(db, "shared_rounds", id), 1);
  await db.query("select update_shared_round($1, $2, null, true)", [cam, id]);
  await assert.rejects(db.query("select delete_shared_round($1, $2)", [cam, id]), /already over/, "an ended (submitted) round stays");
  assert.equal(await count(db, "shared_rounds", id), 1);
});

test("a player leaves: they're out of the round, the scores already in it stay, the host can't 'leave'", async () => {
  const { db, cam, cade, id } = await setup();
  await assert.rejects(db.query("select leave_shared_round($1, $2)", [cam, id]), /host cancels/);
  await db.query("select leave_shared_round($1, $2)", [cade, id]);
  assert.equal((await db.query<{ r: unknown }>("select get_shared_round($1, $2) as r", [cade, id])).rows[0].r, null, "they can't open it any more");
  assert.equal(await count(db, "shared_round_holes", id), 1, "their score stays in the host's round");
  await assert.rejects(db.query("select leave_shared_round($1, $2)", [cade, id]), /not in a live round/, "leaving twice");
});
