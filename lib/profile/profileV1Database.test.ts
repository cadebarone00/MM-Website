import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../platform/golfTripCreate.ts";
import { createTournament, database, load, profile, quick, save, sqlFile } from "../platform/testDatabase.ts";

// --- Database: supabase/profile_v1.sql (+ get_golf_trip's member usernames in golf_trips.sql) ---------------------

async function setup(): Promise<PGlite> {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "profile_v1.sql", "profile_v1.sql"]) await db.exec(sqlFile(file));
  return db;
}
const one = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
const createProfile = (db: PGlite, account: string, input: Record<string, unknown>) =>
  one<{ created: boolean; username: string }>(db, "select create_my_profile($1, $2, $3) as r", [account, "me@example.com", JSON.stringify(input)]);
const updateProfile = (db: PGlite, who: string, input: Record<string, unknown>) =>
  one<{ displayName: string; username: string; bio: string | null }>(db, "select update_my_profile($1, $2) as r", [who, JSON.stringify(input)]);
const idFor = (db: PGlite, username: string) => one<string | null>(db, "select profile_id_for_username($1) as r", [username]);
const row = async (db: PGlite, id: string) => (await db.query<Record<string, unknown>>("select * from profiles where id = $1", [id])).rows[0];
const login = async (db: PGlite) => { const id = randomUUID(); await db.query("insert into auth.users values ($1)", [id]); return id; };

test("finish profile setup: exactly one profile, id = the login's id; a second call (double tap, retry) creates nothing", async () => {
  const db = await setup();
  const account = await login(db);
  assert.deepEqual(await createProfile(db, account, { displayName: " Sam Fresh ", username: "samfresh" }), { created: true, username: "samfresh" });
  const saved = await row(db, account);
  assert.deepEqual([saved.id, saved.display_name, saved.username, saved.email, saved.player_slug, saved.bio], [account, "Sam Fresh", "samfresh", "me@example.com", null, null]);
  assert.deepEqual(await createProfile(db, account, { displayName: "Someone Else", username: "other" }), { created: false, username: "samfresh" });
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from profiles where id = $1", [account])).rows[0].n, 1);
  assert.equal((await row(db, account)).display_name, "Sam Fresh", "the second call changed nothing");
  // No profile for a login that doesn't exist; bad names / usernames are refused before anything is written.
  await assert.rejects(createProfile(db, randomUUID(), { displayName: "Ghost", username: "ghost" }), /No account/);
  const next = await login(db);
  await assert.rejects(createProfile(db, next, { displayName: "", username: "fine_name" }), /name/);
  await assert.rejects(createProfile(db, next, { displayName: "Ok", username: "SAMFRESH" }), /taken/, "usernames are unique ignoring case");
  assert.equal(await row(db, next), undefined);
});

test("username rules: shape, reserved words, the old Maroon player codes, uniqueness — and keeping your own is always fine", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const jake = await profile(db, "jake");
  for (const [bad, why] of [["ab", /3–30/], ["has space", /3–30/], ["_lead", /3–30/], ["x".repeat(31), /3–30/], ["edit", /available/], ["Settings", /available/],
    ["MMCOLROS", /available/], ["mmabc", /available/], ["JAKE", /taken/]] as const) {
    await assert.rejects(updateProfile(db, cade, { username: bad }), why, bad);
  }
  assert.equal((await updateProfile(db, cade, { username: "Cade.B_2" })).username, "Cade.B_2");
  assert.equal(await idFor(db, "cade.b_2"), cade, "lookup ignores case");
  assert.equal(await idFor(db, "nobody"), null);
  // A username made before these rules (signup's long placeholder, an old MM code) can be kept as it is.
  await db.query("update profiles set username = 'golfer_0123456789abcdef0123456789abcdef' where id = $1", [jake]);
  assert.equal((await updateProfile(db, jake, { username: "golfer_0123456789abcdef0123456789abcdef", displayName: "Jake" })).displayName, "Jake");
  await db.query("update profiles set username = 'MMJAKSMI' where id = $1", [jake]);
  assert.equal((await updateProfile(db, jake, { username: "MMJAKSMI" })).username, "MMJAKSMI");
});

