import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/golf_trip_join_links.sql --------------------------------------------
// One shareable link per trip (golf_trips.join_code). It lasts 30 minutes; anyone holding it joins instantly.

const TRIP_DRAFT = {
  requestId: "", tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "8", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no",
};
const A = "join-code-A-0123456789abcdefghij";
const B = "join-code-B-0123456789abcdefghij";
const C = "join-code-C-0123456789abcdefghij";

async function setup(): Promise<PGlite> {
  const db = await database();
  await db.exec(sqlFile("golf_trips.sql"));
  await db.exec(sqlFile("golf_trip_invitations.sql"));
  await db.exec(sqlFile("golf_trip_join_links.sql"));
  await db.exec(sqlFile("golf_trip_join_links.sql")); // safe to run twice
  return db;
}
async function makeTrip(db: PGlite, who: string) {
  const p = golfTripPayloadFromBody({ ...TRIP_DRAFT, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  return (await db.query<{ r: { tripId: string } }>("select create_golf_trip($1, $2) as r", [who, JSON.stringify(p.payload)])).rows[0].r.tripId;
}
const one = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
type Link = { code: string; expiresAt: string } | null;
const code = (db: PGlite, who: string, trip: string, next: string) => one<Link>(db, "select golf_trip_join_code($1, $2, $3) as r", [who, trip, next]);
const reset = (db: PGlite, who: string, trip: string, next: string) => one<Link>(db, "select reset_golf_trip_join_code($1, $2, $3) as r", [who, trip, next]);
const preview = (db: PGlite, who: string | null, c: string) => one<Record<string, unknown> | null>(db, "select get_golf_trip_join_preview($1, $2) as r", [who, c]);
const join = (db: PGlite, who: string, c: string) => one<{ status: string; tripId?: string }>(db, "select join_golf_trip_by_code($1, $2) as r", [who, c]);
const members = async (db: PGlite, who: string, trip: string) =>
  (await one<{ members: { profileId: string | null; invitationStatus: string; displayName: string }[] } | null>(db, "select get_golf_trip($1, $2) as r", [who, trip]))?.members ?? null;
const setExpiry = (db: PGlite, trip: string, interval: string) => db.query(`update golf_trips set join_code_expires_at = now() + interval '${interval}' where id = $1`, [trip]);

test("a member gets one stable 30-minute code; a non-member gets nothing", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  const first = await code(db, cade, trip, A);
  assert.equal(first?.code, A);
  const minutes = (Date.parse(first!.expiresAt) - Date.now()) / 60000;
  assert.ok(minutes > 29 && minutes <= 30.1, `expires in ~30 minutes, got ${minutes}`);
  assert.equal((await code(db, cade, trip, B))?.code, A, "same code while it has time left");
  const john = await profile(db, "john");
  assert.equal(await code(db, john, trip, B), null);
  assert.equal((await join(db, john, A)).status, "joined");
  assert.equal((await code(db, john, trip, B))?.code, A, "an accepted member sees the same link");
});

test("after 30 minutes the link is expired: no preview join, and the next copy hands out a fresh code", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await code(db, cade, trip, A);
  await setExpiry(db, trip, "-1 second");
  const stranger = await profile(db, "mike");
  assert.equal((await preview(db, stranger, A))?.status, "expired");
  assert.deepEqual(await join(db, stranger, A), { status: "expired" });
  assert.equal((await members(db, cade, trip))!.length, 1, "nobody was added");
  assert.equal((await preview(db, cade, A))?.status, "member", "a member still sees member");
  assert.equal((await code(db, cade, trip, B))?.code, B);
});

test("a link with under 5 minutes left is replaced; with 10 minutes left it is kept", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await code(db, cade, trip, A);
  await setExpiry(db, trip, "10 minutes");
  assert.equal((await code(db, cade, trip, B))?.code, A);
  await setExpiry(db, trip, "4 minutes");
  assert.equal((await code(db, cade, trip, B))?.code, B);
});

