import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildPlayerRound, holesFromCard, personalRoundSourceKey, tournamentRoundSourceKey, tripRoundSourceKey, type PlayerRoundInput } from "./playerRounds.ts";
import { playerRoundPayload, playerRoundsFromJson, profileHistoryFromJson } from "./playerRoundsRows.ts";
import { database, profile, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/player_rounds.sql ---------------------------------------------------

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const card = { strokes: PAR.map((p, i) => i === 0 ? p + 8 : p), putts: PAR.map(() => 2), fairways: PAR.map(() => "center" as const), greens: PAR.map(() => "left" as const) };
const round = (who: string, extra: Partial<PlayerRoundInput> = {}) => buildPlayerRound({
  id: "trip:t1:r1", profileId: who, source: "trip", datePlayed: "2027-04-23", course: { ref: "og-12", name: "Canyon Ridge", place: "Scottsdale, AZ" },
  tee: { name: "Blue", rating: 72, slope: 113 }, holesPlayed: 18, format: "Singles Match Play", holes: holesFromCard(card, PAR), enteredBy: "player", ...extra,
});

async function setup(): Promise<PGlite> {
  const db = await database();
  await db.exec(sqlFile("player_rounds.sql"));
  await db.exec(sqlFile("player_rounds.sql")); // safe to run twice
  return db;
}
const save = async (db: PGlite, who: string, payload: unknown) =>
  (await db.query<{ r: { saved: boolean; round: unknown } }>("select save_player_round($1, $2) as r", [who, JSON.stringify(payload)])).rows[0].r;
const list = async (db: PGlite, who: string) => (await db.query<{ r: unknown }>("select list_my_player_rounds($1) as r", [who])).rows[0].r;
const refused = (promise: Promise<unknown>, pattern?: RegExp) => pattern ? assert.rejects(promise, pattern) : assert.rejects(promise);

test("a round saves once per account and comes back exactly as built", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const built = round(cade);
  const first = await save(db, cade, playerRoundPayload(built, "Desert Trip"));
  assert.equal(first.saved, true);
  const again = await save(db, cade, playerRoundPayload({ ...built, format: "Changed" }, "Desert Trip"));
  assert.equal(again.saved, false, "second submit is ignored");
  const [mine] = playerRoundsFromJson(await list(db, cade));
  assert.deepEqual({ ...mine }, { ...built, sourceLabel: "Desert Trip" });
});

test("each account only ever sees its own rounds", async () => {
  const db = await setup();
  const [cade, jake] = [await profile(db, "cade"), await profile(db, "jake")];
  await save(db, cade, playerRoundPayload(round(cade), null));
  await save(db, jake, playerRoundPayload(round(jake, { id: "trip:t1:r1" }), null));
  assert.equal(playerRoundsFromJson(await list(db, cade)).length, 1);
  assert.equal(playerRoundsFromJson(await list(db, jake)).length, 1, "same round key, separate accounts");
  await refused(save(db, "00000000-0000-0000-0000-000000000000", playerRoundPayload(round(cade), null)));
  // No direct table access for signed-in users or visitors.
  await db.exec("set role authenticated");
  await refused(db.query("select * from player_rounds"));
  await refused(db.query("select list_my_player_rounds($1)", [cade]));
  await db.exec("reset role");
});

test("rounds that break the rules are refused", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const ok = playerRoundPayload(round(cade), null);
  await refused(save(db, cade, { ...ok, total: ok.total + 1 }));                       // total ≠ sum of holes
  await refused(save(db, cade, { ...ok, differential: 2 }));                          // wrong differential
  await refused(save(db, cade, { ...ok, enteredBy: "organizer" }));                    // organizer rounds never count
  await refused(save(db, cade, { ...ok, tee: { name: "Blue", rating: null, slope: null } })); // counted without a rating
  await refused(save(db, cade, { ...ok, countsForHandicap: false, differential: null, notCountedReason: null })); // not counted needs a reason
  await refused(save(db, cade, { ...ok, source: "friendly" }));
  await refused(save(db, cade, { ...ok, holes: [...ok.holes, ok.holes[0]] }));         // 19 holes
  await refused(save(db, cade, { ...ok, holes: ok.holes.map((h, i) => i === 0 ? { ...h, strokes: 0 } : h), total: ok.total - 12 }));
  assert.equal(playerRoundsFromJson(await list(db, cade)).length, 0);
  // A not-counted, total-only round (History) is fine.
  const history = playerRoundPayload(round(cade, { id: "history:h1:r1", source: "history", holes: [], total: 91, tee: null, enteredBy: "organizer" }), "Desert Classic");
  assert.equal((await save(db, cade, history)).saved, true);
});

