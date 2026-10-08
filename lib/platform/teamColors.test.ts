import test from "node:test";
import assert from "node:assert/strict";
import { TEAM_COLORS, contrast, teamColor } from "./teamColors.ts";

test("every team color has lettering that reads well on it", () => {
  for (const color of TEAM_COLORS) assert.ok(contrast(color.base, color.text) >= 4.5, `${color.name}: ${contrast(color.base, color.text).toFixed(2)}`);
});

test("dark colors get white lettering, light colors dark lettering", () => {
  assert.equal(teamColor("navy")?.text, "#ffffff");
  assert.equal(teamColor("white")?.text, "#1a1a1a");
  assert.equal(teamColor("gold")?.text, "#1a1a1a");
});

test("each color has its own id and a secondary shade different from it", () => {
  assert.equal(new Set(TEAM_COLORS.map(color => color.id)).size, TEAM_COLORS.length);
  for (const color of TEAM_COLORS) assert.match(color.secondary, /^#[0-9a-f]{6}$/);
  for (const color of TEAM_COLORS) assert.notEqual(color.secondary, color.base);
  assert.equal(teamColor("nope"), undefined);
});