test("only the organizer can reset; the old code then stops working", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await code(db, cade, trip, A);
  const john = await profile(db, "john");
  await join(db, john, A);
  await assert.rejects(reset(db, john, trip, B));
  assert.equal((await reset(db, cade, trip, C))?.code, C);
  assert.equal(await preview(db, john, A), null);
  assert.deepEqual(await join(db, await profile(db, "late"), A), { status: "not_found" });
});

test("preview shows the trip, never emails; organizer sees member", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await code(db, cade, trip, A);
  const shown = await preview(db, null, A);
  assert.equal(shown?.status, "open");
  assert.equal(shown?.tripName, "Pinehurst");
  assert.equal(shown?.tripId, trip);
  assert.equal(shown?.organizerName, "Cade");
  assert.equal(JSON.stringify(shown).includes("@"), false);
  assert.equal((await preview(db, cade, A))?.status, "member");
  assert.equal(await preview(db, cade, "unknown-code-0123456789abcdefgh"), null);
});

test("joining adds an accepted member once; organizer and repeat calls are already_member; unknown is not_found", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await code(db, cade, trip, A);
  const john = await profile(db, "john");
  assert.deepEqual(await join(db, john, A), { status: "joined", tripId: trip });
  const row = (await members(db, cade, trip))!.find((m) => m.profileId === john)!;
  assert.deepEqual([row.displayName, row.invitationStatus], ["john", "accepted"]);
  assert.deepEqual(await join(db, john, A), { status: "already_member", tripId: trip });
  assert.deepEqual(await join(db, cade, A), { status: "already_member", tripId: trip });
  assert.deepEqual(await join(db, john, "unknown-code-0123456789abcdefgh"), { status: "not_found" });
});

test("someone already invited by email who joins by link claims their invite instead of a second row", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await code(db, cade, trip, A);
  await db.query("select invite_golf_trip_member($1, $2, $3, $4)", [cade, trip, JSON.stringify({ displayName: "John Smith", email: "john@test.com" }), "invite-secret-0123456789abcdefghijklmn"]);
  const john = await profile(db, "john");
  await db.query("update profiles set email = 'John@Test.com' where id = $1", [john]);
  assert.equal((await join(db, john, A)).status, "joined");
  const all = (await members(db, cade, trip))!;
  assert.equal(all.length, 2);
  assert.equal(all.find((m) => m.profileId === john)?.invitationStatus, "accepted");
});

test("a removed member can rejoin until the organizer resets the link", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await code(db, cade, trip, A);
  const john = await profile(db, "john");
  await join(db, john, A);
  const memberId = (await db.query<{ id: string }>("select id from golf_trip_members where profile_id = $1", [john])).rows[0].id;
  await db.query("select remove_golf_trip_member($1, $2, $3)", [cade, trip, memberId]);
  assert.equal((await join(db, john, A)).status, "joined");
  await db.query("select remove_golf_trip_member($1, $2, (select id from golf_trip_members where profile_id = $3))", [cade, trip, john]);
  await reset(db, cade, trip, B);
  assert.equal((await join(db, john, A)).status, "not_found");
});

test("a caller with no profile is refused", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await code(db, cade, trip, A);
  await assert.rejects(join(db, randomUUID(), A));
});

test("only the server (service_role) can call the join-link functions", async () => {
  const db = await setup();
  for (const fn of ["golf_trip_join_code(uuid,uuid,text)", "reset_golf_trip_join_code(uuid,uuid,text)", "get_golf_trip_join_preview(uuid,text)", "join_golf_trip_by_code(uuid,text)"]) {
    for (const role of ["anon", "authenticated"]) {
      const r = await db.query<{ ok: boolean }>(`select has_function_privilege('${role}', '${fn}', 'execute') as ok`);
      assert.equal(r.rows[0].ok, false, `${role} must not execute ${fn}`);
    }
    const s = await db.query<{ ok: boolean }>(`select has_function_privilege('service_role', '${fn}', 'execute') as ok`);
    assert.equal(s.rows[0].ok, true);
  }
});
