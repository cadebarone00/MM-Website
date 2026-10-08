import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "./golfTripCreate.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/golf_trip_invitations.sql -------------------------------------------
// profile → golf_trip_members → golf_trip. An invitation is a member row with profile_id = NULL until the invited
// person (signed in, holding the invite link's secret) claims it with their own profile.

const TRIP_DRAFT = {
  requestId: "", tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "8", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no",
};
type Member = { id: string; profileId: string | null; displayName: string; email: string | null; role: string; invitationStatus: string };

async function setup(): Promise<PGlite> {
  const db = await database();
  await db.exec(sqlFile("golf_trips.sql"));
  await db.exec(sqlFile("golf_trip_invitations.sql"));
  await db.exec(sqlFile("golf_trip_invitations.sql")); // safe to run twice
  return db;
}
async function makeTrip(db: PGlite, who: string) {
  const p = golfTripPayloadFromBody({ ...TRIP_DRAFT, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  return (await db.query<{ r: { tripId: string } }>("select create_golf_trip($1, $2) as r", [who, JSON.stringify(p.payload)])).rows[0].r.tripId;
}
const one = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
const invite = (db: PGlite, who: string, trip: string, token: string, input: Record<string, unknown> = { displayName: "John Smith", email: "john@email.com" }) =>
  one<{ memberId: string } | null>(db, "select invite_golf_trip_member($1, $2, $3, $4) as r", [who, trip, JSON.stringify(input), token]);
const accept = (db: PGlite, who: string, token: string) =>
  one<{ status: string; tripId?: string }>(db, "select accept_golf_trip_invitation($1, $2) as r", [who, token]);
const preview = (db: PGlite, who: string, token: string) => one<Record<string, unknown> | null>(db, "select get_golf_trip_invitation($1, $2) as r", [who, token]);
const members = async (db: PGlite, who: string, trip: string) =>
  (await one<{ members: Member[] } | null>(db, "select get_golf_trip($1, $2) as r", [who, trip]))?.members ?? null;
const myTrips = async (db: PGlite, who: string) => one<{ id: string }[]>(db, "select list_my_golf_trips($1) as r", [who]);
const rows = async (db: PGlite, trip: string) => (await db.query<{ n: number }>("select count(*)::int n from golf_trip_members where golf_trip_id = $1", [trip])).rows[0].n;
const refused = (promise: Promise<unknown>) => assert.rejects(promise);
const TOKEN = "invite-secret-0123456789abcdefghijklmn";

test("an invite before signup is a member row with no profile — valid, and not yet on the trip", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  const made = await invite(db, cade, trip, TOKEN);
  assert.ok(made?.memberId);
  const john = (await members(db, cade, trip))!.find((m) => m.displayName === "John Smith")!;
  assert.deepEqual([john.profileId, john.role, john.invitationStatus, john.email], [null, "member", "pending", "john@email.com"]);
  // The invite page shows the trip but never the invited email.
  const shown = await preview(db, null as unknown as string, TOKEN);
  assert.equal(shown?.tripName, "Pinehurst");
  assert.equal(shown?.invitedName, "John Smith");
  assert.equal(shown?.status, "open");
  assert.equal(JSON.stringify(shown).includes("john@email.com"), false);
  assert.equal(await preview(db, cade, "wrong-token-0123456789abcdefghijklmn"), null);
});

test("the invited person signs up and claims the same row — no second membership; the trip is in their list", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await invite(db, cade, trip, TOKEN);
  const john = await profile(db, "john"); // signed up later, with any email
  assert.equal(await members(db, john, trip), null, "not on the trip before accepting");
  assert.deepEqual(await accept(db, john, TOKEN), { status: "accepted", tripId: trip });
  assert.equal(await rows(db, trip), 2, "still just the organizer + John's original row");
  const row = (await members(db, john, trip))!.find((m) => m.profileId === john)!;
  assert.deepEqual([row.displayName, row.invitationStatus], ["John Smith", "accepted"]);
  assert.deepEqual((await myTrips(db, john)).map((t) => t.id), [trip]);
  assert.equal((await preview(db, john, TOKEN))?.status, "yours");
});

test("accepting again is safe; nobody else can take a claimed invitation", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await invite(db, cade, trip, TOKEN);
  const [john, mike] = [await profile(db, "john"), await profile(db, "mike")];
  await accept(db, john, TOKEN);
  assert.deepEqual(await accept(db, john, TOKEN), { status: "already_member", tripId: trip });
  assert.deepEqual(await accept(db, mike, TOKEN), { status: "claimed" });
  assert.equal((await preview(db, mike, TOKEN))?.status, "claimed");
  assert.equal(await members(db, mike, trip), null);
  // Even a direct write can't move a claimed row to another profile.
  await refused(db.query("update golf_trip_members set profile_id = $1 where profile_id = $2", [mike, john]));
  assert.equal(await rows(db, trip), 2);
});

