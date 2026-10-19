import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody } from "../platform/golfTripCreate.ts";
import { database, profile, sqlFile } from "../platform/testDatabase.ts";
import { activeConfigFromJson, draftRowPayload, type DraftRowPayload } from "./configRows.ts";
import { buildHighlightDraft, type PublishedVersion } from "./draft.ts";
import { toXlsx, validSheet, variationSheet } from "./sheetFixture.ts";
import type { RawTab } from "./sheetRows.ts";
import type { HighlightConfig } from "./types.ts";

// --- Database: supabase/highlights_config.sql, on an isolated in-memory practice database (PGlite) ------------------

const TABLES = ["highlight_config_versions", "highlight_config_drafts", "highlight_config_active", "highlight_config_audit"];

async function setup() {
  const db = await database();
  for (let run = 0; run < 2; run++) await db.exec(sqlFile("highlights_config.sql")); // re-runnable
  return { db, admin: await profile(db, "admin", { admin: true }), host: await profile(db, "host", { host: true }), player: await profile(db, "player") };
}
const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;
const payload = (tabs: RawTab[], published: PublishedVersion | null): DraftRowPayload => {
  const result = buildHighlightDraft({ bytes: toXlsx(tabs), fileName: "The_Maroon_Highlights_Source_of_Truth.xlsx", published });
  assert.ok(result.ok);
  return draftRowPayload(result.draft);
};
const save = (db: PGlite, actor: string | null, p: DraftRowPayload) => one<string>(db, "select save_highlight_draft($1, $2) as r", [actor, JSON.stringify(p)]);
const publish = (db: PGlite, actor: string | null, draft: string, confirm = false, note: string | null = null) =>
  one<{ version: number; previousVersion: number | null; changeKind: string }>(db, "select publish_highlight_draft($1, $2, $3, $4) as r", [actor, draft, confirm, note]);
const rollback = (db: PGlite, actor: string | null, target: number, expected: number | null) =>
  one<{ version: number; previousVersion: number }>(db, "select rollback_highlight_config($1, $2, $3) as r", [actor, target, expected]);
const active = async (db: PGlite) => activeConfigFromJson(await one(db, "select get_active_highlight_config() as r"));
const audit = async (db: PGlite) => (await db.query<{ action: string; version: number | null; from_version: number | null }>(
  "select action, version, from_version from highlight_config_audit order by id")).rows.map((r) => [r.action, r.version, r.from_version]);
const count = (db: PGlite, table: string) => one<number>(db, `select count(*)::int as r from ${table}`);
const versionsSnapshot = (db: PGlite) => one<unknown>(db, "select coalesce(jsonb_agg(to_jsonb(v) order by version), '[]') as r from highlight_config_versions v");
const live = async (db: PGlite): Promise<PublishedVersion> => { const a = await active(db); assert.ok(a); return { version: a.version, config: a.config }; };
/** The fixture with one more emoji on HL-001-C01-V01's headline: a copy-only change. */
const reworded = () => { const tabs = variationSheet(); tabs[3].values[3][4] = "{player}'s heating up! 🔥🔥"; return tabs; };

