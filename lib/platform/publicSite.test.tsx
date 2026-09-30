import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { PGlite } from "@electric-sql/pglite";
import { TournamentSite } from "@/components/platform/tournament-site";
import { SCORING_NOTICE, isPublicPage, publicPages, publicSiteLinks, robotsFor, toSiteData, type PublicTournament } from "./publicSite.ts";
import { createTournament, database, load, profile, quick, save } from "./testDatabase.ts";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Texas Cup 2027 set up through the real dashboard functions, then published. */
async function texasCup(db: PGlite, visibility: "public" | "unlisted" | "private" = "public", options: { slug?: string; name?: string; publish?: boolean; site?: Record<string, boolean> } = {}) {
  const owner = await profile(db, `owner-${options.slug ?? "texas"}`, { approved: true });
  const slug = options.slug ?? "texas-cup";
  const name = options.name ?? "Texas Cup";
  const edition = await createTournament(db, owner, { ...quick, name, slug, competitionType: "teams", teamNames: ["Blue", "Gold"] });
  await save(db, owner, edition, "basics", { name, shortName: name, description: "Blue vs Gold in the Hill Country.", destination: "Horseshoe Bay, TX",
    startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility });
  let setup = await load(db, owner, edition);
  setup = await save(db, owner, edition, "teams", { competitionType: "teams", teams: [
    { id: setup.teams[0].id, name: "Blue", color: "#1f4e9c" }, { id: setup.teams[1].id, name: "Gold", color: "#d4a017" }] });
  const [blue, gold] = setup.teams;
  setup = await save(db, owner, edition, "players", { players: ["Ann Lee", "Bo Diaz", "Cy Park", "Di Moss"].map((player, i) => ({
    name: `${player}${slug === "texas-cup" ? "" : " (" + slug + ")"}`, email: `golfer${i}@secret.example`, handicap: 7.3 + i, teamKey: i < 2 ? blue.key : gold.key })) });
  setup = await save(db, owner, edition, "teams", { competitionType: "teams", teams: [
    { id: blue.id, name: "Blue", color: "#1f4e9c", captainPlayerId: setup.players[0].id }, { id: gold.id, name: "Gold", color: "#d4a017" }] });
  setup = await save(db, owner, edition, "courses", { courses: [{ name: "Horseshoe Bay Summit", city: "Horseshoe Bay", state: "TX", teeName: "Blue", par: 72, yards: 6800, rating: 72.1, slope: 131 }] });
  setup = await save(db, owner, edition, "rounds", { rounds: [{ day: 1, label: "Morning", format: "Fourball", courseId: setup.courses[0].id }, { day: 3, format: "Singles", courseId: setup.courses[0].id }] });
  await save(db, owner, edition, "schedule", { rounds: [{ number: 1, playDate: "2027-04-15", startType: "tee_times", startTime: "08:30" }, { number: 2, playDate: "2027-04-17", startType: "shotgun", startTime: "13:00" }] });
  await save(db, owner, edition, "rules", { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "net", allowancePercent: 85 });
  await save(db, owner, edition, "branding", { primary: "#1f4e9c", secondary: "#ffffff", accent: "#d4a017" });
  await save(db, owner, edition, "media", { mode: "device_external", links: [{ label: "Highlights", url: "https://youtube.com/@texascup" }] });
  if (options.site) await save(db, owner, edition, "website", options.site);
  if (options.publish !== false) await db.query("select set_edition_published($1, $2, true)", [owner, edition]);
  return { owner, edition, slug };
}

const site = async (db: PGlite, slug: string, year: number, viewer: string | null = null) =>
  (await db.query<{ s: PublicTournament | null }>("select get_public_tournament_site($1, $2, $3) as s", [slug, year, viewer])).rows[0].s;

test("a published public tournament is visible to everyone — and exposes only public data", async () => {
  const db = await database();
  try {
    await texasCup(db);
    const t = await site(db, "texas-cup", 2027);
    assert.ok(t);
    assert.equal(t.tournament.name, "Texas Cup");
    assert.deepEqual(t.teams.map((team) => [team.ref, team.name, team.color]), [["t1", "Blue", "#1f4e9c"], ["t2", "Gold", "#d4a017"]]);
    assert.deepEqual(t.players.map((p) => [p.name, p.teamRef, p.captain]), [["Ann Lee", "t1", true], ["Bo Diaz", "t1", false], ["Cy Park", "t2", false], ["Di Moss", "t2", false]]);
    assert.equal(t.rounds[0].courseRef, "c1");
    const json = JSON.stringify(t);
    assert.ok(!json.includes("@secret.example") && !json.includes("golfer0"), "no player emails");
    assert.ok(!/7\.3|8\.3|9\.3|10\.3/.test(json), "no handicaps (no public-consent setting yet)");
    assert.ok(!UUID.test(json), "no internal ids");
    // Players carry exactly these public fields (no email, handicap or ids).
    for (const player of t.players) assert.deepEqual(Object.keys(player).sort(), ["captain", "name", "ref", "teamRef"]);
    for (const key of ["email", "entitlements", "plan", "profileId", "createdBy", "organization", "access", "rating", "slope", "id", "publishedAt"]) {
      assert.ok(!new RegExp(`"${key}"`).test(json), `no "${key}" field`);
    }
  } finally { await db.close(); }
});

