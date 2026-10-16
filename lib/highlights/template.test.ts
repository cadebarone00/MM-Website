import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTemplate, renderTemplate } from "./template.ts";

test("fills every placeholder, keeps emoji, allows repeats and numbers", () => {
  assert.deepEqual(renderTemplate("{player}'s heating up! 🔥 {count} for {player}", { player: "Cam", count: 4 }), { ok: true, text: "Cam's heating up! 🔥 4 for Cam" });
  assert.deepEqual(renderTemplate("Tied at the top!", {}), { ok: true, text: "Tied at the top!" });
  assert.deepEqual(renderTemplate("{ player } on No. {hole}", { player: "Cade", hole: 12 }), { ok: true, text: "Cade on No. 12" });
});

test("refuses to half-render when a value is missing or blank", () => {
  assert.deepEqual(renderTemplate("{player} makes eagle on No. {hole}.", { player: "Cam" }), { ok: false, missing: ["hole"], problems: [] });
  assert.deepEqual(renderTemplate("{player}", { player: "  " }), { ok: false, missing: ["player"], problems: [] });
});

test("rejects unknown variables and stray braces", () => {
  const unknown = renderTemplate("{name} wins", { player: "Cam" });
  assert.equal(unknown.ok, false);
  assert.deepEqual(checkTemplate("{name} and {player}"), { variables: ["name", "player"], unknown: ["name"], problems: [] });
  assert.equal(checkTemplate("Cam {player").problems.length, 1);
  assert.equal(checkTemplate("Cam player}").problems.length, 1);
  assert.equal(checkTemplate("{{player}}").problems.length, 1);
  assert.deepEqual(checkTemplate("Empty {}").problems, ["Has an empty {} placeholder."]);
  assert.deepEqual(checkTemplate("Empty {}").variables, []);
});
