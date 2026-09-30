import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { canCreateTournament, type CreatorAccessStatus } from "./entitlements.ts";
import { TEAM_COLORS, createPayloadFromBody, type CreateTournamentPayload } from "./tournamentCreate.ts";

const quick = { name: "Texas Cup", slug: "texas-cup", seasonYear: 2027, startDate: "", endDate: "", timezone: "America/Chicago", visibility: "private",
  competitionType: "individual", expectedPlayerCount: 12, teamNames: ["", ""], roundCount: 3, scoringMode: "tbd", formats: [null, null, null], branding: null };

function payload(body: Record<string, unknown>): CreateTournamentPayload {
  const result = createPayloadFromBody(body);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.errors));
  return (result as { ok: true; payload: CreateTournamentPayload }).payload;
}

test("quick create needs only a name, web address and year", () => {
  const p = payload(quick);
  assert.deepEqual({ slug: p.slug, seasonYear: p.seasonYear, startDate: p.startDate, endDate: p.endDate, teams: p.teams, scoring: p.scoring },
    { slug: "texas-cup", seasonYear: 2027, startDate: null, endDate: null, teams: [], scoring: {} });
  assert.deepEqual(p.plan, { competitionType: "individual", expectedPlayerCount: 12, rounds: [{ format: null }, { format: null }, { format: null }] });
});

test("teams get non-Maroon starting colors; logo URLs from the browser are ignored", () => {
  const p = payload({ ...quick, competitionType: "teams", teamNames: ["Blue", "Gold"], scoringMode: "match_play", formats: ["Fourball", "Foursome", "Singles"],
    branding: { primary: "#1f4e9c", secondary: "#ffffff", accent: "#d4a017", logoUrl: "https://evil.example/x.png" } });
  assert.deepEqual(p.teams, [{ key: "team-1", name: "Blue", color: TEAM_COLORS[0] }, { key: "team-2", name: "Gold", color: TEAM_COLORS[1] }]);
  assert.deepEqual(p.scoring, { mode: "match_play" });
  assert.equal(p.branding?.logoUrl, null);
});

test("rejects bad or reserved addresses, a year that disagrees with the dates, half-entered dates, and junk", () => {
  const fields = (body: unknown) => { const r = createPayloadFromBody(body); return r.ok ? [] : r.errors.map((e) => e.field); };
  assert.deepEqual(fields({ ...quick, slug: "Texas Cup" }), ["slug"]);
  assert.deepEqual(fields({ ...quick, slug: "tournaments" }), ["slug"]);
  assert.deepEqual(fields({ ...quick, startDate: "2028-04-15", endDate: "2028-04-17" }), ["seasonYear"]);
  assert.deepEqual(fields({ ...quick, startDate: "2027-04-15" }), ["endDate"]);
  assert.ok(fields({ ...quick, seasonYear: "2027" }).includes("seasonYear"));
  assert.ok(fields({ ...quick, formats: ["Scramble", null, null] }).includes("formats"));
  for (const junk of [null, 5, "x", [], {}]) assert.equal(createPayloadFromBody(junk).ok, false);
});

// --- Database: supabase/platform_create_tournament.sql ----------------------