test("unpublished and test-season editions are hidden from everyone, including their organizer", async () => {
  const db = await database();
  try {
    const { owner, edition } = await texasCup(db, "public", { publish: false });
    assert.equal(await site(db, "texas-cup", 2027), null);
    assert.equal(await site(db, "texas-cup", 2027, owner), null);
    await db.query("select set_edition_published($1, $2, true)", [owner, edition]);
    assert.ok(await site(db, "texas-cup", 2027));
    await db.query("select set_edition_published($1, $2, false)", [owner, edition]);
    assert.equal(await site(db, "texas-cup", 2027), null, "unpublishing takes it down again");
    await db.query("update tournament_editions set published_at = now(), is_test = true where id = $1", [edition]);
    assert.equal(await site(db, "texas-cup", 2027), null, "test seasons are never public");
  } finally { await db.close(); }
});

test("private: members and admins only; everyone else gets exactly what a missing tournament gets", async () => {
  const db = await database();
  try {
    const { owner } = await texasCup(db, "private");
    const stranger = await profile(db, "stranger");
    const player = await profile(db, "player");
    const admin = await profile(db, "admin", { admin: true });
    const tid = (await db.query<{ id: string }>("select id from tournaments where slug = 'texas-cup'")).rows[0].id;
    await db.query("insert into tournament_members(tournament_id, profile_id, role) values ($1, $2, 'player')", [tid, player]);
    assert.equal(await site(db, "texas-cup", 2027), null);
    assert.equal(await site(db, "texas-cup", 2027, stranger), null);
    assert.equal(await site(db, "no-such-cup", 2027, stranger), null, "same answer as a tournament that doesn't exist");
    for (const viewer of [owner, player, admin]) assert.ok(await site(db, "texas-cup", 2027, viewer));
    assert.deepEqual((await db.query<{ y: number[] }>("select get_public_tournament_years('texas-cup', null) y")).rows[0].y, []);
    assert.deepEqual((await db.query<{ y: number[] }>("select get_public_tournament_years('texas-cup', $1) y", [player])).rows[0].y, [2027]);
    assert.deepEqual(robotsFor("private"), { index: false, follow: false });
  } finally { await db.close(); }
});

test("unlisted: open by direct link, but kept out of search engines", async () => {
  const db = await database();
  try {
    await texasCup(db, "unlisted");
    const t = await site(db, "texas-cup", 2027);
    assert.equal(t?.tournament.visibility, "unlisted");
    assert.deepEqual(robotsFor("unlisted"), { index: false, follow: false });
    assert.deepEqual(robotsFor("public"), { index: true, follow: true });
  } finally { await db.close(); }
});

test("one tournament never leaks into another; a wrong year or slug resolves nothing; The Maroon is never served", async () => {
  const db = await database();
  try {
    await texasCup(db);
    await texasCup(db, "public", { slug: "other-cup", name: "Other Cup" });
    const texas = JSON.stringify(await site(db, "texas-cup", 2027));
    const other = JSON.stringify(await site(db, "other-cup", 2027));
    assert.ok(!texas.includes("other-cup") && !texas.includes("Other Cup"));
    assert.ok(other.includes("(other-cup)") && !other.includes('"Ann Lee"'));
    assert.equal(await site(db, "texas-cup", 2026), null);
    assert.equal(await site(db, "Texas-Cup", 2027), null);
    // The founding tournament keeps its own site: even if marked published, /t never serves it.
    await db.exec("update tournament_editions set published_at = now() where tournament_id = (select id from tournaments where is_legacy) and season_year = 2027");
    assert.equal(await site(db, "the-maroon-tournament", 2027), null);
    assert.deepEqual((await db.query<{ y: number[] }>("select get_public_tournament_years('the-maroon-tournament', null) y")).rows[0].y, []);
    // The loader never reads live-scoring tables.
    const body = (await db.query<{ d: string }>("select pg_get_functiondef('public.get_public_tournament_site(text,integer,uuid)'::regprocedure) d")).rows[0].d;
    assert.ok(!/live_|career_|broadcast_/.test(body));
  } finally { await db.close(); }
});

