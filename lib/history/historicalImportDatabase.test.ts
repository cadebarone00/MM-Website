import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { profileHistoryFromJson } from "../platform/playerRoundsRows.ts";
import { database, profile, sqlFile } from "../platform/testDatabase.ts";
import { modernStats } from "../profile/profileReadModel.ts";
import { samplePackage } from "./historicalPackageFixture.ts";
import { exportMaroonHistory } from "./maroonHistoryExport.ts";

// --- Database: supabase/historical_import.sql --------------------------------------------------------------------

async function setup(): Promise<PGlite> {
  const db = await database();
  for (const file of ["golf_trips.sql", "player_rounds.sql", "historical_import.sql", "historical_import.sql"]) await db.exec(sqlFile(file));
  return db;
}
const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;
const importPkg = (db: PGlite, actor: string, pkg: unknown, dryRun: boolean) =>
  one<{ status: string; counts: Record<string, number>; event: string; participantsReused: number }>(db, "select import_historical_package($1, $2, $3) as r", [actor, JSON.stringify(pkg), dryRun]);
const count = (db: PGlite, table: string) => one<number>(db, `select count(*)::int as r from ${table}`);
const participant = (db: PGlite, key: string) => one<string>(db, "select id as r from historical_participants where source_key = $1", [key]);
const linkedTo = (db: PGlite, key: string) => one<string | null>(db, "select profile_id as r from historical_participants where source_key = $1", [key]);
const audit = async (db: PGlite, key: string) => (await db.query<{ action: string }>(
  "select e.action from historical_link_events e join historical_participants p on p.id = e.participant_id where p.source_key = $1 order by e.id", [key])).rows.map((r) => r.action);
const historyRounds = (db: PGlite, viewer: string | null, owner: string) => one<unknown[]>(db, "select list_profile_historical_rounds($1, $2) as r", [viewer, owner]);
const TABLES = ["historical_imports", "historical_events", "historical_participants", "historical_editions", "historical_roster", "historical_rounds", "historical_scores", "historical_matches"];
const allCounts = async (db: PGlite) => Promise.all(TABLES.map((t) => count(db, t)));

test("dry run writes nothing; the import writes once; the same package again is a no-op; changed content is refused", async () => {
  const db = await setup();
  const admin = await profile(db, "admin", { admin: true });
  const dry = await importPkg(db, admin, samplePackage(), true);
  assert.equal(dry.status, "dry-run");
  assert.deepEqual(dry.counts, { participants: 2, editions: 1, roster: 2, rounds: 1, scores: 2, matches: 1 });
  assert.deepEqual(await allCounts(db), [0, 0, 0, 0, 0, 0, 0, 0], "the dry run kept nothing");

  assert.equal((await importPkg(db, admin, samplePackage(), false)).status, "imported");
  const after = await allCounts(db);
  assert.deepEqual(after, [1, 1, 2, 1, 2, 1, 2, 1]);
  assert.equal((await importPkg(db, admin, samplePackage(), false)).status, "already-imported");
  assert.equal((await importPkg(db, admin, samplePackage(), true)).status, "already-imported");
  assert.deepEqual(await allCounts(db), after, "re-running never duplicates");
  const changed = samplePackage();
  changed.participants[0].name = "Al Moss Jr";
  await assert.rejects(importPkg(db, admin, changed, false), /already imported with different content/);
  // Participants exist with no profile — and may stay that way forever.
  assert.equal(await one<number>(db, "select count(*)::int as r from historical_participants where profile_id is null"), 2);
  assert.equal(await count(db, "player_rounds"), 0, "importing history creates no profile rounds");
});

