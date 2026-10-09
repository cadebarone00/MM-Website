import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { PGlite } from "@electric-sql/pglite";
import { TournamentSiteView } from "@/components/platform/PublicTournamentPage";
import { previewBasePath, publicBasePath, type PublicTournament } from "./publicSite.ts";
import { createTournament, database, load, profile, protectedSnapshot, quick, save, sqlFile } from "./testDatabase.ts";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
type Preview = { site: PublicTournament; published: boolean };

const preview = async (db: PGlite, who: string, edition: string) =>
  (await db.query<{ p: Preview }>("select get_tournament_site_preview($1, $2) as p", [who, edition])).rows[0].p;
const publicSite = async (db: PGlite, viewer: string | null = null) =>
  (await db.query<{ s: PublicTournament | null }>("select get_public_tournament_site('texas-cup', 2027, $1) as s", [viewer])).rows[0].s;

/** Texas Cup, set up but NOT published (private, the default). */
async function unpublishedTexasCup(db: PGlite) {
  const owner = await profile(db, "owner", { approved: true });
  const edition = await createTournament(db, owner, { ...quick, competitionType: "teams", teamNames: ["Blue", "Gold"] });
  let s = await load(db, owner, edition);
  await save(db, owner, edition, "basics", { name: "Texas Cup", shortName: "Texas Cup", description: "Blue vs Gold.", destination: "Horseshoe Bay, TX",
    startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility: "private" });
  s = await save(db, owner, edition, "teams", { competitionType: "teams", teams: [{ id: s.teams[0].id, name: "Blue", color: "#1f4e9c" }, { id: s.teams[1].id, name: "Gold", color: "#d4a017" }] });
  s = await save(db, owner, edition, "players", { players: [{ name: "Ann Lee", email: "ann@secret.example", handicap: 7.3, teamKey: s.teams[0].key }, { name: "Cy Park", email: "cy@secret.example", teamKey: s.teams[1].key }] });
  s = await save(db, owner, edition, "courses", { courses: [{ name: "Horseshoe Bay Summit", state: "TX", par: 72, yards: 6800 }] });
  await save(db, owner, edition, "rounds", { rounds: [{ day: 1, format: "Fourball", courseId: s.courses[0].id }] });
  await save(db, owner, edition, "branding", { primary: "#1f4e9c", secondary: "#ffffff", accent: "#d4a017" });
  return { owner, edition };
}

test("the owner, organizers and admins can preview an unpublished tournament; the public URL stays hidden", async () => {
  const db = await database();
  try {
    const { owner, edition } = await unpublishedTexasCup(db);
    const organizer = await profile(db, "cohost");
    const admin = await profile(db, "admin", { admin: true });
    const tid = (await db.query<{ id: string }>("select tournament_id id from tournament_editions where id = $1", [edition])).rows[0].id;
    await db.query("insert into tournament_members(tournament_id, profile_id, role) values ($1, $2, 'organizer')", [tid, organizer]);
    for (const who of [owner, organizer, admin]) {
      const p = await preview(db, who, edition);
      assert.equal(p.published, false);
      assert.equal(p.site.tournament.name, "Texas Cup");
      assert.deepEqual(p.site.teams.map((t) => [t.name, t.color]), [["Blue", "#1f4e9c"], ["Gold", "#d4a017"]]);
    }
    assert.equal(await publicSite(db), null, "public URL: still not found");
    assert.equal(await publicSite(db, owner), null, "public URL: not found even for the owner until published");
  } finally { await db.close(); }
});

