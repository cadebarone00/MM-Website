import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { importInput, importedTripFromJson, pastTripResults, pastTripTemplate, readPastTripWorkbook, type ImportInput } from "./pastTripImport.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/golf_trip_import.sql -------------------------------------------
// An imported trip is a real trip: the importer is the organizer, everyone else a member row with no account yet.

async function setup(): Promise<PGlite> {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_import.sql", "golf_trip_import.sql"]) await db.exec(sqlFile(file));
  return db;
}
const template = () => {
  const read = readPastTripWorkbook(new Uint8Array(readFileSync(`public${pastTripTemplate("both")}`)), "both.xlsx", "2026-11-06");
  assert.ok(read.ok && read.trip);
  return read.trip;
};
const one = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
const save = (db: PGlite, who: string, input: ImportInput) => one<{ tripId: string; created: boolean }>(db, "select import_golf_trip($1, $2) as r", [who, JSON.stringify(input)]);
type Trip = { trip: { imported: boolean; status: string; name: string }; members: { id: string; profileId: string | null; displayName: string; role: string; invitationStatus: string }[]; rounds: unknown[] };
const getTrip = (db: PGlite, who: string, trip: string) => one<Trip | null>(db, "select get_golf_trip($1, $2) as r", [who, trip]);
const results = (db: PGlite, who: string, trip: string) => one<unknown>(db, "select get_golf_trip_imported_results($1, $2) as r", [who, trip]);

test("import: one step makes the trip, its rounds, the organizer and every other player as an unclaimed member", async () => {
  const db = await setup();
  const cam = await profile(db, "Cam");
  const input = importInput(template(), "Alex Brooks", "Cam", randomUUID(), randomUUID);
  const saved = await save(db, cam, input);
  assert.equal(saved.created, true);
  const view = (await getTrip(db, cam, saved.tripId))!;
  assert.equal(view.trip.imported, true);
  assert.equal(view.trip.status, "completed");
  assert.equal(view.rounds.length, 4);
  assert.equal(view.members.length, 8);
  const me = view.members.find((m) => m.role === "organizer")!;
  assert.deepEqual([me.displayName, me.profileId, me.id], ["Alex Brooks", cam, input.organizerMemberId]);
  assert.ok(view.members.filter((m) => m.role === "member").every((m) => m.profileId === null && m.invitationStatus === "pending"));
  // The results come back keyed by member row: the champion is the organizer's own row.
  const back = importedTripFromJson(await results(db, cam, saved.tripId))!;
  assert.equal(pastTripResults(back).champion, me.id);
  assert.deepEqual(pastTripResults(back).teamTotals, [5, 3]);
});

test("import: a retry with the same request id returns the same trip; strangers see nothing", async () => {
  const db = await setup();
  const cam = await profile(db, "Cam"), stranger = await profile(db, "Stranger");
  const input = importInput(template(), null, "Cam", randomUUID(), randomUUID);
  const first = await save(db, cam, input), again = await save(db, cam, input);
  assert.equal(again.tripId, first.tripId);
  assert.equal(again.created, false);
  assert.equal((await db.query("select 1 from golf_trips")).rows.length, 1);
  // Cam didn't play: an organizer row of their own, plus all eight players.
  assert.equal((await getTrip(db, cam, first.tripId))!.members.length, 9);
  assert.equal(await getTrip(db, stranger, first.tripId), null);
  assert.equal(await results(db, stranger, first.tripId), null);
});

test("import: refuses a trip that hasn't finished, a round outside the trip, and a 'me' who isn't a player", async () => {
  const db = await setup();
  const cam = await profile(db, "Cam");
  const input = () => importInput(template(), null, "Cam", randomUUID(), randomUUID);
  await assert.rejects(save(db, cam, { ...input(), endDate: "2999-01-01" }), /past trips/);
  const late = input();
  late.rounds[0].playDate = "2025-06-30";
  await assert.rejects(save(db, cam, late), /outside the trip/);
  await assert.rejects(save(db, cam, { ...input(), organizerMemberId: randomUUID() }), /Invalid import/);
  assert.equal((await db.query("select 1 from golf_trips")).rows.length, 0);
});