test("another group's history never merges into an event by key; a later dataset can add NEW years to the same event", async () => {
  const db = await setup();
  const admin = await profile(db, "admin", { admin: true });
  const first = await importPkg(db, admin, samplePackage(), false);
  assert.deepEqual([first.event, first.participantsReused], ["new", 0]);
  const before = await allCounts(db);

  // A different group that happens to pick the same event key is refused, not merged.
  const otherGroup = samplePackage();
  otherGroup.dataset.key = "lake-crew-2023";
  otherGroup.event.name = "Lake Crew";
  await assert.rejects(importPkg(db, admin, otherGroup, true), /already belongs to "Desert Boys"/);

  // The same group re-sending a year that's already there is refused, not silently skipped.
  const sameYear = samplePackage();
  sameYear.dataset.key = "desert-boys-2023-again";
  await assert.rejects(importPkg(db, admin, sameYear, true), /already imported for "Desert Boys"/);
  assert.deepEqual(await allCounts(db), before);

  // The same group adding 2024 later: same event, the same people (by key) carry over, no duplicates.
  const nextYear = samplePackage();
  nextYear.dataset.key = "desert-boys-2024";
  const e = nextYear.editions[0];
  Object.assign(e, { key: "2024", year: 2024, label: "Desert Boys 2024", startDate: "2024-04-18", endDate: "2024-04-21" });
  e.rounds[0].key = "2024:r1"; e.rounds[0].date = "2024-04-19";
  e.matches[0].key = "2024:m1"; e.matches[0].round = "2024:r1";
  const added = await importPkg(db, admin, nextYear, false);
  assert.deepEqual([added.status, added.event, added.participantsReused], ["imported", "existing", 2]);
  assert.equal(await count(db, "historical_events"), 1);
  assert.equal(await count(db, "historical_participants"), 2, "Al and Bo are still one participant each");
  assert.equal(await count(db, "historical_editions"), 2);
});

test("only platform admins import; packages with emails or account ids are refused; nobody calls it directly", async () => {
  const db = await setup();
  const golfer = await profile(db, "golfer");
  const admin = await profile(db, "admin", { admin: true });
  await assert.rejects(importPkg(db, golfer, samplePackage(), true), /platform admin/);
  const withEmail = samplePackage() as unknown as { participants: Record<string, unknown>[] };
  withEmail.participants[0].email = "al@example.com";
  await assert.rejects(importPkg(db, admin, withEmail, true), /never carry emails/);
  const withAccount = samplePackage() as unknown as { participants: Record<string, unknown>[] };
  withAccount.participants[0].account_id = "abc";
  await assert.rejects(importPkg(db, admin, withAccount, true), /never carry emails/, "the database refuses the same fields as the app");
  await assert.rejects(importPkg(db, admin, { format: "something-else", version: 1 }, true), /version 1/);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select import_historical_package($1, '{}', true)", [admin]));
  await assert.rejects(db.query("select * from historical_participants"));
  await db.exec("reset role");
});

