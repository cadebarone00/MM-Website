import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

// Every production SQL file, in an order that applies cleanly (matches
// scripts/test-scoring-reliability.mjs for the files it shares).
const CHAIN = [
  "schema.sql", "career_live_archive.sql", "course_library_location.sql", "course_library_tee_setups.sql",
  "archived_handicap_tees.sql", "live_match_publication.sql", "live_hole_submissions.sql", "hole_shot_directions.sql",
  "hole_shot_directions_penalty.sql", "round_format_setups.sql", "scoring_reliability.sql", "live_round_submission.sql",
  "broadcast_countdown.sql", "broadcast_player_video.sql", "hole_in_one_future.sql", "low_individual_future.sql",
  "player_birdies_future.sql", "player_doubles_future.sql", "player_slots_email.sql", "player_slots_full_name.sql",
  "player_slots_password_created.sql", "refund_unsettleable_mm_coin_bets.sql", "season_calendar.sql",
  "session_count_lock.sql", "session_tee_times.sql", "team_winner_future.sql", "total_birdies_future.sql",
  "tournament_timezone.sql", "website_section_settings.sql", "team_winner_auto_pricing.sql", "platform_foundation.sql",
];
const sql = (file: string) => readFileSync(`supabase/${file}`, "utf8");
const HOST = randomUUID();
const OTHER = randomUUID();

async function one<T>(db: PGlite, query: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(query, params)).rows[0];
}

/** Production-shaped database with a real, closed-out 2027 match on it. */
async function databaseWithLiveActivity(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key, encrypted_password text);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
    create publication supabase_realtime;`);
  for (const file of CHAIN) await db.exec(sql(file));

  const course = randomUUID();
  const box = randomUUID();
  const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yards: 400 }));
  await db.query("insert into auth.users(id) values ($1), ($2)", [HOST, OTHER]);
  await db.query(`insert into profiles(id,email,display_name,username,is_host,player_slug) values
    ($1,'host@test','Host','host',true,'cade-barone'), ($2,'other@test','Other','other',false,'cam-latto')`, [HOST, OTHER]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [HOST]);
  await db.query("insert into live_courses(id,name,holes) values($1,'Test course',$2)", [course, JSON.stringify(holes)]);
  await db.exec(`insert into live_tournament_settings(season_year, round_count, venue_name) values (2027, 8, 'Mission Hills CC');
    insert into live_roster(season_year, player_slug, team) values (2027,'cam-latto','maroon'), (2027,'cade-barone','white');
    insert into website_section_settings(section, season_year) values ('home', 2027), ('leaderboard', null);`);
  await db.query(`insert into live_round_state(season_year,round,date,format,course_id,course_locked,matchups_locked,course_setup)
    values(2027,1,'2027-01-06','Singles',$1,true,true,$2)`, [course, JSON.stringify({ holes })]);
  await db.query(`insert into live_match_boxes(id,season_year,round,box_number,format,tee_time,maroon_players,white_players,state)
    values($1,2027,1,1,'Singles','2027-01-06','{cam-latto}','{cade-barone}','Live')`, [box]);
  await db.query(`insert into career_archive_rounds(season_year,round,player_slug,course,format,match_box_id,holes)
    values(2027,1,'cade-barone','Test course','Singles',$1,$2),(2027,1,'cam-latto','Test course','Singles',$1,$2)`, [box, JSON.stringify(holes)]);
  await db.exec("select start_live_round_atomic(2027,1)");
  const payload = { ownScore: 4, opponentScore: 5, putts: 2, fairway: "hit", green: "hit" };
  for (let hole = 1; hole <= 10; hole++) {
    await submitHole(db, box, "cade-barone", HOST, hole, payload);
    await submitHole(db, box, "cam-latto", OTHER, hole, { ...payload, ownScore: 5, opponentScore: 4 });
  }
  await db.query("insert into wagers_accounts(profile_id, mm_coins_balance) values ($1, 900)", [HOST]);
  await db.query(`insert into mm_coin_bets(profile_id,market_key,selection_key,selection_label,odds,stake,potential_payout)
    values($1,$2,'white','White',100,100,200)`, [HOST, `live-match:${box}`]);
  await db.query("select close_live_match_atomic($1)", [box]);
  return db;
}

function submitHole(db: PGlite, box: string, player: string, actor: string, hole: number, entry: object) {
  return db.query("select submit_live_hole_reliable(2027,1,$1,$2,$3,$4,$5,$6,null)", [hole, player, actor, JSON.stringify(entry), randomUUID(), box]);
}

/** Every row of every public table, ignoring only the new edition_id column. */
async function snapshot(db: PGlite): Promise<Record<string, unknown>> {
  const tables = (await db.query<{ t: string }>(`select table_name t from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).rows.map((r) => r.t);
  const out: Record<string, unknown> = {};
  for (const table of tables) {
    out[table] = (await one<{ rows: unknown }>(db, `select coalesce(jsonb_agg(x order by x::text), '[]') as rows
      from (select to_jsonb(t) - 'edition_id' as x from public."${table}" t) s`)).rows;
  }
  out.__triggers = (await db.query(`select tgrelid::regclass::text as t, tgname, tgenabled from pg_trigger
    where not tgisinternal and tgname <> 'set_edition_id' order by 1, 2`)).rows;
  return out;
}

