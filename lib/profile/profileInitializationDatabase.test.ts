import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../platform/golfTripCreate.ts";
import { database, profile, sqlFile } from "../platform/testDatabase.ts";

// --- Database: supabase/profile_initialization.sql (Accounts V2, Step 2d) ----------------------------------------------

const CHAIN = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql",
  "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql", "golf_trip_scoring_submission.sql", "player_rounds.sql",
  "golf_trip_scoring_corrections.sql", "shared_rounds.sql", "profile_v1.sql", "profile_initialization.sql"];

async function setup(): Promise<PGlite> {
  const db = await database();
  // The real auth.users columns initialization reads (the shared stub only has id).
  await db.exec("alter table auth.users add column email text, add column confirmed_at timestamptz;");
  for (const file of CHAIN) await db.exec(sqlFile(file));
  return db;
}
type Json = Record<string, unknown>;
const one = async <T = Json>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;
const account = async (db: PGlite, verified: boolean, email = `${randomUUID()}@test`) => {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email, confirmed_at) values ($1, $2, $3)", [id, email, verified ? new Date().toISOString() : null]);
  return id;
};
const initialize = (db: PGlite, id: string) => one(db, "select initialize_my_profile($1) as r", [id]);
const complete = (db: PGlite, id: string, input: Json) => one(db, "select complete_my_profile($1, $2) as r", [id, JSON.stringify(input)]);
const row = async (db: PGlite, id: string) => (await db.query<Json>("select username, display_name, email, player_slug from profiles where id = $1", [id])).rows[0];
const slot = async (db: PGlite, slug: string) => (await db.query<{ claimed_by: string | null }>("select claimed_by from player_slots where player_slug = $1", [slug])).rows[0];
const freeSlug = async (db: PGlite) => (await db.query<{ s: string }>("select player_slug s from player_slots where claimed_by is null order by player_slug limit 1")).rows[0].s;

test("initialization refuses unknown and unverified accounts and creates nothing for them", async () => {
  const db = await setup();
  await assert.rejects(initialize(db, randomUUID()), /No account/);
  const pending = await account(db, false);
  await assert.rejects(initialize(db, pending), /Verify your email first/);
  assert.equal(await row(db, pending), undefined, "an unverified account never gets a profile");
});

test("a verified account gets exactly one INCOMPLETE profile, however many times (or at once) it is initialized", async () => {
  const db = await setup();
  const id = await account(db, true, "fresh@test");
  const results = await Promise.all([initialize(db, id), initialize(db, id), initialize(db, id)]);
  assert.equal(results.filter((r) => r.created).length, 1, "created once");
  assert.ok(results.every((r) => r.complete === false));
  assert.deepEqual(await row(db, id), { username: null, display_name: null, email: "fresh@test", player_slug: null }, "no invented username or name");
  assert.equal((await one<number>(db, "select count(*)::int as r from profiles where id = $1", [id])), 1);
  assert.equal(await one(db, "select profile_id_for_username('golfer') as r"), null, "an incomplete profile has no public handle");
});

test("V1 profiles are never changed by initialization", async () => {
  const db = await setup();
  const v1 = await profile(db, "veteran"); // complete, as every V1 profile is
  await db.query("update auth.users set email = 'veteran@test', confirmed_at = now() where id = $1", [v1]);
  const before = await row(db, v1);
  assert.deepEqual(await initialize(db, v1), { created: false, complete: true, claimedPlayer: null });
  assert.deepEqual(await row(db, v1), before);
});

test("finish setup: validates, refuses taken usernames, completes once, then never overwrites", async () => {
  const db = await setup();
  await profile(db, "taken");
  const id = await account(db, true);
  await assert.rejects(complete(db, id, { displayName: "Sam", username: "sam" }), /Set up your profile first/, "no profile row yet");
  await initialize(db, id);
  await assert.rejects(complete(db, id, { displayName: "", username: "sam_ok" }), /name/);
  await assert.rejects(complete(db, id, { displayName: "Sam", username: "x" }), /Usernames are/);
  await assert.rejects(complete(db, id, { displayName: "Sam", username: "TAKEN" }), /taken/, "unique ignoring case");
  assert.deepEqual(await complete(db, id, { displayName: " Sam Fresh ", username: "samfresh" }),
    { complete: true, changed: true, username: "samfresh", displayName: "Sam Fresh" });
  assert.deepEqual(await complete(db, id, { displayName: "Someone Else", username: "other" }),
    { complete: true, changed: false, username: "samfresh", displayName: "Sam Fresh" });
  assert.equal(await one(db, "select profile_is_complete($1) as r", [id]), true);
});

