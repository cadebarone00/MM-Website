import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSchemeCss, COLOR_SCHEMES, colorFamily, colorScheme, hexToOklch, oklchToHex, schemeAttribute, schemeColor } from "./colorSchemes.ts";
import { contrastRatio } from "./tournamentTheme.ts";
import { preferenceChangeFromBody, preferencesFromRow } from "../profile/preferences.ts";

const globals = readFileSync("app/globals.css", "utf8");

test("app/color-schemes.css is up to date (run `npm run build:schemes` after changing globals.css or a scheme)", () => {
  assert.equal(readFileSync("app/color-schemes.css", "utf8"), buildSchemeCss(globals));
});

test("The Maroon is the default and needs no attribute; unknown values fall back to it", () => {
  assert.equal(colorScheme(undefined), "maroon");
  assert.equal(colorScheme("purple"), "maroon");
  assert.equal(schemeAttribute("maroon"), undefined);
  assert.equal(schemeAttribute("green"), "green");
  assert.doesNotMatch(buildSchemeCss(globals), /data-scheme="maroon"/);
});

test("colour maths round-trips; each scheme's reference colours land on its own", () => {
  for (const hex of ["#500001", "#fbf8f1", "#b8945a", "#240001", "#ffffff", "#000000"]) assert.equal(oklchToHex(hexToOklch(hex)), hex);
  for (const scheme of COLOR_SCHEMES) for (const family of ["deep", "accent", "paper"] as const) {
    const lightness = (hex: string) => hexToOklch(hex).l;
    const mapped = schemeColor(COLOR_SCHEMES[0][family], family, scheme);
    assert.ok(Math.abs(lightness(mapped) - lightness(COLOR_SCHEMES[0][family])) < 0.01, `${scheme.name} ${family} keeps lightness`);
  }
});

test("only maroon / gold / cream roles change; greys, greens and score colours are left alone", () => {
  assert.equal(colorFamily("--lm-bg-111111", "#111111"), null);
  assert.equal(colorFamily("--lm-ink-a7d6a6", "#a7d6a6"), null);
  assert.equal(colorFamily("--lm-ink-ffb4b4", "#ffb4b4"), null);
  assert.equal(colorFamily("--lm-bg-240001", "#240001"), "deep");
  assert.equal(colorFamily("--lm-ink-d6b85c", "#d6b85c"), "accent");
  assert.equal(colorFamily("--color-cream-50", "#fbf8f1"), "paper");
  const css = buildSchemeCss(globals);
  for (const untouched of ["--color-score-", "--color-ink-", "--color-fairway-"]) assert.doesNotMatch(css, new RegExp(untouched));
});

test("every scheme keeps text as readable as The Maroon (lightness is kept)", () => {
  const pairs: [string, string][] = [["#fbf8f1", "#240001"], ["#fbf8f1", "#500001"], ["#f4efe6", "#1d0b11"], ["#765018", "#fbf8f1"], ["#d6b85c", "#240001"]];
  for (const scheme of COLOR_SCHEMES) for (const [a, b] of pairs) {
    const original = contrastRatio(a, b);
    const recoloured = contrastRatio(schemeColor(a, colorFamily("", a)!, scheme), schemeColor(b, colorFamily("", b)!, scheme));
    assert.ok(recoloured >= Math.min(4.5, original * 0.85), `${scheme.name}: ${a} on ${b} ${recoloured.toFixed(2)} (Maroon ${original.toFixed(2)})`);
  }
});

test("each scheme twin is one step more specific, and light mode still beats dark", () => {
  const css = buildSchemeCss(globals);
  assert.match(css, /html\[data-scheme="green"\]\{--color-maroon-900:/);
  assert.match(css, /html\[data-scheme="green"\]\[data-mode="light"\], html\[data-scheme="green"\] \.profile-body\{/);
  assert.ok(css.indexOf('html[data-scheme="green"]{--lm-bg-') < css.indexOf('html[data-scheme="green"][data-mode="light"], '));
});

test("colour scheme is a saved preference: read back with The Maroon as default, odd values refused", () => {
  assert.equal(preferencesFromRow({}).colorScheme, "maroon");
  assert.equal(preferencesFromRow({ color_scheme: "navy" }).colorScheme, "navy");
  assert.deepEqual(preferenceChangeFromBody({ colorScheme: "desert" }), { ok: true, change: { colorScheme: "desert" } });
  assert.equal(preferenceChangeFromBody({ colorScheme: "pink" }).ok, false);
});
