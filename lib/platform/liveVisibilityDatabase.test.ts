import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/maroon_live_visibility.sql (The Maroon Live: Public / Link only / Private) ---------------

const TRIP_DRAFT = {
  requestId: "", tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "8", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no",
};
const round = { setup: { course: { ref: "c1", name: "Pine Valley", place: "", par: Array(18).fill(4) }, tee: null }, date: "2026-11-01" };
type Db = Awaited<ReturnType<typeof database>>;

async function newTrip(db: Db, who: string) {
  const p = golfTripPayloadFromBody({ ...TRIP_DRAFT, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  return (await db.query<{ r: { tripId: string } }>("select create_golf_trip($1, $2) as r", [who, JSON.stringify(p.payload)])).rows[0].r.tripId;
}
const newTournament = async (db: Db, who: string, name: string) =>
  (await db.query<{ r: { id: string } }>("select create_code_tournament($1, $2, 'Gross', true, null, $3) as r", [who, name, JSON.stringify([round])])).rows[0].r.id;

async function setup() {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "tournament_codes.sql", "tournament_tee_sheets.sql", "tournament_cuts.sql",
    "watch_codes.sql", "tournament_public.sql", "leagues.sql"]) await db.exec(sqlFile(file));
  const cam = await profile(db, "cam"), stranger = await profile(db, "sam");
  // Made before the file runs: an old trip, a public and a private tournament.
  const oldTrip = await newTrip(db, cam);
  const pub = await newTournament(db, cam, "Open"), priv = await newTournament(db, cam, "Members");
  await db.query("select set_code_tournament_public($1, $2, true)", [cam, pub]);
  await db.exec(sqlFile("maroon_live_visibility.sql"));
  await db.exec(sqlFile("maroon_live_visibility.sql")); // safe to run twice
  return { db, cam, stranger, oldTrip, pub, priv };
}
const row = async (db: Db, table: string, id: string) =>
  (await db.query<{ v: string; s: boolean; w: string; p?: boolean }>(`select live_visibility v, live_players_can_share s, watch_code w${table === "code_tournaments" ? ", is_public p" : ""} from ${table} where id = $1`, [id])).rows[0];
const find = async (db: Db, code: string) => (await db.query<{ r: { kind: string } | null }>("select find_watch_code($1) as r", [code])).rows[0].r;
const set = (db: Db, who: string, kind: string, id: string, visibility: string, share: boolean) =>
  db.query("select set_live_visibility($1, $2, $3, $4, $5)", [who, kind, id, visibility, share]);

test("existing trips start Link only, public tournaments Public, others Private; new events start Private", async () => {
  const { db, cam, oldTrip, pub, priv } = await setup();
  assert.equal((await row(db, "golf_trips", oldTrip)).v, "link");
  assert.equal((await row(db, "code_tournaments", pub)).v, "public");
  assert.equal((await row(db, "code_tournaments", priv)).v, "private");
  assert.equal((await row(db, "golf_trips", await newTrip(db, cam))).v, "private");
  assert.equal((await row(db, "code_tournaments", await newTournament(db, cam, "Later"))).v, "private");
  assert.equal((await row(db, "golf_trips", oldTrip)).s, true, "players can share by default");
  const leagueCols = await db.query("select 1 from information_schema.columns where table_name = 'leagues' and column_name in ('live_visibility', 'live_players_can_share')");
  assert.equal(leagueCols.rows.length, 2);
});

test("the share link only opens events that aren't Private, and closes as soon as one goes Private", async () => {
  const { db, cam, oldTrip, pub, priv } = await setup();
  assert.equal((await find(db, (await row(db, "golf_trips", oldTrip)).w))?.kind, "trip");
  assert.equal((await find(db, (await row(db, "code_tournaments", pub)).w))?.kind, "tournament");
  assert.equal(await find(db, (await row(db, "code_tournaments", priv)).w), null);
  await set(db, cam, "trip", oldTrip, "private", true);
  assert.equal(await find(db, (await row(db, "golf_trips", oldTrip)).w), null);
  await set(db, cam, "trip", oldTrip, "link", false);
  const back = await row(db, "golf_trips", oldTrip);
  assert.equal((await find(db, back.w))?.kind, "trip", "the same link works again");
  assert.equal(back.s, false);
});

test("a tournament's choice keeps the Tourneys search (is_public) in step, both ways", async () => {
  const { db, cam, priv } = await setup();
  await set(db, cam, "tournament", priv, "public", true);
  assert.deepEqual([(await row(db, "code_tournaments", priv)).v, (await row(db, "code_tournaments", priv)).p], ["public", true]);
  await set(db, cam, "tournament", priv, "link", true);
  assert.deepEqual([(await row(db, "code_tournaments", priv)).v, (await row(db, "code_tournaments", priv)).p], ["link", false]);
  await db.query("select set_code_tournament_public($1, $2, true)", [cam, priv]);
  assert.equal((await row(db, "code_tournaments", priv)).v, "public", "the old switch still works");
});

test("only the organizer can change it, and only to a real choice", async () => {
  const { db, stranger, cam, oldTrip, pub } = await setup();
  await assert.rejects(set(db, stranger, "trip", oldTrip, "public", true), /Only the organizer/);
  await assert.rejects(set(db, stranger, "tournament", pub, "private", true), /Only the organizer/);
  await assert.rejects(set(db, cam, "trip", oldTrip, "unlisted", true), /Pick Public/);
  await assert.rejects(set(db, cam, "league", oldTrip, "public", true), /Unknown event kind/);
  assert.equal((await row(db, "golf_trips", oldTrip)).v, "link");
});

test("signed-in apps can't call it directly (server only)", async () => {
  const { db } = await setup();
  const grants = await db.query<{ g: string }>("select grantee g from information_schema.routine_privileges where routine_name = 'set_live_visibility'");
  assert.ok(!grants.rows.some((r) => ["anon", "authenticated", "PUBLIC"].includes(r.g)));
});