async function tablesWithSeasonYear(db: PGlite): Promise<string[]> {
  return (await db.query<{ t: string }>(`select c.table_name t from information_schema.columns c
    join information_schema.tables x using (table_schema, table_name)
    where c.table_schema = 'public' and x.table_type = 'BASE TABLE' and c.column_name = 'season_year'
      and c.table_name <> 'tournament_editions' order by 1`)).rows.map((r) => r.t);
}

test("C2 changes no existing data, fires no existing trigger, and tags every year-keyed row with its edition", async () => {
  const db = await databaseWithLiveActivity();
  try {
    const before = await snapshot(db);
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from career_archive_live_holes")).n, 20);
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from wagers_market_settlements")).n, 1);

    await db.exec(sql("platform_editions.sql"));
    assert.deepEqual(await snapshot(db), before, "every existing row and trigger state must be unchanged");

    // Every year-keyed table got the column, and every row points at the
    // legacy tournament's edition for that same year.
    const tables = await tablesWithSeasonYear(db);
    assert.equal(tables.length, 30);
    for (const table of tables) {
      const bad = await one<{ n: number }>(db, `select count(*)::int as n from public."${table}" r
        left join tournament_editions e on e.id = r.edition_id
        left join tournaments t on t.id = e.tournament_id
        where r.season_year is not null and (e.id is null or e.season_year <> r.season_year or not t.is_legacy)`);
      assert.equal(bad.n, 0, `${table} has rows without the right edition`);
    }

    await db.exec(sql("platform_editions.sql"));
    assert.deepEqual(await snapshot(db), before, "re-running changes nothing");
  } finally {
    await db.close();
  }
});

test("after C2, existing scoring code keeps working and its new rows are tagged automatically", async () => {
  const db = await databaseWithLiveActivity();
  try {
    await db.exec(sql("platform_editions.sql"));
    const edition2027 = (await one<{ id: string }>(db, "select id from tournament_editions where season_year = 2027")).id;

    // A brand-new round written exactly the way existing code writes it (season_year only).
    const box = randomUUID();
    await db.query(`insert into live_round_state(season_year,round,date,format,course_id,course_locked,matchups_locked,course_setup)
      select 2027,2,'2027-01-06','Singles',course_id,true,true,course_setup from live_round_state where round = 1`);
    await db.query(`insert into live_match_boxes(id,season_year,round,box_number,format,tee_time,maroon_players,white_players,state)
      values($1,2027,2,1,'Singles','2027-01-06','{cam-latto}','{cade-barone}','Live')`, [box]);
    await db.query(`insert into career_archive_rounds(season_year,round,player_slug,course,format,match_box_id,holes)
      select 2027,2,player_slug,course,format,$1,holes from career_archive_rounds where round = 1`, [box]);
    await db.exec("select start_live_round_atomic(2027,2)");
    const payload = { ownScore: 3, opponentScore: 4, putts: 1, fairway: "hit", green: "hit" };
    await db.query("select submit_live_hole_reliable(2027,2,1,'cade-barone',$1,$2,$3,$4,null)", [HOST, JSON.stringify(payload), randomUUID(), box]);
    await db.query("select submit_live_hole_reliable(2027,2,1,'cam-latto',$1,$2,$3,$4,null)", [OTHER, JSON.stringify({ ...payload, ownScore: 4, opponentScore: 3 }), randomUUID(), box]);

    // Existing triggers still ran (archive mirror + publication queue)...
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from career_archive_live_holes where round = 2")).n, 2);
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from live_publication_jobs where match_box_id = $1", [box])).n, 1);
    // ...and every row they produced carries the 2027 edition.
    for (const table of ["live_round_state", "live_match_boxes", "live_hole_scores", "career_archive_live_holes", "live_publication_jobs", "live_score_audit_events"]) {
      const untagged = await one<{ n: number }>(db, `select count(*)::int as n from ${table} where edition_id is distinct from $1`, [edition2027]);
      assert.equal(untagged.n, 0, `${table} has an untagged row`);
    }
  } finally {
    await db.close();
  }
});