test("import: a player claims their row with an invite link, and the trip and results open for them", async () => {
  const db = await setup();
  const cam = await profile(db, "Cam"), riley = await profile(db, "Riley");
  const input = importInput(template(), "Alex Brooks", "Cam", randomUUID(), randomUUID);
  const { tripId } = await save(db, cam, input);
  const rileyRow = input.players.find((p) => p.name === "Riley Foster")!.id;
  const token = "t".repeat(40);
  assert.equal(await one(db, "select regenerate_golf_trip_invite($1, $2, $3, $4) as r", [cam, tripId, rileyRow, token]), true);
  assert.equal((await one<{ status: string }>(db, "select accept_golf_trip_invitation($1, $2) as r", [riley, token])).status, "accepted");
  const view = (await getTrip(db, riley, tripId))!;
  assert.equal(view.members.find((m) => m.id === rileyRow)!.profileId, riley);
  const back = importedTripFromJson(await results(db, riley, tripId))!;
  assert.ok(back.scores.some((s) => s.player === rileyRow));
});

// --- Database: supabase/golf_trip_import_edits.sql ------------------------------------------
// Fixing results after import: a linked player changes only their own scores; the organizer changes anything.

async function setupEdits(): Promise<PGlite> {
  const db = await setup();
  await db.exec(sqlFile("golf_trip_import_edits.sql"));
  await db.exec(sqlFile("golf_trip_import_edits.sql")); // safe to run twice
  return db;
}
const edit = (db: PGlite, who: string, trip: string, revision: number, changes: unknown, results: unknown) =>
  one<number>(db, "select update_imported_trip_results($1, $2, $3, $4, $5) as r", [who, trip, revision, JSON.stringify(changes), JSON.stringify(results)]);
const saved = (db: PGlite, who: string, trip: string) => one<{ results: unknown; revision: number } | null>(db, "select get_golf_trip_imported_results($1, $2) as r", [who, trip]);

test("fixing results: a linked player saves their own score; others' scores and match winners are refused; each change is recorded", async () => {
  const db = await setupEdits();
  const cam = await profile(db, "Cam"), riley = await profile(db, "Riley");
  const input = importInput(template(), "Alex Brooks", "Cam", randomUUID(), randomUUID);
  const { tripId } = await save(db, cam, input);
  const rileyRow = input.players.find((p) => p.name === "Riley Foster")!.id, alexRow = input.organizerMemberId!;
  const token = "r".repeat(40);
  await one(db, "select regenerate_golf_trip_invite($1, $2, $3, $4) as r", [cam, tripId, rileyRow, token]);
  await one(db, "select accept_golf_trip_invitation($1, $2) as r", [riley, token]);

  const first = (await saved(db, riley, tripId))!;
  assert.equal(first.revision, 1);
  const mine = { scores: [{ round: 4, player: rileyRow, total: 86, holes: null }], matches: [] };
  assert.equal(await edit(db, riley, tripId, 1, mine, { ...first.results as object, note: "riley" }), 2);
  await assert.rejects(edit(db, riley, tripId, 2, { scores: [{ round: 4, player: alexRow, total: 70, holes: null }], matches: [] }, {}), /only change your own/);
  await assert.rejects(edit(db, riley, tripId, 2, { scores: [], matches: [{ index: 0, winner: 1 }] }, {}), /only change your own/);
  await assert.rejects(edit(db, riley, tripId, 2, { scores: [], matches: [], pars: [{ round: 4, holePars: Array(18).fill(4) }] }, {}), /only change your own/);
  // The organizer may change a winner; an old revision is refused (two phones at once).
  await assert.rejects(edit(db, cam, tripId, 1, { scores: [], matches: [{ index: 0, winner: 1 }] }, {}), /Reload/);
  assert.equal(await edit(db, cam, tripId, 2, { scores: [], matches: [{ index: 0, winner: 1 }] }, { note: "cam" }), 3);
  assert.deepEqual((await saved(db, cam, tripId))!.results, { note: "cam" });
  const log = (await db.query<{ member_id: string }>("select member_id from golf_trip_imported_edits where golf_trip_id = $1 order by created_at", [tripId])).rows;
  assert.deepEqual(log.map((r) => r.member_id), [rileyRow, alexRow]);
});

test("fixing results: a stranger, or a player who hasn't linked their account, can't change anything", async () => {
  const db = await setupEdits();
  const cam = await profile(db, "Cam"), stranger = await profile(db, "Stranger");
  const input = importInput(template(), "Alex Brooks", "Cam", randomUUID(), randomUUID);
  const { tripId } = await save(db, cam, input);
  const rileyRow = input.players.find((p) => p.name === "Riley Foster")!.id;
  await assert.rejects(edit(db, stranger, tripId, 1, { scores: [{ round: 4, player: rileyRow, total: 80, holes: null }], matches: [] }, {}), /Trip not found/);
  assert.equal(await saved(db, stranger, tripId), null);
});
