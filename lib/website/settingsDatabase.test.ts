import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("website settings migration is repeatable and rejects direct visitor writes and test years", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);");
    const migration = readFileSync("supabase/website_section_settings.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec("insert into public.website_section_settings(section, season_year) values ('home', 2027)"), /permission denied/);
      await db.exec("reset role");
    }
    await assert.rejects(db.exec("insert into public.website_section_settings(section, season_year) values ('home', 2034)"), /check constraint/);
    await db.exec("insert into public.website_section_settings(section, season_year) values ('home', 2027), ('portal', 2028); update public.website_section_settings set season_year = null where section = 'home';");
    assert.deepEqual((await db.query("select section, season_year from public.website_section_settings order by section")).rows, [{ section: "home", season_year: null }, { section: "portal", season_year: 2028 }]);
  } finally { await db.close(); }
});
