import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { assessReadiness } from "./readiness.ts";
import { validateSection, type SectionKey } from "./sectionRules.ts";
import { parseSetup, type TournamentSetup } from "./setup.ts";
import { createPayloadFromBody, type CreateTournamentPayload } from "./tournamentCreate.ts";

// Shared practice-database helpers for platform tests (not a test file itself).
// Drives supabase/*.sql the way the server routes do.

export const CHAIN = [
  "schema.sql", "career_live_archive.sql", "course_library_location.sql", "course_library_tee_setups.sql",
  "archived_handicap_tees.sql", "live_match_publication.sql", "live_hole_submissions.sql", "hole_shot_directions.sql",
  "hole_shot_directions_penalty.sql", "round_format_setups.sql", "scoring_reliability.sql", "live_round_submission.sql",
  "player_slots_email.sql", "player_slots_full_name.sql", "tournament_timezone.sql", "platform_foundation.sql",
  "platform_editions.sql", "platform_create_tournament.sql", "platform_dashboard.sql", "platform_public_site.sql",
  "platform_access_requests.sql", "platform_past_editions.sql", "platform_activity.sql",
];

export const quick = { name: "Texas Cup", slug: "texas-cup", seasonYear: 2027, startDate: "", endDate: "", timezone: "America/Chicago", visibility: "private",
  competitionType: "individual", expectedPlayerCount: 8, teamNames: ["", ""], roundCount: 3, scoringMode: "tbd", formats: [null, null, null], branding: null };

export async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
    create publication supabase_realtime;`);
  for (const file of CHAIN) await db.exec(readFileSync(`supabase/${file}`, "utf8"));
  return db;
}

export async function profile(db: PGlite, name: string, options: { admin?: boolean; approved?: boolean; host?: boolean } = {}) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1)", [id]);
  await db.query("insert into profiles(id,email,display_name,username,platform_role,is_host) values ($1,$2,$3,$4,$5,$6)",
    [id, `${name}@test`, name, name, options.admin ? "admin" : null, options.host ?? false]);
  if (options.approved) await db.query("insert into tournament_creator_access(profile_id,status) values ($1,'approved')", [id]);
  return id;
}

export async function createTournament(db: PGlite, who: string, body: Record<string, unknown> = quick): Promise<string> {
  const parsed = createPayloadFromBody(body);
  assert.ok(parsed.ok);
  const p = (parsed as { ok: true; payload: CreateTournamentPayload }).payload;
  return (await db.query<{ r: { editionId: string } }>("select create_tournament_shell($1, $2) as r", [who, JSON.stringify(p)])).rows[0].r.editionId;
}

export async function load(db: PGlite, who: string, edition: string): Promise<TournamentSetup> {
  return parseSetup((await db.query<{ s: unknown }>("select get_tournament_setup($1, $2) as s", [who, edition])).rows[0].s);
}

/** What PATCH /api/platform/tournaments/[slug]/[year]/sections/[section] does. */
export async function save(db: PGlite, who: string, edition: string, section: SectionKey, input: unknown): Promise<TournamentSetup> {
  const checked = validateSection(section, input, await load(db, who, edition));
  assert.equal(checked.ok, true, checked.ok ? "" : JSON.stringify(checked.errors));
  const data = (checked as { ok: true; data: Record<string, unknown> }).data;
  return parseSetup((await db.query<{ s: unknown }>("select save_tournament_section($1, $2, $3, $4) as s", [who, edition, section, JSON.stringify(data)])).rows[0].s);
}

export const percent = (setup: TournamentSetup) => assessReadiness(setup, { liveScoringAvailable: false }).percent;

/** Every live-scoring / archive / broadcast / odds row, plus The Maroon's platform rows. */
export async function protectedSnapshot(db: PGlite) {
  const tables = (await db.query<{ t: string }>(`select table_name t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
    and (table_name like 'live\\_%' or table_name like 'career\\_%' or table_name like 'broadcast\\_%' or table_name like '%odds%'
      or table_name in ('round_format_setups', 'season_calendar', 'player_slots', 'wagers_accounts', 'mm_coin_bets', 'archived_scorecard_rounds', 'archived_scorecard_holes'))
    order by 1`)).rows.map((r) => r.t);
  const out: Record<string, unknown> = {};
  for (const table of tables) out[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]') v from public."${table}" x`)).rows[0];
  out.__maroon = (await db.query(`select jsonb_build_object(
      'tournament', (select to_jsonb(t) from tournaments t where is_legacy),
      'editions', (select jsonb_agg(to_jsonb(e) order by e.season_year) from tournament_editions e join tournaments t on t.id = e.tournament_id where t.is_legacy),
      'teams', (select jsonb_agg(to_jsonb(x) order by x.edition_id, x.key) from edition_teams x join tournament_editions e on e.id = x.edition_id join tournaments t on t.id = e.tournament_id where t.is_legacy),
      'settings', (select jsonb_agg(to_jsonb(x) order by x.edition_id) from edition_settings x join tournament_editions e on e.id = x.edition_id join tournaments t on t.id = e.tournament_id where t.is_legacy),
      'players', (select jsonb_agg(to_jsonb(x) order by x.legacy_player_slug) from tournament_players x join tournaments t on t.id = x.tournament_id where t.is_legacy)) v`)).rows[0];
  return { tables, out };
}

export function sqlFile(file: string) {
  return readFileSync(`supabase/${file}`, "utf8");
}