test("the site renders Texas Cup's own Blue/Gold branding, no Maroon, and honest holding states before live scoring", async () => {
  const db = await database();
  try {
    await texasCup(db);
    const t = (await site(db, "texas-cup", 2027))!;
    const data = toSiteData(t);
    const links = publicSiteLinks("texas-cup", 2027, publicPages(t.site));
    const home = renderToStaticMarkup(<TournamentSite data={data} page="home" links={links} />);
    for (const text of ["Texas Cup 2027", "Blue", "Gold", "--ts-primary:#1f4e9c", "--ts-accent:#d4a017", "Horseshoe Bay, TX", "April 15–17, 2027", SCORING_NOTICE, "Highlights", "https://youtube.com/@texascup"]) {
      assert.ok(home.includes(text), `home shows ${text}`);
    }
    for (const text of ["Maroon", "White", "DEFENDING", "#500001", "POINTS"]) assert.ok(!home.includes(text), `home must not show ${text}`);
    assert.ok(home.includes('href="/t/texas-cup/2027/schedule"') && home.includes('href="/t/texas-cup/2027/information"'));
    for (const page of ["leaderboard", "matches", "results"] as const) {
      const html = renderToStaticMarkup(<TournamentSite data={data} page={page} links={links} />);
      assert.ok(html.includes("Locked") && html.includes(SCORING_NOTICE), `${page} is an honest holding state`);
      assert.ok(!/<table/.test(html), `${page} shows no standings table`);
    }
    const schedule = renderToStaticMarkup(<TournamentSite data={data} page="schedule" links={links} />);
    for (const text of ["Thursday · April 15", "Round 1 · Morning", "Fourball", "8:30 AM", "Shotgun · 1:00 PM", "Horseshoe Bay Summit"]) assert.ok(schedule.includes(text), `schedule shows ${text}`);
    const info = renderToStaticMarkup(<TournamentSite data={data} page="information" links={links} />);
    for (const text of ["Tournament information", "Net · 85% allowance", "Team match play · Blue vs Gold", "4 players · 2 teams"]) assert.ok(info.includes(text), `info shows ${text}`);
  } finally { await db.close(); }
});

test("Website settings hide sections from navigation, direct URLs, and the data itself", async () => {
  const db = await database();
  try {
    await texasCup(db, "public", { site: { players: false, courses: false, leaderboard: false, media: false } });
    const t = (await site(db, "texas-cup", 2027))!;
    const pages = publicPages(t.site);
    assert.deepEqual(pages, ["home", "schedule", "teams", "matches", "results", "information"]);
    for (const hidden of ["players", "courses", "leaderboard"]) assert.equal(isPublicPage(hidden, t.site), false, `${hidden} direct URL is refused`);
    assert.equal(isPublicPage("home", t.site), false, "home is the bare URL, not /home");
    assert.equal(isPublicPage("admin", t.site), false);
    const data = toSiteData(t);
    assert.deepEqual([data.players.length, data.courses.length, data.mediaLinks?.length], [0, 0, 0]);
    const html = renderToStaticMarkup(<TournamentSite data={data} page="home" links={publicSiteLinks("texas-cup", 2027, pages)} />);
    for (const href of ["/players", "/courses", "/leaderboard"]) assert.ok(!html.includes(`href="/t/texas-cup/2027${href}"`), `${href} not in nav`);
    assert.ok(!html.includes("Horseshoe Bay Summit") && !html.includes("Highlights"));
  } finally { await db.close(); }
});

test("each tournament wears its own branding; missing branding is neutral, never The Maroon's", async () => {
  const db = await database();
  try {
    await texasCup(db);
    const owner = await profile(db, "plain", { approved: true });
    const edition = await createTournament(db, owner, { ...quick, name: "Plain Cup", slug: "plain-cup", visibility: "public", competitionType: "teams", teamNames: ["North", "South"] });
    await db.query("select set_edition_published($1, $2, true)", [owner, edition]);
    const plain = toSiteData((await site(db, "plain-cup", 2027))!);
    assert.deepEqual([plain.branding.primary, plain.branding.accent], ["#1f2937", "#9ca3af"]);
    assert.equal(plain.dates, "Dates to be announced");
    const texas = toSiteData((await site(db, "texas-cup", 2027))!);
    assert.equal(texas.branding.primary, "#1f4e9c");
    const html = renderToStaticMarkup(<TournamentSite data={plain} page="home" links={{ home: "/t/plain-cup/2027" }} />);
    // Texas Cup's own gold accent never appears on another tournament's site; nor does The Maroon's maroon.
    assert.ok(html.includes("--ts-primary:#1f2937") && !html.includes("#d4a017") && !html.includes("#500001"));
  } finally { await db.close(); }
});