test("privacy starts private and only takes public / private", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const visibility = async () => (await db.query<{ v: string }>("select get_rounds_visibility($1) as v", [cade])).rows[0].v;
  assert.equal(await visibility(), "private");
  await db.query("select set_rounds_visibility($1, 'public')", [cade]);
  assert.equal(await visibility(), "public");
  await refused(db.query("select set_rounds_visibility($1, 'everyone')", [cade]));
  assert.equal(await visibility(), "public");
});

test("rows from the database are checked before the screens use them", () => {
  assert.deepEqual(playerRoundsFromJson(null), []);
  assert.deepEqual(playerRoundsFromJson([{ sourceKey: 1 }, null]), []);
});

// --- Source identity, publish_player_round and the unified history (list_profile_rounds) ---------------------

type Context = Record<string, string | number>;
type Published = { result: "created" | "updated" | "unchanged"; round: Record<string, unknown> };
const publish = async (db: PGlite, who: string, payload: unknown, context: Context) =>
  (await db.query<{ r: Published }>("select publish_player_round($1, $2) as r", [who, JSON.stringify({ ...(payload as object), context })])).rows[0].r;
const history = async (db: PGlite, viewer: string | null, owner: string) =>
  (await db.query<{ r: Record<string, unknown>[] }>("select list_profile_rounds($1, $2) as r", [viewer, owner])).rows[0].r;
const rowCount = async (db: PGlite, who: string) => (await db.query<{ n: number }>("select count(*)::int n from player_rounds where profile_id = $1", [who])).rows[0].n;

/** One finished round from each kind of source, all at Canyon Ridge on the same day. */
function sources(who: string) {
  const [trip, tripRound, edition, editionRound, tournamentPlayer, personal, submission] = Array.from({ length: 7 }, () => randomUUID());
  return {
    trip: { payload: playerRoundPayload(round(who, { id: tripRoundSourceKey(trip, tripRound) }), "Desert Trip"),
      context: { golfTripId: trip, golfTripRoundId: tripRound, scorecardSubmissionId: submission, submissionRevision: 1 } },
    tournament: { payload: playerRoundPayload(round(who, { id: tournamentRoundSourceKey(edition, editionRound), source: "tournament" }), "Texas Cup 2027"),
      context: { editionId: edition, editionRoundId: editionRound, tournamentPlayerId: tournamentPlayer } },
    personal: { payload: playerRoundPayload(round(who, { id: personalRoundSourceKey(personal), source: "personal", format: "Stroke Play" }), null),
      context: { personalRoundId: personal } },
  };
}

test("trip, tournament and personal rounds are each saved with exactly where they came from", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const s = sources(cade);
  for (const kind of ["trip", "tournament", "personal"] as const) {
    assert.equal((await publish(db, cade, s[kind].payload, s[kind].context)).result, "created", kind);
  }
  const by = Object.fromEntries(playerRoundsFromJson(await history(db, cade, cade)).map((r) => [r.source, r]));
  assert.equal(by.trip.id, tripRoundSourceKey(s.trip.context.golfTripId, s.trip.context.golfTripRoundId));
  assert.equal(by.trip.tripId, s.trip.context.golfTripId);
  assert.equal(by.trip.scorecardSubmissionId, s.trip.context.scorecardSubmissionId);
  assert.equal(by.trip.submissionRevision, 1);
  assert.equal(by.tournament.editionRoundId, s.tournament.context.editionRoundId);
  assert.equal(by.tournament.tournamentPlayerId, s.tournament.context.tournamentPlayerId);
  assert.equal(by.personal.personalRoundId, s.personal.context.personalRoundId);
  // The key is made from the ids: missing ids, a key that doesn't match them, or another source's ids are refused.
  await refused(publish(db, cade, s.trip.payload, { golfTripId: s.trip.context.golfTripId }), /needs its round ids/);
  await refused(publish(db, cade, { ...s.trip.payload, sourceKey: "trip:x:y" }, s.trip.context), /match its round ids/);
  const stray = randomUUID();
  await refused(publish(db, cade, playerRoundPayload(round(cade, { id: personalRoundSourceKey(stray), source: "personal" }), null),
    { personalRoundId: stray, golfTripId: randomUUID(), golfTripRoundId: randomUUID() }), /player_rounds_source_identity/);
  await refused(db.query(`insert into player_rounds (profile_id, source, source_key, date_played, course_name, holes_played, format, total, counts_for_handicap,
    not_counted_reason, entered_by, golf_trip_id, golf_trip_round_id) values ($1, 'trip', 'trip:a:b', '2027-04-23', 'X', 18, 'Singles', 80, false, 'n', 'player', $2, $3)`,
    [cade, randomUUID(), randomUUID()]), /player_rounds_source_identity/);
  assert.equal(await rowCount(db, cade), 3);
});