test("one profile can't be on a trip twice, even through a second invitation", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await invite(db, cade, trip, TOKEN);
  await invite(db, cade, trip, "second-secret-0123456789abcdefghijklm", { displayName: "Johnny", email: "johnny@email.com" });
  const john = await profile(db, "john");
  await accept(db, john, TOKEN);
  assert.deepEqual(await accept(db, john, "second-secret-0123456789abcdefghijklm"), { status: "already_member", tripId: trip });
  assert.equal((await members(db, john, trip))!.filter((m) => m.profileId === john).length, 1);
  // The organizer is already on their own trip: their own invite link just says so.
  assert.deepEqual(await accept(db, cade, "second-secret-0123456789abcdefghijklm"), { status: "already_member", tripId: trip });
  await refused(db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name) values ($1, $2, 'Dup')", [trip, john]));
});

test("only the organizer invites; bad invites are refused", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await invite(db, cade, trip, TOKEN);
  const john = await profile(db, "john");
  await accept(db, john, TOKEN);
  assert.equal(await invite(db, john, trip, "member-secret-0123456789abcdefghijklm"), null, "a member can't invite");
  assert.equal(await invite(db, await profile(db, "stranger"), trip, "stranger-secret-0123456789abcdefghijk"), null);
  await refused(invite(db, cade, trip, "blank-secret-0123456789abcdefghijklmn", { displayName: "  ", email: "" }));
  await refused(invite(db, cade, trip, "dup-email-secret-0123456789abcdefghijk", { displayName: "Johnny", email: "JOHN@email.com" }));
  await refused(invite(db, cade, trip, "short"));
  await refused(invite(db, cade, trip, TOKEN, { displayName: "Reused token", email: "" }));
});

test("the organizer is a profile on the trip: one organizer row, created with the trip, can't be removed or leave", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  const organizer = (await members(db, cade, trip))!.filter((m) => m.role === "organizer");
  assert.deepEqual(organizer.map((m) => [m.profileId, m.invitationStatus]), [[cade, "accepted"]]);
  await refused(db.query("insert into golf_trip_members (golf_trip_id, display_name, role) values ($1, 'Co-host', 'organizer')", [trip]));
  assert.equal(await one(db, "select remove_golf_trip_member($1, $2, $3) as r", [cade, trip, organizer[0].id]), false);
  assert.equal(await one(db, "select leave_golf_trip($1, $2) as r", [cade, trip]), false);
  assert.equal(await rows(db, trip), 1);
});

test("removing, leaving and deleting leave no orphaned or duplicate memberships", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  const pending = await invite(db, cade, trip, TOKEN);
  // Cancel an invite: the link stops working.
  assert.equal(await one(db, "select remove_golf_trip_member($1, $2, $3) as r", [cade, trip, pending!.memberId]), true);
  assert.equal(await preview(db, cade, TOKEN), null);
  assert.deepEqual(await accept(db, await profile(db, "late"), TOKEN), { status: "not_found" });
  // Remove a member who had joined.
  const john = await profile(db, "john");
  const second = await invite(db, cade, trip, "john-secret-0123456789abcdefghijklmno");
  await accept(db, john, "john-secret-0123456789abcdefghijklmno");
  assert.equal(await one(db, "select remove_golf_trip_member($1, $2, $3) as r", [john, trip, second!.memberId]), false, "members can't remove others");
  assert.equal(await one(db, "select remove_golf_trip_member($1, $2, $3) as r", [cade, trip, second!.memberId]), true);
  assert.deepEqual(await myTrips(db, john), []);
  // A member leaves on their own.
  const mike = await profile(db, "mike");
  await invite(db, cade, trip, "mike-secret-0123456789abcdefghijklmno", { displayName: "Mike", email: "" });
  await accept(db, mike, "mike-secret-0123456789abcdefghijklmno");
  assert.equal(await one(db, "select leave_golf_trip($1, $2) as r", [mike, trip]), true);
  assert.equal(await one(db, "select leave_golf_trip($1, $2) as r", [mike, trip]), false, "leaving twice does nothing");
  assert.equal(await rows(db, trip), 1);
  // A deleted account leaves its trip row behind as a name only (history), never a second row.
  const pete = await profile(db, "pete");
  await invite(db, cade, trip, "pete-secret-0123456789abcdefghijklmno", { displayName: "Pete", email: "" });
  await accept(db, pete, "pete-secret-0123456789abcdefghijklmno");
  await db.query("delete from profiles where id = $1", [pete]);
  assert.deepEqual((await members(db, cade, trip))!.filter((m) => m.displayName === "Pete").map((m) => m.profileId), [null]);
  // Deleting the trip removes every membership with it.
  assert.equal(await one(db, "select delete_golf_trip($1, $2) as r", [cade, trip]), true);
  assert.equal(await rows(db, trip), 0);
});