const CHAIN = [
  "schema.sql", "career_live_archive.sql", "course_library_location.sql", "course_library_tee_setups.sql",
  "archived_handicap_tees.sql", "live_match_publication.sql", "live_hole_submissions.sql", "hole_shot_directions.sql",
  "hole_shot_directions_penalty.sql", "round_format_setups.sql", "scoring_reliability.sql", "live_round_submission.sql",
  "player_slots_email.sql", "player_slots_full_name.sql", "tournament_timezone.sql", "platform_foundation.sql",
  "platform_editions.sql", "platform_create_tournament.sql", "platform_dashboard.sql",
];
const sql = (file: string) => readFileSync(`supabase/${file}`, "utf8");

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
    create publication supabase_realtime;`);
  for (const file of CHAIN) await db.exec(sql(file));
  await db.exec(sql("platform_create_tournament.sql"));
  return db;
}

async function profile(db: PGlite, name: string, options: { admin?: boolean; access?: CreatorAccessStatus } = {}) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1)", [id]);
  await db.query("insert into profiles(id,email,display_name,username,platform_role) values ($1,$2,$3,$4,$5)", [id, `${name}@test`, name, name, options.admin ? "admin" : null]);
  if (options.access) await db.query("insert into tournament_creator_access(profile_id,status) values ($1,$2)", [id, options.access]);
  return id;
}

const create = (db: PGlite, who: string, p: CreateTournamentPayload) =>
  db.query<{ r: { tournamentSlug: string; seasonYear: number; tournamentId: string; editionId: string } }>("select create_tournament_shell($1, $2) as r", [who, JSON.stringify(p)]).then((x) => x.rows[0].r);

async function count(db: PGlite, table: string) {
  return (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;
}

test("an approved creator gets a real Tournament + Edition shell, all at once", async () => {
  const db = await database();
  try {
    const maroonBefore = (await db.query("select * from tournaments where is_legacy")).rows;
    const who = await profile(db, "sam", { access: "approved" });
    const teams = payload({ ...quick, competitionType: "teams", teamNames: ["Blue", "Gold"], scoringMode: "match_play", formats: ["Fourball", null, "Singles"] });
    const result = await create(db, who, teams);
    assert.deepEqual({ slug: result.tournamentSlug, year: result.seasonYear }, { slug: "texas-cup", year: 2027 });

    const t = (await db.query<Record<string, unknown>>(`select t.name, t.short_name, t.visibility, t.status, t.is_legacy, o.plan_key, o.created_by = $1 as own_org
      from tournaments t join organizations o on o.id = t.organization_id where t.slug = 'texas-cup'`, [who])).rows[0];
    assert.deepEqual(t, { name: "Texas Cup", short_name: "Texas Cup", visibility: "private", status: "draft", is_legacy: false, plan_key: "beta", own_org: true });
    const e = (await db.query<Record<string, unknown>>("select season_year, label, start_date, end_date, timezone, status from tournament_editions where id = $1", [result.editionId])).rows[0];
    assert.deepEqual(e, { season_year: 2027, label: "2027", start_date: null, end_date: null, timezone: "America/Chicago", status: "draft" });
    assert.deepEqual((await db.query("select role from tournament_members where tournament_id = $1 and profile_id = $2", [result.tournamentId, who])).rows, [{ role: "owner" }]);
    assert.deepEqual((await db.query("select key, name, color from edition_teams where edition_id = $1 order by sort_order", [result.editionId])).rows,
      [{ key: "team-1", name: "Blue", color: TEAM_COLORS[0] }, { key: "team-2", name: "Gold", color: TEAM_COLORS[1] }]);
    const s = (await db.query<{ scoring: unknown; plan: unknown }>("select scoring, plan from edition_settings where edition_id = $1", [result.editionId])).rows[0];
    assert.deepEqual(s, { scoring: { mode: "match_play" }, plan: { competitionType: "teams", expectedPlayerCount: 12 } });
    // Planned rounds get their own rows (TBD formats stay null) — never the live-scoring tables.
    assert.deepEqual((await db.query("select round_number, format from edition_rounds where edition_id = $1 order by round_number", [result.editionId])).rows,
      [{ round_number: 1, format: "Fourball" }, { round_number: 2, format: null }, { round_number: 3, format: "Singles" }]);

    // A second tournament reuses the creator's organization.
    await create(db, who, payload({ ...quick, name: "Spring Scramble", slug: "spring-scramble" }));
    assert.equal(await count(db, `organizations where created_by = '${who}'`), 1);

    // The Maroon Tournament is untouched and still the only legacy tournament.
    assert.deepEqual((await db.query("select * from tournaments where is_legacy")).rows, maroonBefore);
  } finally {
    await db.close();
  }
});

test("a taken web address fails cleanly and leaves nothing behind", async () => {
  const db = await database();
  try {
    const who = await profile(db, "pat", { access: "approved" });
    const before = { orgs: await count(db, "organizations"), tournaments: await count(db, "tournaments"), editions: await count(db, "tournament_editions") };
    for (const slug of ["the-maroon-tournament"]) {
      await assert.rejects(create(db, who, payload({ ...quick, slug })), (error: { code?: string; message: string }) => error.code === "23505" && /already taken/.test(error.message));
    }
    // Nothing partial: not even the creator's new organization survives the failed call.
    assert.deepEqual({ orgs: await count(db, "organizations"), tournaments: await count(db, "tournaments"), editions: await count(db, "tournament_editions") }, before);
    await create(db, who, payload(quick));
    await assert.rejects(create(db, who, payload(quick)), /already taken/);
  } finally {
    await db.close();
  }
});

test("invite-only is enforced by the database, matching canCreateTournament exactly", async () => {
  const db = await database();
  try {
    const cases: { admin?: boolean; access?: CreatorAccessStatus }[] = [{}, { access: "requested" }, { access: "approved" }, { access: "revoked" }, { admin: true }, { admin: true, access: "revoked" }];
    for (const mode of ["invite_only", "self_serve"] as const) {
      await db.query("update platform_settings set tournament_creation = $1", [mode]);
      for (const [i, c] of cases.entries()) {
        const who = await profile(db, `u${mode.length}x${i}`, c);
        const expected = canCreateTournament({ signedIn: true, platformRole: c.admin ? "admin" : null, creationMode: mode, accessStatus: c.access ?? null });
        const slug = `t-${mode.replace("_", "-")}-${i}`;
        const outcome = await create(db, who, payload({ ...quick, slug })).then(() => true, (error: { code?: string }) => { assert.equal(error.code, "42501"); return false; });
        assert.equal(outcome, expected, `${mode} ${JSON.stringify(c)}`);
      }
    }
    await assert.rejects(create(db, randomUUID(), payload({ ...quick, slug: "ghost" })), /No account/);
  } finally {
    await db.close();
  }
});

test("only the server's service role can call it, and the migration re-runs safely", async () => {
  const db = await database();
  try {
    await db.exec(sql("platform_create_tournament.sql"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select create_tournament_shell($1, '{}'::jsonb)", [randomUUID()]), /permission denied/);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("round trip: what the organizer entered is what the saved dashboard loads", async () => {
  const { parseSetup } = await import("./setup.ts");
  const { createTournamentDraft, setupFromDraft } = await import("./tournamentDraft.ts");
  const { draftInputFromBody } = await import("./tournamentCreate.ts");
  const body = { ...quick, startDate: "2027-04-15", endDate: "2027-04-17", visibility: "unlisted", competitionType: "teams", teamNames: ["Blue", "Gold"],
    scoringMode: "match_play", formats: ["Fourball", null, "Singles"], branding: { primary: "#1f4e9c", secondary: "#ffffff", accent: "#d4a017", logoUrl: null } };
  const entered = createTournamentDraft(draftInputFromBody(body));
  assert.ok(entered.ok);
  if (!entered.ok) return;
  const db = await database();
  try {
    const who = await profile(db, "rt", { access: "approved" });
    const { editionId } = await create(db, who, payload(body));
    const loaded = parseSetup((await db.query<{ s: unknown }>("select get_tournament_setup($1, $2) as s", [who, editionId])).rows[0].s);
    const expected = setupFromDraft(entered.draft);
    // Database ids and statuses are the database's; everything the organizer chose must match.
    const strip = (setup: typeof loaded) => ({
      ...setup, tournament: { ...setup.tournament, id: "" }, edition: { ...setup.edition, id: "" }, entitlements: {},
      teams: setup.teams.map(({ id: _id, key: _key, ...team }) => team), rounds: setup.rounds.map(({ id: _id, ...round }) => round),
    });
    assert.deepEqual(strip(loaded), strip(expected));
    assert.equal(loaded.entitlements.hosted_media, false, "a beta tournament never gets hosted media");
  } finally {
    await db.close();
  }
});

test("roles rank viewer < player < organizer < owner, and save failures read plainly", async () => {
  const { roleAtLeast } = await import("./tournamentAccess.ts");
  const { createFailure } = await import("./tournamentCreate.ts");
  assert.equal(roleAtLeast("owner", "organizer"), true);
  assert.equal(roleAtLeast("organizer", "organizer"), true);
  assert.equal(roleAtLeast("player", "organizer"), false);
  assert.equal(roleAtLeast(null, "viewer"), false);
  assert.deepEqual([createFailure({ code: "42501" }).status, createFailure({ code: "23505" }).status, createFailure({ code: "PGRST202" }).status, createFailure({ code: "XX000" }).status], [403, 409, 503, 500]);
});
