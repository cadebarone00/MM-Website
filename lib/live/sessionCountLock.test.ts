import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("session count lock persists, permits blank locking, and rejects changes until separately unlocked", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table live_tournament_settings (season_year integer primary key, round_count integer);");
    const migration = readFileSync("supabase/session_count_lock.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("insert into live_tournament_settings values (2027, null, true), (2028, 8, false);");
    await assert.rejects(db.exec("update live_tournament_settings set round_count = 8 where season_year = 2027"), /Unlock the number/);
    await assert.rejects(db.exec("update live_tournament_settings set round_count = 8, round_count_locked = false where season_year = 2027"), /Unlock the number/);
    await db.exec("update live_tournament_settings set round_count_locked = false where season_year = 2027;");
    await db.exec("update live_tournament_settings set round_count = 8 where season_year = 2027;");
    await db.exec("update live_tournament_settings set round_count_locked = true where season_year = 2027;");
    await assert.rejects(db.exec("update live_tournament_settings set round_count = 9 where season_year = 2027"), /Unlock the number/);
    await db.exec("update live_tournament_settings set round_count = 9 where season_year = 2028;");
    const result = await db.query("select round_count, round_count_locked from live_tournament_settings where season_year = 2027");
    assert.deepEqual(result.rows, [{ round_count: 8, round_count_locked: true }]);
  } finally {
    await db.close();
  }
});
