import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/profile_identity.sql ------------------------------------------------
// profiles.id is the permanent profile_id (one login account → one profile). The legacy Maroon player mapping and
// tournament players may point at a profile at most once.

async function setup(): Promise<PGlite> {
  const db = await database();
  await db.exec(sqlFile("profile_identity.sql"));
  await db.exec(sqlFile("profile_identity.sql")); // safe to run twice
  return db;
}
const refused = (promise: Promise<unknown>) => assert.rejects(promise);
const tournamentId = async (db: PGlite) => (await db.query<{ id: string }>("select id from tournaments where slug = 'the-maroon-tournament'")).rows[0].id;

test("one login account can only ever have one profile", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  await refused(db.query("insert into profiles(id,email,display_name,username) values ($1,'again@test','Again','again')", [cade]));
  // A profile needs a real login account behind it.
  await refused(db.query("insert into profiles(id,email,display_name,username) values ($1,'ghost@test','Ghost','ghost')", [randomUUID()]));
});

test("a Maroon player slot maps to at most one profile, and a profile to at most one slot", async () => {
  const db = await setup();
  const [cade, jake] = [await profile(db, "cade"), await profile(db, "jake")];
  await db.query("update profiles set player_slug = 'cade-barone' where id = $1", [cade]);
  await refused(db.query("update profiles set player_slug = 'cade-barone' where id = $1", [jake]));
  await db.query("update player_slots set claimed_by = $1 where player_slug = 'cade-barone'", [cade]);
  await refused(db.query("update player_slots set claimed_by = $1 where player_slug = 'cam-latto'", [cade]));
});

test("a profile is at most one player in a tournament; unlinked players are fine", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const tournament = await tournamentId(db);
  await db.query("insert into tournament_players(tournament_id, display_name, profile_id) values ($1,'Cade',$2)", [tournament, cade]);
  await refused(db.query("insert into tournament_players(tournament_id, display_name, profile_id) values ($1,'Cade again',$2)", [tournament, cade]));
  await db.query("insert into tournament_players(tournament_id, display_name) values ($1,'Guest one'), ($1,'Guest two')", [tournament]);
});

test("existing duplicates stop the migration with a clear message and change nothing", async () => {
  const db = await database();
  await db.exec("drop index if exists profiles_player_slug_key"); // a database from before this file was run
  const [cade, jake] = [await profile(db, "cade"), await profile(db, "jake")];
  await db.query("update profiles set player_slug = 'cade-barone' where id in ($1, $2)", [cade, jake]);
  await assert.rejects(db.exec(sqlFile("profile_identity.sql")), /more than one profile/);
  await db.exec("rollback"); // the SQL Editor rolls the failed run back the same way
  const indexes = await db.query("select 1 from pg_indexes where indexname = 'profiles_player_slug_key'");
  assert.equal(indexes.rows.length, 0);
});