test("one profile + one real round = one history row; the same course twice in a day is two rows", async () => {
  const db = await setup();
  const [cade, jake] = [await profile(db, "cade"), await profile(db, "jake")];
  const s = sources(cade);
  await publish(db, cade, s.trip.payload, s.trip.context);
  // Replays (a retried submit, a re-run queue) change nothing; the older save door can't add a second copy either.
  assert.equal((await publish(db, cade, s.trip.payload, s.trip.context)).result, "unchanged");
  assert.equal((await save(db, cade, s.trip.payload)).saved, false);
  assert.equal(await rowCount(db, cade), 1);
  // Same trip round, another golfer: their own row.
  const jakes = playerRoundPayload(round(jake, { id: s.trip.payload.sourceKey }), "Desert Trip");
  assert.equal((await publish(db, jake, jakes, { ...s.trip.context, scorecardSubmissionId: randomUUID() })).result, "created");
  // One official card can't feed two rows.
  const [t2, r2] = [randomUUID(), randomUUID()];
  await refused(publish(db, jake, playerRoundPayload(round(jake, { id: tripRoundSourceKey(t2, r2) }), null),
    { golfTripId: t2, golfTripRoundId: r2, scorecardSubmissionId: s.trip.context.scorecardSubmissionId }), /player_rounds_submission_idx/);
  // Morning and afternoon at Canyon Ridge, same date: two trip rounds, plus two personal rounds the same day.
  const trip = s.trip.context.golfTripId;
  const afternoon = randomUUID();
  assert.equal((await publish(db, cade, playerRoundPayload(round(cade, { id: tripRoundSourceKey(trip, afternoon) }), "Desert Trip"),
    { golfTripId: trip, golfTripRoundId: afternoon })).result, "created");
  for (const id of [randomUUID(), randomUUID()]) {
    assert.equal((await publish(db, cade, playerRoundPayload(round(cade, { id: personalRoundSourceKey(id), source: "personal" }), null), { personalRoundId: id })).result, "created");
  }
  const rows = playerRoundsFromJson(await history(db, cade, cade));
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((r) => `${r.course.name}|${r.datePlayed}`)).size, 1, "all at the same course on the same day");
});

test("an approved correction (revision 2) rewrites the same row; older revisions and replays never undo it", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  const s = sources(cade);
  const first = await publish(db, cade, s.trip.payload, s.trip.context);
  const row = async () => (await db.query<{ id: string; created_at: string; updated_at: string | null; total: number; submission_revision: number; removed_from_profile: boolean }>(
    "select id, created_at::text, updated_at::text, total, submission_revision, removed_from_profile from player_rounds where profile_id = $1", [cade])).rows;
  const [before] = await row();
  // Hole 1 corrected from 12 to 4 → total drops by 8, differential recalculated.
  const corrected = playerRoundPayload(round(cade, { id: s.trip.payload.sourceKey, holes: holesFromCard({ ...card, strokes: [...PAR] }, PAR) }), "Desert Trip");
  const second = await publish(db, cade, corrected, { ...s.trip.context, submissionRevision: 2 });
  assert.equal(second.result, "updated");
  assert.equal(second.round.total, (first.round.total as number) - 8);
  assert.equal(second.round.submissionRevision, 2);
  const after = await row();
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before.id, "same row");
  assert.equal(after[0].created_at, before.created_at);
  assert.ok(after[0].updated_at);
  // Revision 1 arriving late (a stale retry) or revision 2 again: nothing changes.
  assert.equal((await publish(db, cade, s.trip.payload, s.trip.context)).result, "unchanged");
  assert.equal((await publish(db, cade, corrected, { ...s.trip.context, submissionRevision: 2 })).result, "unchanged");
  assert.equal((await row())[0].total, second.round.total);
  // A correction that breaks the rules is refused and the row stays as it was (the caller's transaction rolls back).
  await refused(publish(db, cade, { ...corrected, total: 1 }, { ...s.trip.context, submissionRevision: 3 }), /total/);
  assert.equal((await row())[0].submission_revision, 2);
  // A round the golfer hid stays hidden after a correction.
  await db.query("update player_rounds set removed_from_profile = true where profile_id = $1", [cade]);
  assert.equal((await publish(db, cade, corrected, { ...s.trip.context, submissionRevision: 4 })).result, "updated");
  assert.equal((await row())[0].removed_from_profile, true);
});

