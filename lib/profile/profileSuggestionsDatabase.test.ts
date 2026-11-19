import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { database, sqlFile } from "../platform/testDatabase.ts";

// --- Database: supabase/profile_suggestions.sql (Search page → Suggested for you) --------------------------------

async function setup(): Promise<PGlite> {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "profile_v1.sql", "profile_friends.sql"]) await db.exec(sqlFile(file));
  await db.exec("alter table public.profiles add column if not exists avatar_path text");  // profile_photos.sql needs Storage, which the test database lacks
  for (let run = 0; run < 2; run++) await db.exec(sqlFile("profile_suggestions.sql"));
  return db;
}
async function golfer(db: PGlite, username: string) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1)", [id]);
  await db.query("select create_my_profile($1, $2, $3)", [id, `${username}@example.com`, JSON.stringify({ displayName: username, username })]);
  return id;
}
const friends = (db: PGlite, a: string, b: string) => db.query("insert into profile_friend_requests (from_profile, to_profile, status) values ($1, $2, 'accepted')", [a, b]);
async function tripTogether(db: PGlite, ...people: string[]) {
  const trip = (await db.query<{ id: string }>("insert into golf_trips (name, destination, start_date, end_date, created_by, client_request_id) values ('Trip', 'Here', '2026-01-01', '2026-01-02', $1, gen_random_uuid()) returning id", [people[0]])).rows[0].id;
  for (const p of people) await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, invitation_status) values ($1, $2, 'x', 'accepted')", [trip, p]);
}
const suggest = async (db: PGlite, me: string, limit = 12) =>
  (await db.query<{ r: { id: string; username: string; mutuals: number }[] }>("select suggest_golfers($1, $2) as r", [me, limit])).rows[0].r;

test("friends of friends come first (most mutual friends first), random golfers fill up; never me, friends, requests or closed accounts", async () => {
  const db = await setup();
  const [me, ann, bob, cara, dan, eve, fred, gus] = await Promise.all(["meme", "annie", "bobby", "carla", "danny", "evelyn", "freddy", "gusgus"].map((u) => golfer(db, u)));
  await friends(db, me, ann);          // friend by request
  await tripTogether(db, me, bob);     // friend from a golf trip
  await friends(db, ann, cara); await friends(db, bob, cara);  // cara: 2 mutual friends
  await tripTogether(db, ann, dan);    // dan: 1 mutual friend (through a trip)
  await db.query("insert into profile_friend_requests (from_profile, to_profile, status) values ($1, $2, 'pending')", [me, eve]);  // already asked
  await db.query("update profiles set deleted_at = now() where id = $1", [fred]);  // closed
  const list = await suggest(db, me);
  assert.deepEqual(list.slice(0, 2).map((g) => [g.username, g.mutuals]), [["carla", 2], ["danny", 1]]);
  assert.deepEqual(list.slice(2).map((g) => [g.username, g.mutuals]), [["gusgus", 0]], "random fill: only gus is left");
  for (const id of [me, ann, bob, eve, fred]) assert.ok(!list.some((g) => g.id === id));
  assert.equal((await suggest(db, me, 1)).length, 1, "the limit is kept");
  void gus;
});

test("profile_friend_ids matches the app's friend rule: accepted requests and accepted trip mates only", async () => {
  const db = await setup();
  const [me, a, b, c] = await Promise.all(["meme", "aaron", "bella", "chris"].map((u) => golfer(db, u)));
  await friends(db, a, me);
  await tripTogether(db, me, b);
  const trip = (await db.query<{ id: string }>("insert into golf_trips (name, destination, start_date, end_date, created_by, client_request_id) values ('T2', 'Here', '2026-01-01', '2026-01-02', $1, gen_random_uuid()) returning id", [me])).rows[0].id;
  await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, invitation_status) values ($1, $2, 'x', 'accepted'), ($1, $3, 'x', 'pending')", [trip, me, c]);
  const ids = (await db.query<{ id: string }>("select profile_friend_ids($1) as id", [me])).rows.map((r) => r.id).sort();
  assert.deepEqual(ids, [a, b].sort(), "a pending trip invite isn't a friend");
});
