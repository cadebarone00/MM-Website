import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { database, sqlFile } from "../platform/testDatabase.ts";
import {
  MAROON_THEME_PRESET, NEUTRAL_TEAM_COLOR, SYSTEM_DEFAULT_THEME, contrastRatio, isHexColor, readableTextOn,
  resolveTournamentTheme, themeCssVariables,
} from "./tournamentTheme.ts";

test("text on any background meets WCAG AA (4.5:1) and picks the better of black/white", () => {
  const backgrounds = { white: "#ffffff", cream: "#f7f4ee", maroon: "#500001", gold: "#d6a75c", paleYellow: "#fffdee", black: "#000000", grey: "#777777" };
  for (const [name, color] of Object.entries(backgrounds)) {
    const text = readableTextOn(color);
    const other = text === "#000000" ? "#ffffff" : "#000000";
    assert.ok(contrastRatio(color, text) >= 4.5, `${name}: ${contrastRatio(color, text)}`);
    assert.ok(contrastRatio(color, text) >= contrastRatio(color, other), name);
  }
  assert.equal(readableTextOn("#500001"), "#ffffff");
  assert.equal(readableTextOn("#f7f4ee"), "#000000");
  assert.equal(readableTextOn("#d6a75c"), "#000000");
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
});

test("invalid or missing colors fall back to the system default, never The Maroon", () => {
  for (const value of ["red", "#fff", "#5000011", "", null, undefined, 42]) assert.equal(isHexColor(value), false);
  for (const branding of [null, undefined, {}, { primary: "nope", secondary: "#12", accent: 7 }]) {
    const { theme } = resolveTournamentTheme(branding);
    assert.deepEqual([theme.primary, theme.secondary, theme.accent], [SYSTEM_DEFAULT_THEME.primary, SYSTEM_DEFAULT_THEME.secondary, SYSTEM_DEFAULT_THEME.accent]);
    assert.notEqual(theme.primary, MAROON_THEME_PRESET.primary);
  }
  assert.equal(readableTextOn("not a color"), readableTextOn(SYSTEM_DEFAULT_THEME.primary));
  // A partly valid branding keeps its valid colors.
  assert.equal(resolveTournamentTheme({ primary: "#123e67", accent: "bad" }).theme.primary, "#123e67");
  assert.equal(resolveTournamentTheme({ primary: "#123e67", accent: "bad" }).theme.accent, SYSTEM_DEFAULT_THEME.accent);
});

test("individual event: no team tokens, nothing breaks", () => {
  const resolved = resolveTournamentTheme({ primary: "#123e67", secondary: "#ffffff", accent: "#d4a017" });
  assert.deepEqual(resolved.competition.teams, []);
  assert.equal(resolved.competition.team1, undefined);
  const variables = themeCssVariables(resolved);
  assert.deepEqual(Object.keys(variables).sort(), ["--theme-accent", "--theme-on-accent", "--theme-on-primary", "--theme-on-secondary", "--theme-primary", "--theme-secondary"]);
  assert.equal(variables["--theme-on-primary"], "#ffffff");
});

test("team events: team1/team2 tokens, any number of teams, bad team colors get the neutral team color", () => {
  const resolved = resolveTournamentTheme(MAROON_THEME_PRESET, MAROON_THEME_PRESET.teams);
  assert.deepEqual([resolved.competition.team1, resolved.competition.textOnTeam1], ["#500001", "#ffffff"]);
  assert.deepEqual([resolved.competition.team2, resolved.competition.textOnTeam2], ["#f7f4ee", "#000000"]);

  const three = resolveTournamentTheme(null, [{ id: "a", name: "A", color: "#174e85" }, { id: "b", name: "B", color: "#ecd17e" }, { id: "c", name: "C", color: "oops" }]);
  const variables = themeCssVariables(three);
  assert.equal(variables["--competition-team-3"], NEUTRAL_TEAM_COLOR);
  assert.equal(variables["--competition-on-team-3"], readableTextOn(NEUTRAL_TEAM_COLOR));
  assert.equal(variables["--competition-on-team-2"], "#000000");
  assert.equal(variables["--competition-team-4"], undefined);
});

test("maroon_theme_colors.sql sets exactly the Maroon preset and keeps other branding keys", async () => {
  const db = await database();
  try {
    await db.exec(`update tournaments set branding = branding || '{"logoUrl":"/logo.png"}'::jsonb where slug = 'the-maroon-tournament'`);
    await db.exec(sqlFile("maroon_theme_colors.sql"));
    await db.exec(sqlFile("maroon_theme_colors.sql")); // safe to re-run
    const { branding } = (await db.query<{ branding: Record<string, string> }>(`select branding from tournaments where slug = 'the-maroon-tournament'`)).rows[0];
    assert.deepEqual([branding.primary, branding.secondary, branding.accent], [MAROON_THEME_PRESET.primary, MAROON_THEME_PRESET.secondary, MAROON_THEME_PRESET.accent]);
    assert.equal(branding.logoUrl, "/logo.png");
    const teams = (await db.query<{ key: string; color: string }>(`select distinct et.key, et.color from edition_teams et
      join tournament_editions e on e.id = et.edition_id join tournaments t on t.id = e.tournament_id where t.slug = 'the-maroon-tournament' order by et.key`)).rows;
    const expected = Object.fromEntries(MAROON_THEME_PRESET.teams.map((team) => [team.id, team.color]));
    assert.deepEqual(teams, [{ key: "maroon", color: expected.maroon }, { key: "white", color: expected.white }]);
  } finally {
    await db.close();
  }
});

test("default and Maroon preset colors are defined only in lib/theme", () => {
  const owned = ["#1f2937", "#9ca3af", "#f7f4ee", "#d6a75c"];
  const offenders: string[] = [];
  for (const root of ["lib", "components", "app"]) {
    for (const entry of readdirSync(root, { recursive: true }) as string[]) {
      const path = join(root, entry);
      if (!/\.(ts|tsx|css)$/.test(path) || /\.test\.(ts|tsx)$/.test(path) || path.startsWith(join("lib", "theme"))) continue;
      const text = readFileSync(path, "utf8").toLowerCase();
      for (const hex of owned) if (text.includes(hex)) offenders.push(`${path}: ${hex}`);
    }
  }
  assert.deepEqual(offenders, []);
});