test("upload → draft (nothing live) → explicit publish → live version with variations, emoji and schema 3 intact", async () => {
  const { db, admin } = await setup();
  const p = payload(variationSheet(), null);
  const draft = await save(db, admin, p);
  assert.equal(await active(db), null, "saving a draft publishes nothing");
  assert.equal(await one(db, "select status as r from highlight_config_drafts where id = $1", [draft]), "pending");

  await assert.rejects(publish(db, admin, draft), /Confirm the behavior change/, "the first publish turns triggers on: needs the behavior confirm");
  assert.deepEqual(await publish(db, admin, draft, true, "First rulebook"), { version: 1, previousVersion: null, changeKind: "behavior" });

  const now = await active(db);
  assert.ok(now);
  assert.equal(now.version, 1);
  assert.equal(now.configFingerprint, p.configFingerprint);
  assert.deepEqual(now.config, p.config, "stored byte for byte");
  assert.equal(now.config.schemaVersion, 3);
  assert.equal(now.config.rules.find((r) => r.id === "TR-001")?.meta.reminderTrigger, "24h before", "travel rules and their metadata are stored");
  const c01 = now.config.rules[0].conditionals[0];
  assert.deepEqual(c01.variations.map((v) => v.id), ["HL-001-C01-V01", "HL-001-C01-V02", "HL-001-C01-V03"]);
  assert.equal(c01.variations[2].headline, "Three's a party! 🐦");
  assert.equal(now.config.rules[0].conditionals[1].variations[0].id, "HL-001-C02-V01");
  assert.equal(await one(db, "select status as r from highlight_config_drafts where id = $1", [draft]), "published");
  assert.deepEqual(await audit(db), [["upload", null, null], ["publish", 1, null]]);
  await assert.rejects(publish(db, admin, draft, true), /already published/);
  const history = await one<{ active: number; versions: { version: number; note: string; changeKind: string }[] }>(db, "select list_highlight_config_versions($1) as r", [admin]);
  assert.equal(history.active, 1);
  assert.deepEqual(history.versions.map((v) => [v.version, v.changeKind, v.note]), [[1, "behavior", "First rulebook"]]);
});

test("only platform admins can upload, publish, roll back, discard or list — checked inside the database", async () => {
  const { db, admin, host, player } = await setup();
  const p = payload(variationSheet(), null);
  for (const who of [host, player, randomUUID(), null]) {
    await assert.rejects(save(db, who, p), /Only a platform admin/);
    await assert.rejects(one(db, "select list_highlight_config_versions($1) as r", [who]), /Only a platform admin/);
  }
  const draft = await save(db, admin, p);
  for (const who of [host, player, null]) {
    await assert.rejects(publish(db, who, draft, true), /Only a platform admin/);
    await assert.rejects(one(db, "select discard_highlight_draft($1, $2) as r", [who, draft]), /Only a platform admin/);
  }
  await publish(db, admin, draft, true);
  await assert.rejects(rollback(db, host, 1, 1), /Only a platform admin/);
  assert.deepEqual((await audit(db)).map((a) => a[0]), ["upload", "publish"], "refused attempts leave no trace and change nothing");
});

test("browser roles get nothing; the server role can only read tables and call the functions", async () => {
  const { db, admin } = await setup();
  await publish(db, admin, (await save(db, admin, payload(variationSheet(), null)))!, true);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of TABLES) await assert.rejects(db.query(`select * from ${table}`), /permission denied/, `${role} reads ${table}`);
      await assert.rejects(db.query("select get_active_highlight_config()"), /permission denied/);
      await assert.rejects(db.query("select publish_highlight_draft($1, $2, true, null)", [admin, randomUUID()]), /permission denied/);
      await assert.rejects(db.query("select is_platform_admin($1)", [admin]), /permission denied/);
    } finally { await db.exec("reset role"); }
  }
  await db.exec("set role service_role");
  try {
    assert.equal((await db.query("select * from highlight_config_versions")).rows.length, 1);
    assert.ok(await active(db));
    for (const sql of ["update highlight_config_versions set note = 'x'", "delete from highlight_config_audit", "insert into highlight_config_active(version, reason, activated_by) values (1, 'publish', gen_random_uuid())",
      "update highlight_config_drafts set status = 'pending'", "truncate highlight_config_versions"]) {
      await assert.rejects(db.query(sql), /permission denied/, sql);
    }
  } finally { await db.exec("reset role"); }
});

test("published versions and the audit log can't be edited or deleted, even by the table owner", async () => {
  const { db, admin } = await setup();
  await publish(db, admin, (await save(db, admin, payload(variationSheet(), null)))!, true);
  const before = await versionsSnapshot(db);
  for (const sql of ["update highlight_config_versions set note = 'edited'", "update highlight_config_versions set config = '{}'::jsonb",
    "delete from highlight_config_versions", "truncate highlight_config_versions cascade",
    "update highlight_config_audit set action = 'discard'", "delete from highlight_config_audit", "truncate highlight_config_audit"]) {
    await assert.rejects(db.query(sql), /permanent and cannot be changed or removed/, sql);
  }
  assert.deepEqual(await versionsSnapshot(db), before);
  assert.equal(await count(db, "highlight_config_audit"), 2);
});