test("old player claims: only an admin invitation bound to the verified account completes one; a code or email alone never does", async () => {
  const db = await setup();
  const host = await profile(db, "commish", { host: true });
  const notHost = await profile(db, "regular");
  const slug = await freeSlug(db);
  const invited = await account(db, false, "player@test");
  await assert.rejects(one(db, "select create_player_claim_invitation($1, $2, $3) as r", [notHost, slug, invited]), /Not authorized/);
  assert.deepEqual(await one(db, "select create_player_claim_invitation($1, $2, $3, $4) as r", [host, slug, invited, "Real Player"]), { playerSlug: slug, pending: true });
  assert.equal((await slot(db, slug)).claimed_by, null, "inviting claims nothing yet");

  // Someone else (another verified account, even with the same email text) initializes: no claim.
  const stranger = await account(db, true, "PLAYER@test");
  assert.equal((await initialize(db, stranger)).claimedPlayer, null);
  // The invited account can't initialize until it verifies, so the claim can't complete early.
  await assert.rejects(initialize(db, invited), /Verify your email first/);
  assert.equal((await slot(db, slug)).claimed_by, null);

  await db.query("update auth.users set confirmed_at = now() where id = $1", [invited]);
  const result = await initialize(db, invited);
  assert.equal(result.claimedPlayer, slug);
  assert.equal((await slot(db, slug)).claimed_by, invited);
  const claimedRow = await row(db, invited);
  assert.equal(claimedRow.player_slug, slug);
  assert.equal(claimedRow.username, null, "the code is never turned into a username");
  assert.equal(claimedRow.display_name, "Real Player", "the admin's name for the player prefills the display name");
  assert.equal(await one(db, "select count(*)::int as r from player_claim_invitations"), 0, "the invitation is used up");
  assert.deepEqual(await initialize(db, invited), { created: false, complete: false, claimedPlayer: null }, "repeating does nothing");
  await assert.rejects(one(db, "select create_player_claim_invitation($1, $2, $3) as r", [host, slug, stranger]), /Already claimed/);
});

test("existing V1 claims stay exactly as they are", async () => {
  const db = await setup();
  const v1 = await profile(db, "oldplayer");
  const slug = await freeSlug(db);
  await db.query("update player_slots set claimed_by = $1 where player_slug = $2", [v1, slug]);
  await db.query("update profiles set player_slug = $2 where id = $1", [v1, slug]);
  await db.query("update auth.users set confirmed_at = now(), email = 'old@test' where id = $1", [v1]);
  await initialize(db, v1);
  assert.equal((await slot(db, slug)).claimed_by, v1);
  assert.equal((await row(db, v1)).player_slug, slug);
});

test("scoring, saved rounds and shared rounds need a finished profile", async () => {
  const db = await setup();
  const done = await profile(db, "finished");
  const half = await account(db, true);
  await initialize(db, half);
  const group = await one<string>(db, "insert into scoring_groups (source, group_number, created_by) values ('personal', 1, $1) returning id as r", [done]);
  await db.query("insert into scoring_group_players (group_id, profile_id, play_order) values ($1, $2, 1)", [group, done]);
  await assert.rejects(db.query("insert into scoring_group_players (group_id, profile_id, play_order) values ($1, $2, 2)", [group, half]), /Finish setting up your profile/);
  const round = await one<string>(db, "insert into shared_rounds (host, setup) values ($1, '{}') returning id as r", [done]);
  await assert.rejects(db.query("insert into shared_round_players (round_id, profile_id, position) values ($1, $2, 1)", [round, half]), /Finish setting up your profile/);
  await assert.rejects(db.query(`insert into player_rounds (profile_id, source, source_key, date_played, course_name, holes_played, format, total, counts_for_handicap, entered_by)
    values ($1, 'personal', 'k', current_date, 'Course', 18, 'Stroke Play', 80, false, 'player')`, [half]), /Finish setting up your profile/);
  await complete(db, half, { displayName: "Half Way", username: "halfway" });
  await db.query("insert into scoring_group_players (group_id, profile_id, play_order) values ($1, $2, 2)", [group, half]);
});

test("an incomplete profile can accept a golf trip invitation", async () => {
  const db = await setup();
  const organizer = await profile(db, "organizer");
  const draft = { requestId: randomUUID(), tripName: "Spring Trip", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
    playerCount: "8", yourName: "Org", yourEmail: "org@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
    includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no" };
  const parsed = golfTripPayloadFromBody(draft) as { ok: true; payload: CreateGolfTripPayload };
  const tripId = (await one<{ tripId: string }>(db, "select create_golf_trip($1, $2) as r", [organizer, JSON.stringify(parsed.payload)])).tripId;
  await one(db, "select invite_golf_trip_member($1, $2, $3, $4) as r", [organizer, tripId, JSON.stringify({ displayName: "New Person", email: "new@example.com" }), "a-long-enough-test-invite-secret-0001"]);
  const half = await account(db, true, "new@example.com");
  await initialize(db, half);
  const accepted = await one<Json>(db, "select accept_golf_trip_invitation($1, $2) as r", [half, "a-long-enough-test-invite-secret-0001"]);
  assert.equal(accepted.status, "accepted");
});

test("every new function is server-only (no browser role can call it)", async () => {
  const db = await setup();
  for (const fn of ["initialize_my_profile(uuid)", "complete_my_profile(uuid, jsonb)", "create_player_claim_invitation(uuid, text, uuid, text)", "profile_is_complete(uuid)"]) {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await one(db, "select has_function_privilege($1, $2, 'execute') as r", [role, `public.${fn}`]), false, `${role} must not call ${fn}`);
    }
  }
  assert.equal(await one(db, "select has_table_privilege('authenticated', 'public.player_claim_invitations', 'select') as r"), false);
});
