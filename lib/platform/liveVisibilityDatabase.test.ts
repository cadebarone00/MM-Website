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

// --- Database: supabase/maroon_live_directory.sql (the public directory at /tap-in) ----------------------------

test("the directory lists only Public trips and tournaments, golf details only, and searches name or course", async () => {
  const { db, cam, oldTrip, pub, priv } = await setup();
  await db.exec(sqlFile("maroon_live_directory.sql"));
  await db.exec(sqlFile("maroon_live_directory.sql")); // safe to run twice
  const list = async (q = "") => (await db.query<{ r: Record<string, unknown>[] }>("select list_public_live_events($1) as r", [q])).rows[0].r;
  // Before: only the public tournament (the old trip is Link only, the other tournament Private).
  assert.deepEqual((await list()).map((e) => [e.kind, e.name]), [["tournament", "Open"]]);
  await set(db, cam, "trip", oldTrip, "public", true);
  const all = await list();
  assert.deepEqual(all.map((e) => e.kind).sort(), ["tournament", "trip"]);
  const trip = all.find((e) => e.kind === "trip")!;
  assert.deepEqual(Object.keys(trip).sort(), ["code", "course", "ended", "firstDate", "kind", "lastDate", "name", "place", "playerCount"]);
  assert.equal(trip.code, (await row(db, "golf_trips", oldTrip)).w);
  assert.equal(trip.playerCount, 1);
  assert.equal(trip.place, "Pinehurst, NC", "a trip shows its location (owner 2026-11-22)");
  assert.equal(all.find((e) => e.kind === "tournament")!.place, null);
  assert.deepEqual((await list("pinehurst, nc")).map((e) => e.name), ["Pinehurst"], "the location finds it");
  assert.ok(!JSON.stringify(all).includes(cam), "no profile ids");
  assert.deepEqual((await list("pine valley")).map((e) => e.name), ["Open"], "a course name finds it");
  assert.deepEqual((await list("PINEHURST")).map((e) => e.name), ["Pinehurst"]);
  await set(db, cam, "tournament", pub, "link", true);
  assert.deepEqual((await list()).map((e) => e.name), ["Pinehurst"], "Link only drops out of the directory");
  assert.equal(priv.length > 0, true);
});

// --- Database: supabase/maroon_live_leagues.sql (leagues on The Maroon Live) --------------------------------------

test("leagues get a share code, open only when not Private, show in the directory when Public, organizer only", async () => {
  const { db, cam, stranger } = await setup();
  const course = { name: "Stevens Park", place: null, par: Array(18).fill(4), strokeIndex: null, tee: null };
  const made = async (name: string) => (await db.query<{ r: { id: string; code: string } }>("select create_league($1, $2, $3, '2026-11-21', 'Gross', true, 5) as r", [cam, name, JSON.stringify(course)])).rows[0].r;
  const before = await made("Thursday");
  await db.exec(sqlFile("maroon_live_directory.sql"));
  await db.exec(sqlFile("maroon_live_leagues.sql"));
  await db.exec(sqlFile("maroon_live_leagues.sql")); // safe to run twice
  const after = await made("Friday");
  const league = async (id: string) => (await db.query<{ w: string; v: string }>("select watch_code w, live_visibility v from leagues where id = $1", [id])).rows[0];
  const [a, b] = [await league(before.id), await league(after.id)];
  for (const l of [a, b]) { assert.match(l.w, /^W[A-HJKMNP-Z2-9]{5}$/); assert.equal(l.v, "private"); }
  assert.notEqual(a.w, b.w);
  assert.ok(![before.code, after.code].includes(a.w));
  // Private: the link doesn't open it and it isn't listed.
  assert.equal(await find(db, a.w), null);
  await assert.rejects(set(db, stranger, "league", before.id, "public", true), /Only the organizer/);
  await set(db, cam, "league", before.id, "link", true);
  assert.deepEqual(await find(db, a.w), { kind: "league", id: before.id, organizer: cam });
  const list = async () => (await db.query<{ r: Record<string, unknown>[] }>("select list_public_live_events('') as r")).rows[0].r;
  assert.ok(!(await list()).some((e) => e.kind === "league"), "Link only isn't listed");
  await set(db, cam, "league", before.id, "public", false);
  const shown = (await list()).find((e) => e.kind === "league")!;
  assert.deepEqual([shown.name, shown.code, shown.course, shown.firstDate, shown.playerCount, shown.ended], ["Thursday", a.w, "Stevens Park", "2026-11-21", 1, false]);
  // Trips and tournaments still work after the functions were replaced.
  assert.ok((await list()).some((e) => e.kind === "tournament"));
});