test("stale drafts are refused: another version went live after the upload was compared", async () => {
  const { db, admin } = await setup();
  const a = await save(db, admin, payload(variationSheet(), null));
  const b = await save(db, admin, payload(validSheet(), null)); // also compared against "nothing live"
  await publish(db, admin, a!, true);
  await assert.rejects(publish(db, admin, b!, true), /Another version went live after this file was uploaded \(draft compared with vnone, live is v1\)/);
  await assert.rejects(save(db, admin, payload(variationSheet(), null)), /changed while this file was being checked/, "a draft built against an old live version can't even be saved");

  // Compared with the real live version, a wording-only change publishes without the behavior confirm.
  const copy = await save(db, admin, payload(reworded(), await live(db)));
  assert.deepEqual(await publish(db, admin, copy!), { version: 2, previousVersion: 1, changeKind: "copy" });
  assert.equal(await one(db, "select status as r from highlight_config_drafts where id = $1", [b]), "pending", "the stale draft is left alone, just unusable");
});

test("rollback moves the active pointer to any earlier version and back; versions themselves never change", async () => {
  const { db, admin } = await setup();
  await publish(db, admin, (await save(db, admin, payload(variationSheet(), null)))!, true);
  const v1 = await live(db);
  await publish(db, admin, (await save(db, admin, payload(reworded(), v1)))!);
  const before = await versionsSnapshot(db);

  assert.deepEqual(await rollback(db, admin, 1, 2), { version: 1, previousVersion: 2 });
  assert.deepEqual((await live(db)).config, v1.config, "v1's exact config is live again");
  assert.deepEqual(await versionsSnapshot(db), before, "rollback edits no version");
  await assert.rejects(rollback(db, admin, 2, 2), /live version changed \(now v1\)/, "stale rollback");
  await assert.rejects(rollback(db, admin, 1, 1), /already live/);
  await assert.rejects(rollback(db, admin, 9, 1), /does not exist/);
  // A draft compared with v2 is stale now that v1 is live again.
  await assert.rejects(save(db, admin, payload(validSheet(), { version: 2, config: v1.config })), /changed while this file was being checked/);
  assert.deepEqual(await rollback(db, admin, 2, 1), { version: 2, previousVersion: 1 }, "roll forward is the same operation");
  assert.deepEqual(await audit(db), [["upload", null, null], ["publish", 1, null], ["upload", 1, null], ["publish", 2, 1], ["rollback", 1, 2], ["rollback", 2, 1]]);
  assert.equal(await count(db, "highlight_config_versions"), 2);
  await assert.rejects(rollback(db, admin, 1, null), /live version changed/);
});

test("publishing is atomic: a failure part-way leaves no version, no pointer change and the draft still pending", async () => {
  const { db, admin } = await setup();
  const draft = await save(db, admin, payload(variationSheet(), null));
  await db.exec(`create function fail_activation() returns trigger language plpgsql as $$ begin raise exception 'simulated crash'; end; $$;
    create trigger fail_activation before insert or update on highlight_config_active for each row execute function fail_activation();`);
  await assert.rejects(publish(db, admin, draft!, true), /simulated crash/);
  assert.deepEqual([await count(db, "highlight_config_versions"), await count(db, "highlight_config_active")], [0, 0]);
  assert.equal(await one(db, "select status as r from highlight_config_drafts where id = $1", [draft]), "pending");
  assert.deepEqual((await audit(db)).map((a) => a[0]), ["upload"]);
  await db.exec("drop trigger fail_activation on highlight_config_active");
  assert.equal((await publish(db, admin, draft!, true)).version, 1, "the same draft publishes once the problem is gone");
});