test("one history query returns every source, and privacy decides who sees what", async () => {
  const db = await setup();
  const [cade, jake] = [await profile(db, "cade"), await profile(db, "jake")];
  const s = sources(cade);
  for (const kind of ["trip", "tournament", "personal"] as const) await publish(db, cade, s[kind].payload, s[kind].context);
  await save(db, cade, playerRoundPayload(round(cade, { id: "history:h1:r1", source: "history", holes: [], total: 91, tee: null, enteredBy: "organizer" }), "Desert Classic"));
  const hidden = randomUUID();
  await publish(db, cade, playerRoundPayload(round(cade, { id: personalRoundSourceKey(hidden), source: "personal" }), null), { personalRoundId: hidden });
  await db.query("update player_rounds set removed_from_profile = true where source_key = $1", [personalRoundSourceKey(hidden)]);
  const seen = async (viewer: string | null) => profileHistoryFromJson(await history(db, viewer, cade)).map((r) => r.source).sort();

  // Owner: everything but the hidden round, every source in one list.
  assert.deepEqual(await seen(cade), ["history", "personal", "tournament", "trip"]);
  // Private profile (the default): nobody else sees anything — even rounds from a public tournament or trip.
  assert.deepEqual(await seen(jake), []);
  assert.deepEqual(await seen(null), []);
  // Public profile: trip / tournament / past trips show; a personal round follows its own setting (none = the profile's).
  await db.query("update profiles set rounds_visibility = 'public' where id = $1", [cade]);
  assert.deepEqual(await seen(jake), ["history", "personal", "tournament", "trip"]);
  await db.query("update player_rounds set visibility = 'private' where source = 'personal' and profile_id = $1", [cade]);
  assert.deepEqual(await seen(jake), ["history", "tournament", "trip"]);
  assert.deepEqual(await seen(null), ["history", "tournament", "trip"]);
  // Other viewers never get the owner's profile id or scoring-side ids; the hidden round is in nobody's list.
  const shown = JSON.stringify(await history(db, jake, cade));
  for (const secret of [cade, s.trip.context.scorecardSubmissionId, s.tournament.context.tournamentPlayerId, personalRoundSourceKey(hidden)]) {
    assert.equal(shown.includes(String(secret)), false, `leaked ${secret}`);
  }
  assert.equal(JSON.stringify(await history(db, cade, cade)).includes(personalRoundSourceKey(hidden)), false);
  // Still no direct access for signed-in users.
  await db.exec("set role authenticated");
  await refused(db.query("select list_profile_rounds($1, $2)", [jake, cade]));
  await refused(db.query("select publish_player_round($1, $2)", [cade, "{}"]));
  await db.exec("reset role");
});

test("history outlives its trip or tournament, and legacy Maroon scoring is untouched", async () => {
  const db = await setup();
  const cade = await profile(db, "cade");
  // Only the profile is a foreign key: deleting a trip, round, edition or scorecard never deletes the golfer's history.
  const fks = (await db.query<{ def: string }>("select pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.player_rounds'::regclass and contype = 'f'")).rows;
  assert.deepEqual(fks.map((f) => f.def), ["FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE"]);
  // Publishing writes only player_rounds — the slug-based legacy tables are never written.
  const legacy = ["handicap_rounds", "live_rounds", "live_scores"];
  const counts = () => Promise.all(legacy.map(async (t) => (await db.query<{ r: string | null }>("select to_regclass($1)::text r", [`public.${t}`])).rows[0].r
    ? (await db.query<{ n: number }>(`select count(*)::int n from public.${t}`)).rows[0].n : null));
  const before = await counts();
  const s = sources(cade);
  await publish(db, cade, s.trip.payload, s.trip.context);
  assert.deepEqual(await counts(), before);
  const file = readFileSync(new URL("../../supabase/player_rounds.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  for (const word of ["handicap_rounds", "live_", "player_slug", "scorecard_submissions", "scoring_group"]) {
    assert.equal(file.includes(word), false, `player_rounds.sql must not touch ${word}`);
  }
});