test("edit profile: name, username and bio only; nothing else in the request changes anything", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const before = await row(db, cade);
  const saved = await updateProfile(db, cade, { displayName: "Cade Barone", bio: "  Lefty, plays fast.  ", id: randomUUID(), player_slug: "cade-barone", created_at: "2001-01-01", platform_role: "admin", email: "x@y.z" });
  assert.deepEqual(saved, { displayName: "Cade Barone", username: "cade", bio: "Lefty, plays fast." });
  const after = await row(db, cade);
  for (const column of ["id", "player_slug", "created_at", "platform_role", "email", "is_host"]) assert.deepEqual(after[column], before[column], column);
  // Keys left out stay as they are; an empty bio clears it; limits hold.
  assert.equal((await updateProfile(db, cade, { displayName: "C. Barone" })).bio, "Lefty, plays fast.");
  assert.equal((await updateProfile(db, cade, { bio: "" })).bio, null);
  await assert.rejects(updateProfile(db, cade, { bio: "x".repeat(1001) }), /1000/);
  await assert.rejects(updateProfile(db, cade, { displayName: " " }), /name/);
  await assert.rejects(updateProfile(db, randomUUID(), { displayName: "Ghost" }), /No account/);
  // Signed-in users can't call any of this directly.
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select update_my_profile($1, '{}')", [cade]));
  await assert.rejects(db.query("select profile_id_for_username('cade')"));
  await db.exec("reset role");
});

test("profile links exist only for claimed profiles: accepted trip members and joined tournament players", async () => {
  const db = await setup();
  const [cade, jake] = [await profile(db, "cade"), await profile(db, "jake")];
  // Golf trip: the organizer (accepted) has a username; a pending invitation doesn't.
  const draft = { requestId: randomUUID(), tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", playerCount: "8", yourName: "Cade",
    yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "", includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no" };
  const payload = (golfTripPayloadFromBody(draft) as { ok: true; payload: CreateGolfTripPayload }).payload;
  const trip = (await one<{ tripId: string }>(db, "select create_golf_trip($1, $2) as r", [cade, JSON.stringify(payload)])).tripId;
  await one(db, "select invite_golf_trip_member($1, $2, $3, $4) as r", [cade, trip, JSON.stringify({ displayName: "Jake", email: "jake@email.com" }), "invite-secret-1-0123456789abcdefghijklmn"]);
  const members = async () => (await one<{ members: { displayName: string; username: string | null; invitationStatus: string }[] }>(db, "select get_golf_trip($1, $2) as r", [cade, trip])).members;
  assert.deepEqual((await members()).map((m) => [m.displayName, m.username]), [["Cade", "cade"], ["Jake", null]]);
  await one(db, "select accept_golf_trip_invitation($1, $2) as r", [jake, "invite-secret-1-0123456789abcdefghijklmn"]);
  assert.deepEqual((await members()).map((m) => [m.displayName, m.username]), [["Cade", "cade"], ["Jake", "jake"]], "linked once accepted");

  // Tournament: only the joined player has a username; the organizer gets the map, nobody else.
  const owner = await profile(db, "owner", { approved: true });
  const edition = await createTournament(db, owner, quick);
  await save(db, owner, edition, "players", { players: [{ name: "Ann Lee" }, { name: "Cy Park" }] });
  const players = Object.fromEntries((await load(db, owner, edition)).players.map((p) => [p.name, p.id]));
  await db.query("update tournament_players set profile_id = $1, claimed_at = now() where id = $2", [jake, players["Ann Lee"]]);
  await db.query("update tournament_players set invite_token_hash = 'hash-for-cy' where id = $1", [players["Cy Park"]]);
  const links = (who: string) => one<Record<string, string> | null>(db, "select list_edition_player_profiles($1, $2) as r", [who, edition]);
  assert.deepEqual(await links(owner), { [players["Ann Lee"]]: "jake" });
  assert.equal(await links(jake), null, "a player isn't an organizer");
});