test("drafts with errors, no live change, discarded or expired can't be published", async () => {
  const { db, admin } = await setup();
  const broken = validSheet();
  broken[3].values[2][0] = ""; // missing conditional ID
  const withErrors = await save(db, admin, payload(broken, null));
  assert.equal(await one(db, "select has_errors as r from highlight_config_drafts where id = $1", [withErrors]), true, "saved for preview");
  await assert.rejects(publish(db, admin, withErrors!, true), /has errors/);

  await publish(db, admin, (await save(db, admin, payload(variationSheet(), null)))!, true);
  const same = await save(db, admin, payload(variationSheet(), await live(db)));
  await assert.rejects(publish(db, admin, same!, true), /changes nothing players would see/);

  const discarded = await save(db, admin, payload(reworded(), await live(db)));
  await one(db, "select discard_highlight_draft($1, $2) as r", [admin, discarded]);
  await assert.rejects(publish(db, admin, discarded!), /already discarded/);
  await assert.rejects(one(db, "select discard_highlight_draft($1, $2) as r", [admin, discarded]), /already discarded/);

  const old = await save(db, admin, payload(reworded(), await live(db)));
  await db.query("update highlight_config_drafts set expires_at = now() - interval '1 minute' where id = $1", [old]);
  await assert.rejects(publish(db, admin, old!), /expired/);
  await assert.rejects(publish(db, admin, randomUUID(), true), /not found/);
  await assert.rejects(publish(db, admin, (await save(db, admin, payload(reworded(), await live(db))))!, false, "x".repeat(501)), /Note is too long/);
  assert.deepEqual((await audit(db)).map((a) => a[0]), ["upload", "upload", "publish", "upload", "upload", "discard", "upload", "upload"]);
});