test("edition and year can never disagree; changing the year moves the edition with it", async () => {
  const db = await databaseWithLiveActivity();
  try {
    await db.exec(sql("platform_editions.sql"));
    const id = async (year: number) => (await one<{ id: string }>(db, "select id from tournament_editions where season_year = $1", [year])).id;

    await assert.rejects(db.query("update live_roster set edition_id = $1 where player_slug = 'cam-latto'", [await id(2026)]), /foreign key/);

    await db.exec("update website_section_settings set season_year = 2028 where section = 'home'");
    assert.equal((await one<{ edition_id: string }>(db, "select edition_id from website_section_settings where section = 'home'")).edition_id, await id(2028));
    await db.exec("update website_section_settings set season_year = null where section = 'home'");
    assert.equal((await one<{ edition_id: string | null }>(db, "select edition_id from website_section_settings where section = 'home'")).edition_id, null);

    // A year with no edition yet gets an empty container edition, never a null tag.
    await db.exec("insert into website_section_settings(section, season_year) values ('teams', 2031)");
    assert.equal((await one<{ label: string; status: string }>(db, "select label, status from tournament_editions where season_year = 2031")).label, "2031");

    // A second legacy tournament is refused: only one can own the year-keyed engine.
    await assert.rejects(db.exec(`insert into tournaments(organization_id, slug, name, short_name, is_legacy)
      select id, 'second-legacy', 'X', 'X', true from organizations`), /duplicate key/);
  } finally {
    await db.close();
  }
});

test("the rollback restores the pre-C2 database exactly, and C2 can be applied again", async () => {
  const db = await databaseWithLiveActivity();
  try {
    const before = await snapshot(db);
    const columnsBefore = (await one<{ n: number }>(db, "select count(*)::int as n from information_schema.columns where table_schema = 'public'")).n;
    await db.exec(sql("platform_editions.sql"));
    await db.exec(sql("platform_editions_rollback.sql"));
    await db.exec(sql("platform_editions_rollback.sql"));
    assert.deepEqual(await snapshot(db), before);
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from information_schema.columns where table_schema = 'public'")).n, columnsBefore);
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from pg_proc where proname in ('legacy_edition_id', 'set_legacy_edition_id')")).n, 0);
    await db.exec(sql("platform_editions.sql"));
    assert.deepEqual(await snapshot(db), before);

    // The foundation's own undo refuses to run while C2 depends on it...
    await assert.rejects(db.exec(sql("platform_foundation_rollback.sql")), /platform_editions_rollback/);
    await db.exec("rollback"); // the SQL Editor ends a failed script's transaction itself
    // ...and after both undos, only the original (pre-platform) tables remain, with their data intact.
    await db.exec(sql("platform_editions_rollback.sql"));
    await db.exec(sql("platform_foundation_rollback.sql"));
    const after = await snapshot(db);
    const platformTables = ["platform_plans", "organizations", "tournaments", "tournament_editions", "tournament_members", "tournament_players", "edition_teams", "edition_roster", "edition_settings", "platform_settings", "tournament_creator_access", "edition_courses", "edition_rounds"];
    for (const table of platformTables) assert.equal(table in after, false, `${table} should be gone`);
    const withoutPlatform = Object.fromEntries(Object.entries(before).filter(([table]) => !platformTables.includes(table)));
    const stripRole = (rows: unknown) =>
      (rows as Record<string, unknown>[]).map((row) => Object.fromEntries(Object.entries(row).filter(([column]) => column !== "platform_role")));
    assert.deepEqual({ ...after, profiles: stripRole(after.profiles) }, { ...withoutPlatform, profiles: stripRole(withoutPlatform.profiles) });
    assert.equal((await one<{ n: number }>(db, "select count(*)::int as n from information_schema.columns where table_name = 'profiles' and column_name = 'platform_role'")).n, 0);
  } finally {
    await db.close();
  }
});