test("organizer proposes → golfer accepts; golfer requests → organizer approves; admin links directly — all audited", async () => {
  const db = await setup();
  const admin = await profile(db, "admin", { admin: true }); // the importer is the event's organizer
  const [al, bo, cy] = [await profile(db, "al"), await profile(db, "bo"), await profile(db, "cy")];
  await importPkg(db, admin, samplePackage(), false);
  const [pAl, pBo] = [await participant(db, "p:al"), await participant(db, "p:bo")];

  // 1. Organizer proposes Al; only Al can answer.
  const proposal = await one<string>(db, "select propose_historical_link($1, $2, $3) as r", [admin, pAl, al]);
  await assert.rejects(db.query("select propose_historical_link($1, $2, $3)", [admin, pAl, bo]), /open request/);
  await assert.rejects(db.query("select answer_historical_link($1, $2, true)", [bo, proposal]), /golfer named/);
  assert.equal(await one(db, "select answer_historical_link($1, $2, true) as r", [al, proposal]), "linked");
  assert.equal(await linkedTo(db, "p:al"), al);
  assert.deepEqual(await audit(db, "p:al"), ["proposed", "accepted"]);

  // 2. Bo says "that's me"; a golfer can't approve their own request, the organizer can. A decline leaves it unlinked.
  const asked = await one<string>(db, "select request_historical_link($1, $2) as r", [bo, pBo]);
  await assert.rejects(db.query("select answer_historical_link($1, $2, true)", [bo, asked]), /organizer/);
  assert.equal(await one(db, "select answer_historical_link($1, $2, false) as r", [admin, asked]), "declined");
  assert.equal(await linkedTo(db, "p:bo"), null);
  const again = await one<string>(db, "select request_historical_link($1, $2) as r", [bo, pBo]);
  assert.equal(await one(db, "select answer_historical_link($1, $2, true) as r", [admin, again]), "linked");
  assert.deepEqual(await audit(db, "p:bo"), ["requested", "declined", "requested", "approved"]);

  // One profile is one participant per event; a linked participant can't be claimed again.
  await assert.rejects(db.query("select request_historical_link($1, $2)", [cy, pAl]), /already linked/);
  // 3. Admin: unlink a mistake, then link directly — both need a note; non-admins can't.
  await assert.rejects(db.query("select unlink_historical_participant($1, $2, 'oops')", [al, pAl]), /platform admin/);
  await assert.rejects(db.query("select unlink_historical_participant($1, $2, ' ')", [admin, pAl]), /Say why/);
  assert.equal(await one(db, "select unlink_historical_participant($1, $2, 'Linked to the wrong Al') as r", [admin, pAl]), "unlinked");
  const pending = await one<string>(db, "select request_historical_link($1, $2) as r", [cy, pAl]);
  assert.equal(await one(db, "select admin_link_historical_participant($1, $2, $3, 'Confirmed with the group') as r", [admin, pAl, al]), "linked");
  assert.equal(await one(db, "select status as r from historical_link_requests where id = $1", [pending]), "superseded");
  assert.deepEqual(await audit(db, "p:al"), ["proposed", "accepted", "unlinked", "requested", "superseded", "admin_linked"]);
  // The audit log can't be edited.
  await assert.rejects(db.query("update historical_link_events set note = 'x'"), /can't be changed/);
  // Nothing is ever matched by name: a profile named like a participant stays unlinked until someone acts.
  const namesake = await profile(db, "al-moss");
  assert.equal(await one(db, "select count(*)::int as r from historical_participants where profile_id = $1", [namesake]), 0);
});

test("a linked profile reads its history through the link — nothing copied, never toward handicap, privacy as for any round", async () => {
  const db = await setup();
  const admin = await profile(db, "admin", { admin: true });
  const [al, viewer] = [await profile(db, "al"), await profile(db, "viewer")];
  await importPkg(db, admin, samplePackage(), false);
  assert.deepEqual(await historyRounds(db, al, al), [], "nothing until linked");
  const before = await allCounts(db);
  await db.query("select admin_link_historical_participant($1, $2, $3, 'test')", [admin, await participant(db, "p:al"), al]);
  assert.deepEqual(await allCounts(db), before, "linking copies no history");
  assert.equal(await count(db, "player_rounds"), 0, "and creates no profile rounds");

  const rounds = profileHistoryFromJson(await historyRounds(db, al, al));
  assert.equal(rounds.length, 1, "Bo's empty card isn't Al's, and a card without a total isn't a round");
  assert.deepEqual([rounds[0].source, rounds[0].sourceLabel, rounds[0].datePlayed, rounds[0].course.name, rounds[0].total, rounds[0].holes.length, rounds[0].countsForHandicap],
    ["history", "Desert Boys 2023 · Round 1", "2023-04-21", "Canyon Ridge", 80, 18, false]);
  assert.deepEqual(modernStats(rounds), { roundsPlayed: 1, eighteenHoleRounds: 1, average18: 80, best18: 80, handicapIndex: null, countingRounds: 0 }, "in stats, out of handicap");
  // Private profile (the default): nobody else sees it. Public: visible, without the profile id.
  assert.deepEqual(await historyRounds(db, viewer, al), []);
  await db.query("update profiles set rounds_visibility = 'public' where id = $1", [al]);
  const shown = await historyRounds(db, viewer, al);
  assert.equal(shown.length, 1);
  assert.equal(JSON.stringify(shown).includes(al), false);
  // Unlinking takes it off the profile; the history itself is untouched.
  await db.query("select unlink_historical_participant($1, $2, 'test')", [admin, await participant(db, "p:al")]);
  assert.deepEqual(await historyRounds(db, al, al), []);
  assert.deepEqual(await allCounts(db), before);
});

test("The Maroon 2024–2026 package imports cleanly (dry run), and only once", async () => {
  const db = await setup();
  const admin = await profile(db, "admin", { admin: true });
  const pkg = exportMaroonHistory();
  const dry = await importPkg(db, admin, pkg, true);
  assert.deepEqual([dry.status, dry.counts.participants, dry.counts.editions, dry.counts.matches], ["dry-run", 13, 3, 65]);
  assert.ok(dry.counts.scores > 150);
  assert.deepEqual(await allCounts(db), [0, 0, 0, 0, 0, 0, 0, 0]);
  await importPkg(db, admin, pkg, false);
  const after = await allCounts(db);
  assert.equal((await importPkg(db, admin, exportMaroonHistory(), false)).status, "already-imported", "a fresh export of the same archive is the same dataset");
  assert.deepEqual(await allCounts(db), after);
  // Team stays with the year: a 2026 roster row, never anything on a profile.
  assert.equal(await one(db, `select r.team_key as r from historical_roster r join historical_editions e on e.id = r.edition_id
    join historical_participants p on p.id = r.participant_id where e.year = 2026 and p.source_key = 'p:nate-wojciechowski'`), "maroon");
});
