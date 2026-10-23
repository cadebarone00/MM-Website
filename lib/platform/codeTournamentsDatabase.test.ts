import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/tournament_codes.sql (tournaments joined with a code) ------------------------------------

type Tournament = { code: string; organizerPlays: boolean; status: string; rounds: { number: number }[]; players: { profileId: string; handicap: number | null }[];
  holes: { profileId: string; round: number; hole: number; strokes: number }[]; cards: { profileId: string; round: number }[] } | null;

const PAR = Array(18).fill(4);
const round = (date: string, par: number[] = PAR) => ({ setup: { course: { ref: "c1", name: "Pine Valley", place: "Dallas, TX", par }, tee: null }, date });

async function setup(plays = true) {
  const db = await database();
  await db.exec(sqlFile("tournament_codes.sql"));
  await db.exec(sqlFile("tournament_codes.sql")); // safe to run twice
  const [cam, cade, jake] = [await profile(db, "cam"), await profile(db, "cade"), await profile(db, "jake")];
  const made = (await db.query<{ r: { id: string; code: string } }>("select create_code_tournament($1, $2, $3, $4, $5, $6) as r",
    [cam, "Member-Guest", "Net", plays, 8.4, JSON.stringify([round("2026-11-01"), round("2026-11-02")])])).rows[0].r;
  return { db, cam, cade, jake, ...made };
}
const get = async (db: PGlite, who: string, id: string) => (await db.query<{ r: Tournament }>("select get_code_tournament($1, $2) as r", [who, id])).rows[0].r;
const join = (db: PGlite, who: string, code: string, hcp: number | null = null) => db.query<{ id: string }>("select join_code_tournament($1, $2, $3) as id", [who, code, hcp]);
const strokes = (db: PGlite, who: string, id: string, r: number, hole: number, value: number | null) =>
  db.query("select set_code_tournament_strokes($1, $2, $3, $4, $5)", [who, id, r, hole, value]);

test("the organizer gets a 6-character code with no look-alikes, two rounds, and is on the player list", async () => {
  const { db, cam, id, code } = await setup();
  assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/);
  const t = await get(db, cam, id);
  assert.deepEqual(t!.rounds.map((r) => r.number), [1, 2]);
  assert.deepEqual(t!.players.map((p) => [p.profileId, Number(p.handicap)]), [[cam, 8.4]]);
});

test("an organizer who isn't playing still sees the tournament but can't score", async () => {
  const { db, cam, id } = await setup(false);
  const t = await get(db, cam, id);
  assert.equal(t!.organizerPlays, false);
  assert.equal(t!.players.length, 0);
  await assert.rejects(strokes(db, cam, id, 1, 1, 4), "not a player");
});

test("anyone can look up a code as typed; joining opens the tournament, a wrong code says so", async () => {
  const { db, cade, id, code } = await setup();
  const typed = `${code.slice(0, 3).toLowerCase()}-${code.slice(3)} `;
  const found = (await db.query<{ r: { id: string; member: boolean; rounds: unknown[] } }>("select find_code_tournament($1, $2) as r", [cade, typed])).rows[0].r;
  assert.equal(found.id, id);
  assert.equal(found.member, false);
  assert.equal(found.rounds.length, 2);
  assert.equal(await get(db, cade, id), null, "looking it up doesn't open it");
  assert.equal((await join(db, cade, typed, 12)).rows[0].id, id);
  assert.ok(await get(db, cade, id));
  await assert.rejects(join(db, cade, "ZZZZZZ"), /No tournament has that code/);
});

test("players write only their own strokes, on holes of a real round; submitting needs every hole and locks the card", async () => {
  const { db, cam, cade, id, code } = await setup();
  await join(db, cade, code, 12);
  await strokes(db, cade, id, 1, 1, 5);
  await strokes(db, cam, id, 1, 1, 4);
  await assert.rejects(strokes(db, cade, id, 3, 1, 4), /isn't in this tournament/);
  await assert.rejects(strokes(db, cade, id, 1, 19, 4), /isn't on this round's card/);
  await assert.rejects(db.query("select submit_code_tournament_card($1, $2, $3)", [cade, id, 1]), /every hole/);
  for (let hole = 2; hole <= 18; hole++) await strokes(db, cade, id, 1, hole, 4);
  await db.query("select submit_code_tournament_card($1, $2, $3)", [cade, id, 1]);
  await assert.rejects(strokes(db, cade, id, 1, 1, 3), /already submitted/);
  await strokes(db, cade, id, 2, 1, 6); // the next round is still open
  await strokes(db, cam, id, 1, 1, null); // clearing a hole
  const t = await get(db, cam, id);
  assert.equal(t!.holes.filter((h) => h.profileId === cade).length, 19);
  assert.equal(t!.holes.filter((h) => h.profileId === cam).length, 0);
  assert.deepEqual(t!.cards.map((c) => [c.profileId, c.round]), [[cade, 1]]);
});

test("only the organizer adds rounds or ends it; an ended tournament can't be joined or scored", async () => {
  const { db, cam, cade, jake, id, code } = await setup();
  await join(db, cade, code);
  await assert.rejects(db.query("select add_code_tournament_round($1, $2, $3, $4)", [cade, id, JSON.stringify(round("2026-11-03").setup), "2026-11-03"]), /Only the organizer/);
  assert.equal((await db.query<{ n: number }>("select add_code_tournament_round($1, $2, $3, $4) as n", [cam, id, JSON.stringify(round("2026-11-03", Array(9).fill(3)).setup), "2026-11-03"])).rows[0].n, 3);
  await assert.rejects(db.query("select add_code_tournament_round($1, $2, $3, $4)", [cam, id, JSON.stringify(round("2026-11-04", [4, 4]).setup), "2026-11-04"]), /9 or 18/);
  await assert.rejects(db.query("select end_code_tournament($1, $2)", [cade, id]), /Only the organizer/);
  await db.query("select end_code_tournament($1, $2)", [cam, id]);
  await assert.rejects(join(db, jake, code), /has ended/);
  await assert.rejects(strokes(db, cade, id, 1, 1, 4), /has ended/);
  const mine = (await db.query<{ r: { id: string; status: string; firstDate: string; lastDate: string }[] }>("select list_my_code_tournaments($1) as r", [cade])).rows[0].r;
  assert.deepEqual(mine.map((t) => [t.id, t.status, t.firstDate, t.lastDate]), [[id, "ended", "2026-11-01", "2026-11-03"]]);
  assert.equal((await db.query<{ r: unknown[] }>("select list_my_code_tournaments($1) as r", [jake])).rows[0].r.length, 0);
});
