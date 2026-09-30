import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPlayDemoEnabled, loadPlayDemo, PLAY_DEMO_BASE } from "./playDemo.ts";
import { buildPlayDemo } from "./playDemoFixture.ts";
import { findYourMatch, parTone, positionLabel, tabPath } from "./tournamentHome.ts";

const isNotFound = (error: unknown) => String((error as { digest?: unknown })?.digest ?? "").includes("404");

test("the demo is on only with NODE_ENV=development AND DEV_PLAY_DEMO=true", () => {
  assert.equal(isPlayDemoEnabled({ NODE_ENV: "development", DEV_PLAY_DEMO: "true" }), true);
  assert.equal(isPlayDemoEnabled({ NODE_ENV: "development" }), false, "flag missing");
  for (const flag of ["", "1", "TRUE", "yes", "false"]) assert.equal(isPlayDemoEnabled({ NODE_ENV: "development", DEV_PLAY_DEMO: flag }), false, `flag ${flag}`);
  for (const env of ["production", "test", undefined]) assert.equal(isPlayDemoEnabled({ NODE_ENV: env, DEV_PLAY_DEMO: "true" }), false, `NODE_ENV ${env}`);
});

test("loadPlayDemo returns the fixture when enabled and is a 404 otherwise", async () => {
  const home = await loadPlayDemo({ NODE_ENV: "development", DEV_PLAY_DEMO: "true" });
  assert.equal(home.demo, true);
  assert.equal(home.site.branding.name, "Maroon Masters 2027");
  for (const env of [{ NODE_ENV: "development" }, { NODE_ENV: "production", DEV_PLAY_DEMO: "true" }, { NODE_ENV: "test", DEV_PLAY_DEMO: "true" }, {}]) {
    await assert.rejects(loadPlayDemo(env), (error) => isNotFound(error), JSON.stringify(env));
  }
});

test("the fixture is complete, self-consistent and never links into real routes", () => {
  const home = buildPlayDemo();
  const { site } = home;
  assert.equal(site.players.length, 12);
  for (const team of ["maroon", "white"]) assert.equal(site.players.filter((p) => p.teamId === team).length, 6, team);
  const ids = new Set(site.players.map((p) => p.id));
  for (const match of site.matches) for (const id of [...match.sideA.players, ...match.sideB.players]) assert.ok(ids.has(id), `${match.id} → ${id}`);
  for (const standing of site.standings) assert.ok(ids.has(standing.playerId), standing.playerId);
  for (const status of ["live", "final", "scheduled"]) assert.ok(site.matches.some((m) => m.status === status), status);
  for (const format of ["Fourball", "Alternate Shot", "Singles"]) assert.ok(site.matches.some((m) => m.format === format), format);
  assert.ok(site.matches.some((m) => /All Square/.test(m.result ?? "")) && site.matches.some((m) => /Up/.test(m.result ?? "")) && site.matches.some((m) => /Down/.test(m.result ?? "")));
  assert.deepEqual(new Set(site.standings.map((s) => parTone(s.score))), new Set(["under", "even", "over"]));
  const sessions = new Set(site.days.flatMap((d) => d.sessions.map((s) => s.id)));
  for (const [match, session] of Object.entries(home.matchSessions)) assert.ok(sessions.has(session), `${match} → ${session}`);

  const yours = findYourMatch(home);
  assert.ok(yours, "your match resolves");
  assert.deepEqual(yours.mine.players, ["cade", "nate"]);
  assert.equal(yours.match.status, "live");
  assert.equal(yours.session?.id, "r3");

  const announcements = home.feed?.activity.filter((a) => a.type === "commissioner_announcement") ?? [];
  assert.ok(announcements.some((a) => a.visibility === "everyone") && announcements.some((a) => a.visibility === "players_only"));
  assert.ok(home.feed?.activity.some((a) => a.type !== "commissioner_announcement"));

  // Stays inside the demo: no real /play, Studio, API or public-site links, and posting is off.
  assert.equal(home.basePath, PLAY_DEMO_BASE);
  assert.equal(home.announcementsUrl, null);
  assert.equal(home.links.website, null);
  assert.equal(home.links.commissioner, null);
  assert.ok(home.links.allTournaments.startsWith(PLAY_DEMO_BASE));
  for (const tab of ["home", "matches", "leaderboard", "players", "more"] as const) assert.ok(tabPath(home.basePath, tab).startsWith("/dev/play"));
});

test("golf-style positions and par tones", () => {
  assert.equal(positionLabel(3, [1, 2, 3, 3, 5]), "T3");
  assert.equal(positionLabel(2, [1, 2, 3, 3, 5]), "2");
  assert.deepEqual(["-4", "E", "+2"].map(parTone), ["under", "even", "over"]);
});

// --- Production protection: the demo cannot reach or loosen the real /play path. ---

const read = (path: string) => readFileSync(path, "utf8");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === "node_modules" || name.startsWith(".") ? [] : files(path)) : /\.(ts|tsx|mts)$/.test(name) ? [path.replaceAll("\\", "/")] : [];
  });
}

test("the real /play loader still requires a signed-in user before loading anything, and knows nothing of the demo", () => {
  const source = read("lib/platform/tournamentHomeServer.ts");
  const guard = source.indexOf('if (!user) redirect("/login");');
  assert.ok(guard > 0, "redirects signed-out visitors to /login");
  assert.ok(guard < source.indexOf("loadPublicTournament(slug"), "the auth check comes before any tournament data is loaded");
  assert.ok(source.indexOf(".auth.getUser()") < guard, "the user comes from the session");
  for (const word of ["playDemo", "DEV_PLAY_DEMO", "NODE_ENV", "Fixture", "demo: true"]) assert.ok(!source.includes(word), `real loader must not mention ${word}`);
  assert.match(source, /demo: false/);
  assert.match(source, /yourMatch: null/);
  for (const page of files("app/play")) {
    const text = read(page);
    assert.match(text, /loadTournamentHome\(/, `${page} uses the real loader`);
    assert.ok(!/playDemo/.test(text), `${page} must not use the demo`);
  }
});

test("only the /dev/play routes use the demo, and every one of them goes through the gate", () => {
  const demoPages = files("app/dev/play");
  assert.deepEqual(demoPages.map((p) => p.replace("app/dev/play", "")).sort(), ["/leaderboard/page.tsx", "/matches/page.tsx", "/more/page.tsx", "/page.tsx", "/players/page.tsx"]);
  for (const page of demoPages) {
    const text = read(page);
    assert.match(text, /await loadPlayDemo\(\)/, `${page} is gated`);
    assert.ok(!/playDemoFixture|tournamentHomeServer|supabase/i.test(text), `${page} must not reach the fixture directly, the real loader or Supabase`);
  }
  const allowed = new Set(["lib/platform/playDemo.ts", "lib/platform/playDemoFixture.ts", "lib/platform/playDemo.test.ts", ...demoPages]);
  for (const file of [...files("app"), ...files("components"), ...files("lib")]) {
    if (allowed.has(file)) continue;
    assert.ok(!/from ["'][^"']*playDemo(Fixture)?(\.ts)?["']/.test(read(file)), `${file} must not import the demo`);
  }
});
