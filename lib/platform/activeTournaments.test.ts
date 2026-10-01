import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { summarizePastEditions } from "./pastTournaments.ts";
import { createTournament, database, profile, quick } from "./testDatabase.ts";

async function rosterPlayer(db: PGlite, edition: string, who: string | null) {
  const { tid } = (await db.query<{ tid: string }>("select tournament_id tid from tournament_editions where id = $1", [edition])).rows[0];
  const { id } = (await db.query<{ id: string }>("insert into tournament_players(tournament_id, display_name, profile_id) values ($1, 'Golfer', $2) returning id", [tid, who])).rows[0];
  await db.query("insert into edition_roster(edition_id, tournament_id, tournament_player_id) values ($1, $2, $3)", [edition, tid, id]);
}
const setDates = (db: PGlite, edition: string, start: string | null, end: string | null, published: boolean) =>
  db.query("update tournament_editions set start_date = $2, end_date = $3, published_at = case when $4 then now() else null end where id = $1", [edition, start, end, published]);
const activeFor = async (db: PGlite, who: string) =>
  summarizePastEditions((await db.query<{ l: unknown }>("select list_my_active_editions($1) as l", [who])).rows[0].l);

test("active tournaments: unfinished, published, non-test editions the person is on the roster of", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "owner", { approved: true });
    const golfer = await profile(db, "golfer");
    const stranger = await profile(db, "stranger");
    const make = (name: string, slug: string, seasonYear: number) => createTournament(db, owner, { ...quick, name, slug, seasonYear });
    const finished = await make("Old Cup", "old-cup", 2025);
    const today = await make("Today Cup", "today-cup", 2026);
    const future = await make("Future Cup", "future-cup", 2099);
    const undated = await make("Undated Cup", "undated-cup", 2098);
    const unpublished = await make("Hidden Cup", "hidden-cup", 2097);
    const testSeason = await make("Test Cup", "test-cup", 2096);
    const notPlayed = await make("Other Cup", "other-cup", 2095);
    await setDates(db, finished, "2025-05-01", "2025-05-03", true);
    // Ends today in the edition's own timezone: still active.
    await db.query("update tournament_editions set start_date = (now() at time zone timezone)::date, end_date = (now() at time zone timezone)::date, published_at = now() where id = $1", [today]);
    await setDates(db, future, "2099-05-01", "2099-05-03", true);
    await setDates(db, undated, null, null, true);
    await setDates(db, unpublished, "2097-05-01", "2097-05-03", false);
    await setDates(db, testSeason, "2096-05-01", "2096-05-03", true);
    await db.query("update tournament_editions set is_test = true where id = $1", [testSeason]);
    await setDates(db, notPlayed, "2095-05-01", "2095-05-03", true);
    for (const edition of [finished, today, future, undated, unpublished, testSeason]) await rosterPlayer(db, edition, golfer);
    await rosterPlayer(db, notPlayed, null);

    const active = await activeFor(db, golfer);
    assert.deepEqual(active.map((t) => t.name), ["Today Cup", "Future Cup", "Undated Cup"]);
    assert.deepEqual(active[1], { name: "Future Cup", year: 2099, destination: null, startDate: "2099-05-01", endDate: "2099-05-03", href: "/t/future-cup/2099" });
    assert.deepEqual(await activeFor(db, stranger), []);
    assert.deepEqual(await activeFor(db, owner), [], "organizing is not playing");

    await db.query("set role authenticated");
    await assert.rejects(db.query("select list_my_active_editions($1)", [golfer]), /permission denied/);
    await db.query("reset role");
    await db.query("set role anon");
    await assert.rejects(db.query("select list_my_active_editions($1)", [golfer]), /permission denied/);
  } finally {
    await db.close();
  }
});
