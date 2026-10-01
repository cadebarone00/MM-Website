import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { summarizeMyTournaments, summarizePastEditions, tournamentPathFromLink } from "./pastTournaments.ts";
import { createTournament, database, profile, quick } from "./testDatabase.ts";

const SITE = "https://themaroon.example";

test("tournament links from this site open the tournament; anything else is refused", () => {
  assert.equal(tournamentPathFromLink("https://themaroon.example/t/texas-cup/2027", SITE), "/t/texas-cup/2027");
  assert.equal(tournamentPathFromLink("  /t/texas-cup/2027  ", SITE), "/t/texas-cup/2027");
  assert.equal(tournamentPathFromLink("https://themaroon.example/t/Texas-Cup/2027/leaderboard?x=1", SITE), "/t/texas-cup/2027");
  for (const bad of ["", "   ", "hello", "https://evil.example/t/texas-cup/2027", "/t/texas-cup", "/t/texas-cup/27",
    "/tournaments/texas-cup/2027", "/t/texas cup/2027", "/t/-bad-/2027", "javascript:alert(1)", "//evil.example/t/texas-cup/2027"]) {
    assert.equal(tournamentPathFromLink(bad, SITE), null, bad);
  }
});

test("summary keeps only well-formed rows and sends the founding tournament to its own site", () => {
  assert.deepEqual(summarizePastEditions(null), []);
  assert.deepEqual(summarizePastEditions([
    { slug: "texas-cup", name: "Texas Cup", isLegacy: false, year: 2025, destination: "Austin", startDate: "2025-05-01", endDate: "2025-05-03" },
    { slug: "the-maroon", name: "The Maroon", isLegacy: true, year: 2024, destination: null, startDate: null, endDate: null },
    { slug: "", name: "No slug", year: 2024 }, { slug: "x", name: "Bad year", year: "2024" }, null,
  ]), [
    { name: "Texas Cup", year: 2025, destination: "Austin", startDate: "2025-05-01", endDate: "2025-05-03", href: "/t/texas-cup/2025" },
    { name: "The Maroon", year: 2024, destination: null, startDate: null, endDate: null, href: "/website" },
  ]);
});

test("My Tournaments rows enter Tournament Home; the founding tournament keeps its own site", () => {
  assert.deepEqual(summarizeMyTournaments(undefined), []);
  assert.deepEqual(summarizeMyTournaments([
    { slug: "maroon-masters", name: "Maroon Masters", isLegacy: false, year: 2027, destination: "Scottsdale", startDate: "2027-04-01", endDate: "2027-04-04" },
    { slug: "the-maroon", name: "The Maroon", isLegacy: true, year: 2027, destination: null, startDate: null, endDate: null },
    { slug: "x", name: "", year: 2027 },
  ]).map((t) => t.href), ["/play/maroon-masters/2027", "/website"]);
});

async function rosterPlayer(db: PGlite, edition: string, who: string | null) {
  const { tid } = (await db.query<{ tid: string }>("select tournament_id tid from tournament_editions where id = $1", [edition])).rows[0];
  const { id } = (await db.query<{ id: string }>("insert into tournament_players(tournament_id, display_name, profile_id) values ($1, 'Golfer', $2) returning id", [tid, who])).rows[0];
  await db.query("insert into edition_roster(edition_id, tournament_id, tournament_player_id) values ($1, $2, $3)", [edition, tid, id]);
}
const setDates = (db: PGlite, edition: string, start: string | null, end: string | null, published: boolean) =>
  db.query("update tournament_editions set start_date = $2, end_date = $3, published_at = case when $4 then now() else null end where id = $1", [edition, start, end, published]);
const pastFor = async (db: PGlite, who: string) =>
  summarizePastEditions((await db.query<{ l: unknown }>("select list_my_past_editions($1) as l", [who])).rows[0].l);

test("past tournaments: only finished, published editions the person is on the roster of", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "owner", { approved: true });
    const golfer = await profile(db, "golfer");
    const stranger = await profile(db, "stranger");
    const finished = await createTournament(db, owner, { ...quick, name: "Texas Cup", slug: "texas-cup", seasonYear: 2025 });
    const upcoming = await createTournament(db, owner, { ...quick, name: "Future Cup", slug: "future-cup", seasonYear: 2099 });
    const unpublished = await createTournament(db, owner, { ...quick, name: "Hidden Cup", slug: "hidden-cup", seasonYear: 2024 });
    const notPlayed = await createTournament(db, owner, { ...quick, name: "Other Cup", slug: "other-cup", seasonYear: 2023 });
    await setDates(db, finished, "2025-05-01", "2025-05-03", true);
    await setDates(db, upcoming, "2099-05-01", "2099-05-03", true);
    await setDates(db, unpublished, "2024-05-01", "2024-05-03", false);
    await setDates(db, notPlayed, "2023-05-01", "2023-05-03", true);
    for (const edition of [finished, upcoming, unpublished]) await rosterPlayer(db, edition, golfer);
    await rosterPlayer(db, notPlayed, null);

    assert.deepEqual(await pastFor(db, golfer), [
      { name: "Texas Cup", year: 2025, destination: null, startDate: "2025-05-01", endDate: "2025-05-03", href: "/t/texas-cup/2025" },
    ]);
    assert.deepEqual(await pastFor(db, stranger), []);
    assert.deepEqual(await pastFor(db, owner), [], "organizing is not playing");

    await db.query("set role authenticated");
    await assert.rejects(db.query("select list_my_past_editions($1)", [golfer]), /permission denied/);
  } finally {
    await db.close();
  }
});
