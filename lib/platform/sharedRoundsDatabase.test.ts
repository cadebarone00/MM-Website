import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/shared_rounds.sql (invite-only rounds on every player's phone) ---------------------

type Round = { host: string; status: string; players: { profileId: string; position: number; status: string }[]; holes: { profileId: string; hole: number; strokes: number }[]; picks: { hole: number; pick: unknown }[] } | null;

async function setup() {
  const db = await database();
  await db.exec(sqlFile("shared_rounds.sql"));
  await db.exec(sqlFile("shared_rounds.sql")); // safe to run twice
  const [cam, cade, jake, mike] = [await profile(db, "cam"), await profile(db, "cade"), await profile(db, "jake"), await profile(db, "mike")];
  const id = (await db.query<{ id: string }>("select create_shared_round($1, $2, $3) as id", [cam, JSON.stringify({ holes: "18" }), [cade, jake]])).rows[0].id;
  return { db, cam, cade, jake, mike, id };
}
const call = (db: PGlite, sql: string, args: unknown[]) => db.query(sql, args);
const get = async (db: PGlite, who: string, id: string) => (await db.query<{ r: Round }>("select get_shared_round($1, $2) as r", [who, id])).rows[0].r;
const invites = async (db: PGlite, who: string) => (await db.query<{ r: { roundId: string; hostName: string }[] }>("select list_my_round_invites($1) as r", [who])).rows[0].r;
const strokes = (db: PGlite, who: string, id: string, player: string, hole: number, value: number | null) =>
  call(db, "select set_shared_round_strokes($1, $2, $3, $4, $5)", [who, id, player, hole, value]);
const answer = (db: PGlite, who: string, id: string, join: boolean) => call(db, "select answer_shared_round_invite($1, $2, $3)", [who, id, join]);

test("the host starts with invites; invited players see an invite, not the round", async () => {
  const { db, cam, cade, id } = await setup();
  const round = await get(db, cam, id);
  assert.deepEqual(round!.players.map((p) => [p.position, p.status]), [[0, "joined"], [1, "invited"], [2, "invited"]]);
  assert.equal(await get(db, cade, id), null, "an invite doesn't open the round");
  const [invite] = await invites(db, cade);
  assert.equal(invite.hostName, "cam");
  await answer(db, cade, id, true);
  assert.ok(await get(db, cade, id));
  assert.equal((await invites(db, cade)).length, 0);
});

test("players write only their own strokes; the host writes anyone's, including someone still invited", async () => {
  const { db, cam, cade, jake, id } = await setup();
  await answer(db, cade, id, true);
  await strokes(db, cade, id, cade, 1, 4);
  await assert.rejects(strokes(db, cade, id, cam, 1, 3), "a player can't change the host's score");
  await assert.rejects(strokes(db, jake, id, jake, 1, 5), "invited (not joined) can't write");
  await strokes(db, cam, id, cade, 1, 5); // host fixes Cade's score
  await strokes(db, cam, id, jake, 1, 6); // host keeps Jake's while he hasn't joined
  const holes = (await get(db, cade, id))!.holes;
  assert.equal(holes.find((h) => h.profileId === cade)!.strokes, 5);
  assert.equal(holes.find((h) => h.profileId === jake)!.strokes, 6);
});

test("declining drops you out; only the host invites, removes, changes or ends the round", async () => {
  const { db, cam, cade, jake, mike, id } = await setup();
  await answer(db, jake, id, false);
  await assert.rejects(answer(db, jake, id, true), "an answered invite is closed");
  await assert.rejects(call(db, "select invite_to_shared_round($1, $2, $3)", [cade, id, mike]), "players can't invite");
  await call(db, "select invite_to_shared_round($1, $2, $3)", [cam, id, mike]);
  assert.equal((await invites(db, mike)).length, 1);
  await call(db, "select remove_from_shared_round($1, $2, $3)", [cam, id, mike]);
  assert.equal((await invites(db, mike)).length, 0, "a cancelled invite disappears");
  await answer(db, cade, id, true);
  await call(db, "select set_shared_round_pick($1, $2, $3, $4)", [cade, id, 1, JSON.stringify({ wolfPartner: 0 })]);
  assert.deepEqual((await get(db, cam, id))!.picks, [{ hole: 1, pick: { wolfPartner: 0 } }]);
  await assert.rejects(call(db, "select update_shared_round($1, $2, $3, $4)", [cade, id, null, true]), "players can't end the round");
  await call(db, "select update_shared_round($1, $2, $3, $4)", [cam, id, JSON.stringify({ holes: "front" }), true]);
  assert.equal((await get(db, cam, id))!.status, "ended");
  await assert.rejects(strokes(db, cam, id, cam, 2, 4), "no scoring after the round ends");
});

test("up to 5 players, and a removed player can't read the round", async () => {
  const { db, cam, cade, mike, id } = await setup();
  await answer(db, cade, id, true);
  await call(db, "select invite_to_shared_round($1, $2, $3)", [cam, id, mike]);
  const extra = await profile(db, "extra");
  await call(db, "select invite_to_shared_round($1, $2, $3)", [cam, id, extra]);
  await assert.rejects(call(db, "select invite_to_shared_round($1, $2, $3)", [cam, id, await profile(db, "sixth")]), "6th player refused");
  await call(db, "select remove_from_shared_round($1, $2, $3)", [cam, id, cade]);
  assert.equal(await get(db, cade, id), null);
  assert.equal((await db.query<{ id: string }>("select my_live_shared_round($1) as id", [cam])).rows[0].id, id);
});
