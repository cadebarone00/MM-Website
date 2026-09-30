import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { texasCup, coastalOpen } from "./fixtures.ts";
import { TournamentSite, TournamentTeams } from "./pages.tsx";
import { MatchPreview, PlayerGrid, TeamScoreSummary, TournamentStatusBanner } from "./components.tsx";
import { imageSource, luminance, readableText, themeVariables } from "./theme.ts";
import { SITE_PAGES, type SiteLinks } from "./types.ts";
const links = Object.fromEntries(SITE_PAGES.map(page => [page, `#${page}`])) as SiteLinks;
const render = renderToStaticMarkup;

test("fixture and branding are independent of founding tournament", () => {
  assert.equal(texasCup.players.length, 16);
  assert.equal(texasCup.days.length, 3);
  const html = render(<TournamentSite data={texasCup} page="home" links={links} />);
  for (const text of ["Texas Cup 2027", "Blue", "Gold", "--ts-primary:#123e67", "Upcoming matches", "Latest results"]) assert.ok(html.includes(text));
  const theme = themeVariables({ ...texasCup.branding, primary: "#ffffff" });
  assert.equal((theme as Record<string, string>)["--ts-on-primary"], "#000000");
  const renamed = render(<TeamScoreSummary teams={[{ id: "a", name: "Ivory Oaks", color: "#ffffff", points: 0 }, { id: "b", name: "Copper Foxes", color: "#92512a", points: 1 }]} />);
  assert.ok(renamed.includes("Ivory Oaks") && renamed.includes("Copper Foxes"));
});

test("readable team text meets 4.5 contrast for six-digit colors", () => {
  for (const color of ["#ffffff", "#fffdee", "#ecd17e", "#174e85", "#777777", "#000000"]) {
    const text = readableText(color);
    const ratio = (Math.max(luminance(text), luminance(color)) + .05) / (Math.min(luminance(text), luminance(color)) + .05);
    assert.ok(ratio >= 4.5, `${color}: ${ratio}`);
  }
  assert.equal(readableText("#ffffff"), "#000000");
  assert.equal(imageSource("javascript:alert(1)"), undefined);
  assert.equal(imageSource("//tracking.invalid/image"), undefined);
});

test("all match states render, completed matches never show Thru 18", () => {
  for (const match of texasCup.matches) {
    const html = render(<MatchPreview match={match} teams={texasCup.teams} players={texasCup.players} />);
    const expected = { final: "Final", live: "Live", scheduled: "Scheduled", waiting: "Waiting on Pairings" }[match.status];
    assert.ok(html.includes(expected));
    if (match.status === "final") assert.ok(!html.includes("Thru 18"));
  }
  for (const status of ["draft", "scheduled", "live", "final", "archived"] as const) assert.ok(render(<TournamentStatusBanner status={status} />).includes(`data-state="${status}"`));
});

test("team and individual concepts differ; private handicap never renders", () => {
  const individual = render(<TournamentSite data={coastalOpen} page="leaderboard" links={links} />);
  assert.ok(individual.includes("Individual standings"));
  assert.ok(!individual.includes("Team standings") && !individual.includes("Thru 18"));
  assert.ok(render(<TournamentTeams data={coastalOpen} />).includes("An individual championship"));
  const players = render(<PlayerGrid players={coastalOpen.players} teams={[]} />);
  assert.ok(players.includes("3.2") && !players.includes("9.7"));
  assert.ok(render(<TournamentSite data={coastalOpen} page="results" links={links} />).includes("Morgan Lake wins"));
});

test("all page concepts render semantic navigation and one main heading", () => {
  for (const page of SITE_PAGES) {
    const html = render(<TournamentSite data={texasCup} page={page} links={links} />);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
    assert.ok(html.includes('aria-label="Tournament pages"'));
    assert.ok(html.includes('aria-current="page"'));
    assert.ok(html.includes("Skip to tournament content"));
  }
});

test("presentation source has no founding-team assumptions or data-service imports", () => {
  const directory = join(process.cwd(), "components/platform/tournament-site");
  for (const name of readdirSync(directory).filter(name => /\.(tsx?|css)$/.test(name) && !name.includes(".test."))) {
    const source = readFileSync(join(directory, name), "utf8");
    assert.ok(!/\bmaroon\b|\bMaroon\b|\bWhite\b|supabase|editionScope|fetch\(/.test(source), name);
  }
});