test("strangers, players and other tournaments' owners can't preview; The Maroon can't be previewed here", async () => {
  const db = await database();
  try {
    const { edition } = await unpublishedTexasCup(db);
    const stranger = await profile(db, "stranger");
    const player = await profile(db, "player");
    const otherOwner = await profile(db, "other", { approved: true });
    await createTournament(db, otherOwner, { ...quick, name: "Other Cup", slug: "other-cup" });
    const tid = (await db.query<{ id: string }>("select tournament_id id from tournament_editions where id = $1", [edition])).rows[0].id;
    await db.query("insert into tournament_players(tournament_id, display_name, profile_id) values ($1, 'Player', $2)", [tid, player]); // a claimed tournament player
    for (const who of [stranger, player, otherOwner]) {
      await assert.rejects(preview(db, who, edition), (e: { code?: string }) => e.code === "42501");
    }
    const host = await profile(db, "host", { host: true });
    await db.exec(sqlFile("platform_foundation.sql")); // makes the host an owner of The Maroon Tournament
    const maroon = (await db.query<{ id: string }>("select e.id from tournament_editions e join tournaments t on t.id = e.tournament_id where t.is_legacy and e.season_year = 2027")).rows[0].id;
    await assert.rejects(preview(db, host, maroon), /managed in the Admin Center/);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select get_tournament_site_preview($1, $2)", [host, edition]), /permission denied/);
      await assert.rejects(db.query("select tournament_site_projection($1)", [edition]), /permission denied/);
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});

test("the preview shows exactly what visitors will see — same data, same components, no private fields, nothing live touched", async () => {
  const db = await database();
  try {
    const before = await protectedSnapshot(db);
    const { owner, edition } = await unpublishedTexasCup(db);
    const p = await preview(db, owner, edition);
    const json = JSON.stringify(p);
    assert.ok(!json.includes("@secret.example") && !json.includes("7.3") && !UUID.test(json), "no emails, handicaps or ids");
    for (const key of ["email", "entitlements", "organization", "access", "profileId", "createdBy", "id"]) assert.ok(!new RegExp(`"${key}"`).test(json), `no "${key}"`);

    await save(db, owner, edition, "basics", { name: "Texas Cup", shortName: "Texas Cup", description: "Blue vs Gold.", destination: "Horseshoe Bay, TX",
      startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility: "public" });
    await db.query("select set_edition_published($1, $2, true)", [owner, edition]);
    const published = await preview(db, owner, edition);
    const pub = await publicSite(db);
    assert.equal(published.published, true);
    assert.deepEqual(published.site, pub, "preview data === public data");

    // Same component, same markup — only the link base differs.
    for (const section of [undefined, "schedule", "teams", "players", "courses", "information", "leaderboard"]) {
      const previewHtml = renderToStaticMarkup(<TournamentSiteView tournament={published.site} section={section} basePath={previewBasePath("texas-cup", 2027)} />);
      const publicHtml = renderToStaticMarkup(<TournamentSiteView tournament={pub!} section={section} basePath={publicBasePath("texas-cup", 2027)} />);
      assert.equal(previewHtml.replaceAll("/tournaments/texas-cup/2027/preview", "/t/texas-cup/2027"), publicHtml, `${section ?? "home"} identical`);
      assert.ok(!previewHtml.includes('href="/t/texas-cup/2027'), "preview navigation stays inside the preview");
    }
    const body = (await db.query<{ d: string }>("select pg_get_functiondef('public.tournament_site_projection(uuid)'::regprocedure) || pg_get_functiondef('public.get_tournament_site_preview(uuid,uuid)'::regprocedure) d")).rows[0].d;
    assert.ok(!/live_|career_|broadcast_/.test(body), "never reads live-scoring tables");
    assert.deepEqual(await protectedSnapshot(db), before, "no live-scoring or Maroon rows changed");
  } finally { await db.close(); }
});

test("an incomplete tournament previews with empty states, and disabled sections behave exactly as on the public site", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "fresh", { approved: true });
    const edition = await createTournament(db, owner, { ...quick, name: "Fresh Cup", slug: "fresh-cup" });
    const fresh = (await preview(db, owner, edition)).site;
    const home = renderToStaticMarkup(<TournamentSiteView tournament={fresh} basePath={previewBasePath("fresh-cup", 2027)} />);
    for (const text of ["Fresh Cup 2027", "Dates to be announced", "Locked"]) assert.ok(home.includes(text), `home shows ${text}`);
    assert.ok(!home.includes("#500001"), "no Maroon colors as a fallback");
    const players = renderToStaticMarkup(<TournamentSiteView tournament={fresh} section="players" basePath={previewBasePath("fresh-cup", 2027)} />);
    assert.ok(players.includes("The field is taking shape"));

    await save(db, owner, edition, "website", { players: false, courses: false });
    const limited = (await preview(db, owner, edition)).site;
    assert.throws(() => renderToStaticMarkup(<TournamentSiteView tournament={limited} section="players" basePath={previewBasePath("fresh-cup", 2027)} />), /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/, "disabled section is a 404 in preview too");
    const nav = renderToStaticMarkup(<TournamentSiteView tournament={limited} basePath={previewBasePath("fresh-cup", 2027)} />);
    assert.ok(!nav.includes("/preview/players") && !nav.includes("/preview/courses") && nav.includes("/preview/schedule"));
  } finally { await db.close(); }
});