test("the database re-checks structure: schema 2 or 3, HL / TR IDs and tabs, metadata, prefixes, duplicates, statuses", async () => {
  const { db, admin } = await setup();
  const good = payload(variationSheet(), null).config;
  const problems = (config: unknown) => one<string[]>(db, "select highlight_config_problems($1) as r", [JSON.stringify(config)]);
  assert.deepEqual(await problems(good), []);
  const mutate = (edit: (c: HighlightConfig) => void) => { const c = structuredClone(good); edit(c); return problems(c); };
  const c01 = (c: HighlightConfig) => c.rules[0].conditionals[0];
  assert.match((await mutate((c) => { (c as { schemaVersion: number }).schemaVersion = 1; })).join(), /schemaVersion must be 2 or 3/);
  assert.match((await mutate((c) => { c01(c).variations[0].id = "HL-001-C01-1"; })).join(), /Bad variation ID 'HL-001-C01-1'/);
  assert.match((await mutate((c) => { c01(c).variations[0].id = "HL-001-C02-V09"; })).join(), /Bad variation ID 'HL-001-C02-V09' under HL-001-C01/);
  assert.match((await mutate((c) => { c01(c).variations[1].id = "HL-001-C01-V01"; })).join(), /Duplicate ID HL-001-C01-V01/);
  assert.match((await mutate((c) => { c01(c).variations[0].id = "HL-001-C01-V00"; })).join(), /HL-001-C01-V00: the CONDITIONAL row's own wording must be V01, and V00 is not used/);
  // HL-001-C02's own wording must be V01.
  assert.match((await mutate((c) => { c.rules[0].conditionals[1].variations[0].id = "HL-001-C02-V02"; })).join(), /HL-001-C02-V02: the CONDITIONAL row's own wording must be V01/);
  // Travel: TR- rules only in the travel tab, HL- rules never there; schema 3 needs every metadata string.
  const tr = (c: HighlightConfig) => c.rules.find((r) => r.id === "TR-001")!;
  assert.match((await mutate((c) => { tr(c).category = "Individual performance"; })).join(), /Rule TR-001 is in the wrong tab/);
  assert.match((await mutate((c) => { c.rules[0].category = "Travel and itinerary alerts"; })).join(), /Rule HL-001 is in the wrong tab/);
  assert.match((await mutate((c) => { delete (tr(c).meta as Partial<HighlightConfig["rules"][number]["meta"]>).audience; })).join(), /Rule TR-001 needs its metadata strings/);
  assert.match((await mutate((c) => { c01(c).id = "HL-002-C01"; })).join(), /Bad conditional ID 'HL-002-C01' under HL-001/);
  assert.match((await mutate((c) => { c01(c).variations[0].status = "Needs copy" as "Draft"; })).join(), /bad status 'Needs copy'/);
  assert.match((await mutate((c) => { delete (c01(c) as { status?: string }).status; })).join(), /Conditional HL-001-C01 has bad status/);
  assert.match((await mutate((c) => { c.rules[1].id = "HL-001"; })).join(), /Duplicate ID HL-001/);

  // A version stored under schema 2 (no metadata, own wording = V00) still passes, so it can be rolled back to.
  const v2 = { schemaVersion: 2, rules: [{ id: "HL-001", category: "Individual performance", name: "Birdie streak", status: "Approved", notes: "", conditionals: [
    { id: "HL-001-C01", condition: "3", tier: 3, status: "Approved", notes: "", variations: [{ id: "HL-001-C01-V00", label: "", headline: "Hot! 🔥", body: "x", status: "Approved", notes: "", legacy: true }] }] }] };
  assert.deepEqual(await problems(v2), []);

  // Defense in depth: a draft claiming "no errors" whose config fails the database check is refused.
  const lying = payload(variationSheet(), null);
  c01(lying.config).variations[0].id = "HL-001-C01-X";
  await assert.rejects(save(db, admin, lying), /failed the database check: Bad variation ID/);
});

test("re-running highlights_config.sql upgrades a database that only allowed schema 2", async () => {
  const { db, admin } = await setup();
  await db.exec(`alter table highlight_config_drafts drop constraint highlight_config_drafts_schema_version_check;
    alter table highlight_config_drafts add constraint highlight_config_drafts_schema_version_check check (schema_version = 2);`);
  await assert.rejects(save(db, admin, payload(variationSheet(), null)), /schema_version_check/, "the old constraint refuses schema 3");
  await db.exec(sqlFile("highlights_config.sql"));
  assert.ok(await save(db, admin, payload(variationSheet(), null)), "after re-running the file, schema 3 drafts save");
});

test("publishing and rolling back never touch stored highlight messages (trip_momentum_events)", async () => {
  const { db, admin } = await setup();
  for (const f of ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql", "golf_trip_scoring_offline.sql", "golf_trip_momentum.sql"]) await db.exec(sqlFile(f));
  const organizer = await profile(db, "organizer");
  const p = golfTripPayloadFromBody({ requestId: randomUUID(), tripName: "Round", destination: "Austin", startDate: "2027-04-22", endDate: "2027-04-26", playerCount: "2",
    yourName: "A", yourEmail: "a@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "", includesTournament: "no", knowsLodging: "no", knowsFlights: "no", knowsTransportation: "no" });
  assert.ok(p.ok);
  const trip = (await db.query<{ v: { tripId: string } }>("select create_golf_trip($1, $2) v", [organizer, JSON.stringify(p.payload)])).rows[0].v.tripId;
  await db.query(`insert into trip_momentum_events (golf_trip_id, round_number, actor_id, kind, title, detail, cause, subject_name, source_key)
    values ($1, 1, $2, 'milestone', 'Heating Up! 🔥', '3 birdies in a row for Cam', 'birdie_3', 'Cam', 'birdie:test:1'),
           ($1, 1, $2, 'score', 'Cam posted a score', 'Round 1 · Hole 4 · 3 strokes', null, null, 'hole:test:1')`, [trip, organizer]);
  const messages = () => one<unknown>(db, "select jsonb_agg(to_jsonb(e) order by source_key) as r from trip_momentum_events e");
  const before = await messages();

  await publish(db, admin, (await save(db, admin, payload(variationSheet(), null)))!, true);
  await publish(db, admin, (await save(db, admin, payload(reworded(), await live(db))))!);
  await rollback(db, admin, 1, 2);
  assert.deepEqual(await messages(), before, "every stored headline / body / row is exactly as it was");
});
