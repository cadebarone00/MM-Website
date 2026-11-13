import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { database, sqlFile } from "../platform/testDatabase.ts";

// --- Database: supabase/profile_edit_v2.sql (gender, profile links, closed-account scrub) ---------------------------

async function setup(): Promise<PGlite> {
  const db = await database();
  // Run twice: the file must be safe to run more than once.
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "profile_v1.sql", "profile_edit_v2.sql", "profile_edit_v2.sql"]) await db.exec(sqlFile(file));
  return db;
}
const one = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
async function golfer(db: PGlite, username: string) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1)", [id]);
  await one(db, "select create_my_profile($1, $2, $3) as r", [id, `${username}@example.com`, JSON.stringify({ displayName: username, username })]);
  return id;
}
const update = (db: PGlite, who: string, input: Record<string, unknown>) => one<Record<string, unknown>>(db, "select update_my_profile($1, $2) as r", [who, JSON.stringify(input)]);
const setLinks = (db: PGlite, who: string, links: unknown) => one<{ title: string; url: string }[]>(db, "select set_my_profile_links($1, $2) as r", [who, JSON.stringify(links)]);
const gender = async (db: PGlite, id: string) => (await db.query<{ gender: string | null }>("select gender from profiles where id = $1", [id])).rows[0].gender;

test("gender: saves, clears with empty, refuses anything else; other fields untouched", async () => {
  const db = await setup();
  const me = await golfer(db, "samuel");
  await update(db, me, { bio: "Hi" });
  assert.equal((await update(db, me, { gender: "man" })).gender, "man");
  assert.equal(await gender(db, me), "man");
  assert.equal((await update(db, me, { displayName: "Sam B" })).gender, "man", "leaving gender out keeps it");
  await assert.rejects(update(db, me, { gender: "robot" }), /Man, Woman or Prefer not to say/);
  assert.equal((await update(db, me, { gender: "" })).gender, null);
  const saved = (await db.query<Record<string, unknown>>("select display_name, bio from profiles where id = $1", [me])).rows[0];
  assert.deepEqual(saved, { display_name: "Sam B", bio: "Hi" });
  await assert.rejects(db.query("update profiles set gender = 'robot' where id = $1", [me]), /profiles_gender_choice/);
});

test("links: replace the whole list in order, max 5, https only, titles 1–40", async () => {
  const db = await setup();
  const me = await golfer(db, "samuel");
  const other = await golfer(db, "joey");
  await setLinks(db, other, [{ title: "Jo", url: "https://jo.example" }]);
  assert.deepEqual(await setLinks(db, me, [{ title: " Site ", url: "https://a.example" }, { title: "IG", url: "https://instagram.com/sam" }]),
    [{ title: "Site", url: "https://a.example" }, { title: "IG", url: "https://instagram.com/sam" }]);
  assert.deepEqual(await setLinks(db, me, [{ title: "Only", url: "https://b.example/x?y=1" }]), [{ title: "Only", url: "https://b.example/x?y=1" }], "replaces, not appends");
  const six = Array.from({ length: 6 }, (_, i) => ({ title: `L${i}`, url: `https://${i}.example` }));
  await assert.rejects(setLinks(db, me, six), /up to 5/);
  await assert.rejects(setLinks(db, me, [{ title: "Bad", url: "http://plain.example" }]), /https/);
  await assert.rejects(setLinks(db, me, [{ title: "Bad", url: "javascript:alert(1)" }]), /https/);
  await assert.rejects(setLinks(db, me, [{ title: "", url: "https://ok.example" }]), /title/);
  await assert.rejects(setLinks(db, me, [{ title: "x".repeat(41), url: "https://ok.example" }]), /title/);
  await assert.rejects(setLinks(db, me, { title: "not a list" }), /list/);
  assert.deepEqual(await setLinks(db, me, [{ title: "Only", url: "https://b.example/x?y=1" }]), [{ title: "Only", url: "https://b.example/x?y=1" }], "a refused save changed nothing");
  assert.deepEqual(await setLinks(db, me, []), []);
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from profile_links where profile_id = $1", [other])).rows[0].n, 1, "someone else's links untouched");
  await assert.rejects(setLinks(db, randomUUID(), []), /No account/);
});

test("closing an account removes its links and gender", async () => {
  const db = await setup();
  const me = await golfer(db, "samuel");
  await update(db, me, { gender: "woman" });
  await setLinks(db, me, [{ title: "Site", url: "https://a.example" }]);
  await db.query("update profiles set deleted_at = now() where id = $1", [me]);
  assert.equal(await gender(db, me), null);
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from profile_links where profile_id = $1", [me])).rows[0].n, 0);
  await assert.rejects(setLinks(db, me, [{ title: "Back", url: "https://a.example" }]), /No account/, "a closed account can't add links");
});