// --- Decline, new link, privacy -------------------------------------------------------------
const decline = (db: PGlite, who: string, token: string) => one<{ status: string }>(db, "select decline_golf_trip_invitation($1, $2) as r", [who, token]);
const newLink = (db: PGlite, who: string, trip: string, member: string, token: string) =>
  one<boolean>(db, "select regenerate_golf_trip_invite($1, $2, $3, $4) as r", [who, trip, member, token]);

test("declining keeps the row as history, attaches no profile, and the link stops working", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await invite(db, cade, trip, TOKEN);
  const john = await profile(db, "john");
  assert.deepEqual(await decline(db, john, TOKEN), { status: "declined" });
  const row = (await members(db, cade, trip))!.find((m) => m.displayName === "John Smith")!;
  assert.deepEqual([row.profileId, row.invitationStatus], [null, "declined"]);
  assert.equal(await preview(db, john, TOKEN), null);
  assert.deepEqual(await accept(db, john, TOKEN), { status: "not_found" }, "a declined link can't be accepted later");
  assert.deepEqual(await decline(db, john, TOKEN), { status: "not_found" });
  assert.equal(await members(db, john, trip), null);
  // You can't decline a trip you're already in.
  await invite(db, cade, trip, "mike-secret-0123456789abcdefghijklmno", { displayName: "Mike", email: "" });
  const mike = await profile(db, "mike");
  await accept(db, mike, "mike-secret-0123456789abcdefghijklmno");
  assert.deepEqual(await decline(db, mike, "mike-secret-0123456789abcdefghijklmno"), { status: "already_member" });
});

test("a new invite link replaces the old one on the same row; only the organizer, only for unaccepted invites", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  const made = await invite(db, cade, trip, TOKEN);
  const fresh = "fresh-secret-0123456789abcdefghijklmno";
  assert.equal(await newLink(db, cade, trip, made!.memberId, fresh), true);
  assert.equal(await preview(db, cade, TOKEN), null, "old link stops working at once");
  assert.equal(await rows(db, trip), 2, "same row, no duplicate");
  const john = await profile(db, "john");
  assert.equal((await preview(db, john, fresh))?.invitedName, "John Smith");
  // A declined invite can be re-opened with a new link.
  await decline(db, john, fresh);
  const again = "again-secret-0123456789abcdefghijklmno";
  assert.equal(await newLink(db, cade, trip, made!.memberId, again), true);
  assert.deepEqual(await accept(db, john, again), { status: "accepted", tripId: trip });
  // Accepted memberships, the organizer row, members and strangers can't make links.
  assert.equal(await newLink(db, cade, trip, made!.memberId, "late-secret-0123456789abcdefghijklmnop"), false);
  const organizerRow = (await members(db, cade, trip))!.find((m) => m.role === "organizer")!;
  assert.equal(await newLink(db, cade, trip, organizerRow.id, "own-secret-0123456789abcdefghijklmnopq"), false);
  const pending = await invite(db, cade, trip, "pete-secret-0123456789abcdefghijklmno", { displayName: "Pete", email: "" });
  assert.equal(await newLink(db, john, trip, pending!.memberId, "john-try-secret-0123456789abcdefghijk"), false);
  assert.equal(await newLink(db, await profile(db, "stranger"), trip, pending!.memberId, "stranger-try-0123456789abcdefghijklm"), false);
  await refused(newLink(db, cade, trip, pending!.memberId, "short"));
});

test("only accepted members count as players; members can't read the members table directly", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const trip = await makeTrip(db, cade);
  await invite(db, cade, trip, TOKEN);
  await invite(db, cade, trip, "pete-secret-0123456789abcdefghijklmno", { displayName: "Pete", email: "" });
  const count = async () => (await myTrips(db, cade) as unknown as { memberCount: number }[])[0].memberCount;
  assert.equal(await count(), 1, "pending invites aren't players yet");
  await accept(db, await profile(db, "john"), TOKEN);
  assert.equal(await count(), 2);
  await db.exec("set role authenticated");
  await refused(db.query("select email from golf_trip_members"));
  await db.exec("reset role");
});
