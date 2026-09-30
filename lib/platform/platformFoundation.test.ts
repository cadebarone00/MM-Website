import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

// The production chain the platform migration sits on top of (same order as
// scripts/test-scoring-reliability.mjs, plus the files it reads from).
const CHAIN = [
  "schema.sql", "career_live_archive.sql", "course_library_location.sql", "course_library_tee_setups.sql",
  "archived_handicap_tees.sql", "live_match_publication.sql", "live_hole_submissions.sql", "hole_shot_directions.sql",
  "hole_shot_directions_penalty.sql", "round_format_setups.sql", "scoring_reliability.sql", "live_round_submission.sql",
  "player_slots_email.sql", "player_slots_full_name.sql", "tournament_timezone.sql",
];
const sql = (file: string) => readFileSync(`supabase/${file}`, "utf8");

async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
    create publication supabase_realtime;`);
  for (const file of CHAIN) await db.exec(sql(file));
  return db;
}

async function one<T>(db: PGlite, query: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(query, params)).rows[0];
}

test("platform foundation seeds The Maroon Tournament from existing data and is safe to re-run", async () => {
  const db = await freshDatabase();
  try {
    // Existing production-shaped data: a host, a live 2027 roster.
    const host = randomUUID();
    await db.query("insert into auth.users values ($1)", [host]);
    await db.query(`insert into profiles(id,email,display_name,username,is_host,player_slug) values($1,'host@test','Host','hostuser',true,'cade-barone')`, [host]);
    await db.exec(`update player_slots set full_name = 'Cade Barone', email = 'cade@test.com' where player_slug = 'cade-barone';
      insert into live_tournament_settings(season_year, venue_name, begin_date, end_date, timezone) values (2027, 'Silver Springs', '2027-01-06', '2027-01-09', 'America/Los_Angeles');
      insert into live_roster(season_year, player_slug, team) values (2027, 'cade-barone', 'white'), (2027, 'cam-latto', 'maroon');`);

    await db.exec(sql("platform_foundation.sql"));
    await db.exec(sql("platform_foundation.sql"));

    const counts = await one<Record<string, number>>(db, `select
      (select count(*)::int from organizations) as orgs,
      (select count(*)::int from tournaments) as tournaments,
      (select count(*)::int from tournament_editions) as editions,
      (select count(*)::int from edition_teams) as teams,
      (select count(*)::int from tournament_players) as players,
      (select count(*)::int from edition_roster) as roster,
      (select count(*)::int from edition_settings) as settings,
      (select count(*)::int from tournament_members) as members`);
    assert.deepEqual(counts, { orgs: 1, tournaments: 1, editions: 11, teams: 22, players: 13, roster: 2, settings: 11, members: 1 });

    const e2027 = await one<Record<string, unknown>>(db, "select label, destination, start_date::text, timezone, status, is_test, legacy_slug from tournament_editions where season_year = 2027");
    assert.deepEqual(e2027, { label: "2027", destination: "Silver Springs", start_date: "2027-01-06", timezone: "America/Los_Angeles", status: "scheduled", is_test: false, legacy_slug: "2027" });
    const e2026 = await one<Record<string, unknown>>(db, "select destination, status, legacy_slug from tournament_editions where season_year = 2026");
    assert.deepEqual(e2026, { destination: "Mission Hills CC", status: "completed", legacy_slug: "2026-palm-springs" });
    assert.equal((await one<{ is_test: boolean }>(db, "select is_test from tournament_editions where season_year = 2034")).is_test, true);

    const cade = await one<Record<string, unknown>>(db, "select display_name, email from tournament_players where legacy_player_slug = 'cade-barone'");
    assert.deepEqual(cade, { display_name: "Cade Barone", email: "cade@test.com" });
    const roster = (await db.query<{ legacy_player_slug: string; key: string }>(`select p.legacy_player_slug, t.key from edition_roster r
      join tournament_players p on p.id = r.tournament_player_id join edition_teams t on t.id = r.team_id order by 1`)).rows;
    assert.deepEqual(roster, [{ legacy_player_slug: "cade-barone", key: "white" }, { legacy_player_slug: "cam-latto", key: "maroon" }]);
    assert.equal((await one<{ role: string }>(db, "select role from tournament_members")).role, "owner");
    assert.equal((await one<{ platform_role: string | null }>(db, "select platform_role from profiles")).platform_role, null);

    // Existing tables are untouched.
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from live_roster")).n, 2);
  } finally {
    await db.close();
  }
});

test("the database itself refuses cross-tenant roster rows and blocks direct visitor access", async () => {
  const db = await freshDatabase();
  try {
    await db.exec(sql("platform_foundation.sql"));
    // A second, unrelated tournament: Texas Cup.
    const texas = await one<{ id: string }>(db, `insert into tournaments(organization_id, slug, name, short_name)
      select id, 'texas-cup', 'Texas Cup', 'Texas Cup' from organizations returning id`);
    const texasEdition = await one<{ id: string }>(db, "insert into tournament_editions(tournament_id, season_year, label) values ($1, 2027, '2027') returning id", [texas.id]);
    const blue = await one<{ id: string }>(db, "insert into edition_teams(edition_id, key, name, color) values ($1, 'blue', 'Blue Team', '#1f4e9c') returning id", [texasEdition.id]);
    const golfer = await one<{ id: string }>(db, "insert into tournament_players(tournament_id, display_name) values ($1, 'Golfer 1') returning id", [texas.id]);

    // Same season_year as The Maroon's 2027 edition — allowed, they are different tenants.
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from tournament_editions where season_year = 2027")).n, 2);

    // Valid: Texas player on Texas team in Texas edition.
    await db.query("insert into edition_roster(edition_id, tournament_id, tournament_player_id, team_id) values ($1, $2, $3, $4)", [texasEdition.id, texas.id, golfer.id, blue.id]);

    const maroon = await one<{ id: string; edition: string; team: string; player: string }>(db, `select t.id,
      (select id from tournament_editions where tournament_id = t.id and season_year = 2027) as edition,
      (select et.id from edition_teams et join tournament_editions e on e.id = et.edition_id where e.tournament_id = t.id and e.season_year = 2027 and et.key = 'maroon') as team,
      (select id from tournament_players where tournament_id = t.id and legacy_player_slug = 'cam-latto') as player
      from tournaments t where slug = 'the-maroon-tournament'`);

    // A Maroon player cannot be put on the Texas Cup roster...
    await assert.rejects(db.query("insert into edition_roster(edition_id, tournament_id, tournament_player_id) values ($1, $2, $3)", [texasEdition.id, texas.id, maroon.player]), /foreign key/);
    // ...even by lying about the tournament id.
    const golfer2 = await one<{ id: string }>(db, "insert into tournament_players(tournament_id, display_name) values ($1, 'Golfer 2') returning id", [texas.id]);
    await assert.rejects(db.query("insert into edition_roster(edition_id, tournament_id, tournament_player_id) values ($1, $2, $3)", [texasEdition.id, maroon.id, golfer2.id]), /foreign key/);
    // A Texas player cannot be put on a Maroon team.
    await assert.rejects(db.query("insert into edition_roster(edition_id, tournament_id, tournament_player_id, team_id) values ($1, $2, $3, $4)", [maroon.edition, maroon.id, maroon.player, blue.id]), /foreign key/);

    // Slugs are globally unique; bad values are rejected.
    await assert.rejects(db.exec("insert into tournaments(organization_id, slug, name, short_name) select id, 'texas-cup', 'Other', 'Other' from organizations"), /duplicate key/);
    await assert.rejects(db.exec("insert into tournaments(organization_id, slug, name, short_name) select id, 'Bad Slug', 'Other', 'Other' from organizations"), /check constraint/);
    await assert.rejects(db.query("insert into edition_teams(edition_id, key, name, color) values ($1, 'gold', 'Gold', 'gold')", [texasEdition.id]), /check constraint/);

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec("select * from tournaments"), /permission denied/);
      await assert.rejects(db.exec("insert into organizations(slug, name) values ('x-org', 'X')"), /permission denied/);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
