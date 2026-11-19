import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { database, sqlFile } from "../platform/testDatabase.ts";
import { preferencesFromRow } from "./preferences.ts";

// --- Database: supabase/profile_preferences.sql ------------------------------------------------------------------

async function setup(): Promise<PGlite> {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "profile_v1.sql"]) await db.exec(sqlFile(file));
  for (let run = 0; run < 2; run++) await db.exec(sqlFile("profile_preferences.sql"));
  return db;
}
async function golfer(db: PGlite, username: string) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1)", [id]);
  await db.query("select create_my_profile($1, $2, $3)", [id, `${username}@example.com`, JSON.stringify({ displayName: username, username })]);
  return id;
}
const change = async (db: PGlite, who: string, body: object) => (await db.query<{ r: unknown }>("select set_my_preference($1, $2) as r", [who, JSON.stringify(body)])).rows[0].r;

test("one change at a time; the rest keep their values; the app reads the result with defaults filled in", async () => {
  const db = await setup();
  const me = await golfer(db, "samuel");
  await change(db, me, { notification: "chat", channel: "push", on: false });
  await change(db, me, { notification: "friendRequests", channel: "email", on: false });
  await change(db, me, { distance: "meters" });
  await change(db, me, { usualTees: "Blue" });
  const saved = await change(db, me, { scoreEntry: "full" });
  const prefs = preferencesFromRow(saved);
  assert.deepEqual(prefs.notifications.chat, { push: false, email: false }, "chat email stays at its default (off)");
  assert.deepEqual(prefs.notifications.friendRequests, { push: true, email: false });
  assert.deepEqual(prefs.notifications.tripInvites, { push: true, email: true }, "untouched types keep the defaults");
  assert.deepEqual([prefs.distance, prefs.usualTees, prefs.scoreEntry], ["meters", "Blue", "full"]);
  assert.equal((await change(db, me, { usualTees: "" }) as { usualTees: string }).usualTees, "", "tees can be cleared");
});

test("anything else is refused and nothing changes; closed accounts lose their preferences", async () => {
  const db = await setup();
  const me = await golfer(db, "samuel");
  await change(db, me, { distance: "meters" });
  for (const body of [{ notification: "spam", channel: "push", on: true }, { notification: "chat", channel: "sms", on: true }, { notification: "chat", channel: "push", on: "yes" },
    { distance: "feet" }, { usualTees: "Purple" }, { scoreEntry: "pro" }, {}]) {
    await assert.rejects(change(db, me, body), /know|Yards|tee|Simple|Nothing/, JSON.stringify(body));
  }
  assert.equal((await db.query<{ d: string }>("select distance_unit d from profile_preferences where profile_id = $1", [me])).rows[0].d, "meters");
  await assert.rejects(change(db, randomUUID(), { distance: "yards" }), /No account/);
  await db.query("update profiles set deleted_at = now() where id = $1", [me]);
  assert.equal((await db.query("select 1 from profile_preferences where profile_id = $1", [me])).rows.length, 0);
});
