import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { buildPlayerRound, holesFromCard, type PlayerRoundInput } from "./playerRounds.ts";
import { playerRoundPayload, playerRoundsFromJson } from "./playerRoundsRows.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/player_rounds.sql ---------------------------------------------------

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const card = { strokes: PAR.map((p, i) => i === 0 ? p + 8 : p), putts: PAR.map(() => 2), fairways: PAR.map(() => "center" as const), greens: PAR.map(() => "left" as const) };
const round = (who: string, extra: Partial<PlayerRoundInput> = {}) => buildPlayerRound({
  id: "trip:t1:r1", profileId: who, source: "trip", datePlayed: "2027-04-23", course: { ref: "og-12", name: "Canyon Ridge", place: "Scottsdale, AZ" },
  tee: { name: "Blue", rating: 72, slope: 113 }, holesPlayed: 18, format: "Singles Match Play", holes: holesFromCard(card, PAR), enteredBy: "player", ...extra,
});

async function setup(): Promise<PGlite> {
  const db = await database();
  await db.exec(sqlFile("player_rounds.sql"));
  await db.exec(sqlFile("player_rounds.sql")); // safe to run twice
  return db;
}
const save = async (db: PGlite, who: string, payload: unknown) =>
  (await db.query<{ r: { saved: boolean; round: unknown } }>("select save_player_round($1, $2) as r", [who, JSON.stringify(payload)])).rows[0].r;
const list = async (db: PGlite, who: string) => (await db.query<{ r: unknown }>("select list_my_player_rounds($1) as r", [who])).rows[0].r;
const refused = (promise: Promise<unknown>) => assert.rejects(promise);

test("a round saves once per account and comes back exactly as built", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const built = round(cade);
  const first = await save(db, cade, playerRoundPayload(built, "Desert Trip"));
  assert.equal(first.saved, true);
  const again = await save(db, cade, playerRoundPayload({ ...built, format: "Changed" }, "Desert Trip"));
  assert.equal(again.saved, false, "second submit is ignored");
  const [mine] = playerRoundsFromJson(await list(db, cade));
  assert.deepEqual({ ...mine }, { ...built, sourceLabel: "Desert Trip" });
});

test("each account only ever sees its own rounds", async () => {
  const db = await setup();
  const [cade, jake] = [await profile(db, "cade"), await profile(db, "jake")];
  await save(db, cade, playerRoundPayload(round(cade), null));
  await save(db, jake, playerRoundPayload(round(jake, { id: "trip:t1:r1" }), null));
  assert.equal(playerRoundsFromJson(await list(db, cade)).length, 1);
  assert.equal(playerRoundsFromJson(await list(db, jake)).length, 1, "same round key, separate accounts");
  await refused(save(db, "00000000-0000-0000-0000-000000000000", playerRoundPayload(round(cade), null)));
  // No direct table access for signed-in users or visitors.
  await db.exec("set role authenticated");
  await refused(db.query("select * from player_rounds"));
  await refused(db.query("select list_my_player_rounds($1)", [cade]));
  await db.exec("reset role");
});

test("rounds that break the rules are refused", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const ok = playerRoundPayload(round(cade), null);
  await refused(save(db, cade, { ...ok, total: ok.total + 1 }));                       // total ≠ sum of holes
  await refused(save(db, cade, { ...ok, differential: 2 }));                          // wrong differential
  await refused(save(db, cade, { ...ok, enteredBy: "organizer" }));                    // organizer rounds never count
  await refused(save(db, cade, { ...ok, tee: { name: "Blue", rating: null, slope: null } })); // counted without a rating
  await refused(save(db, cade, { ...ok, countsForHandicap: false, differential: null, notCountedReason: null })); // not counted needs a reason
  await refused(save(db, cade, { ...ok, source: "friendly" }));
  await refused(save(db, cade, { ...ok, holes: [...ok.holes, ok.holes[0]] }));         // 19 holes
  await refused(save(db, cade, { ...ok, holes: ok.holes.map((h, i) => i === 0 ? { ...h, strokes: 0 } : h), total: ok.total - 12 }));
  assert.equal(playerRoundsFromJson(await list(db, cade)).length, 0);
  // A not-counted, total-only round (History) is fine.
  const history = playerRoundPayload(round(cade, { id: "history:h1:r1", source: "history", holes: [], total: 91, tee: null, enteredBy: "organizer" }), "Desert Classic");
  assert.equal((await save(db, cade, history)).saved, true);
});

test("privacy starts private and only takes public / private", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const visibility = async () => (await db.query<{ v: string }>("select get_rounds_visibility($1) as v", [cade])).rows[0].v;
  assert.equal(await visibility(), "private");
  await db.query("select set_rounds_visibility($1, 'public')", [cade]);
  assert.equal(await visibility(), "public");
  await refused(db.query("select set_rounds_visibility($1, 'everyone')", [cade]));
  assert.equal(await visibility(), "public");
});

test("rows from the database are checked before the screens use them", () => {
  assert.deepEqual(playerRoundsFromJson(null), []);
  assert.deepEqual(playerRoundsFromJson([{ sourceKey: 1 }, null]), []);
});
