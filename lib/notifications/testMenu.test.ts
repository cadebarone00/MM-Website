import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_HIGHLIGHTS } from "../highlights/builtIn.ts";
import { testMenu, testWords } from "./testMenu.ts";

test("the menu lists the app's types and every highlight trigger", () => {
  const menu = testMenu(BUILT_IN_HIGHLIGHTS);
  const ids = menu.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(ids.includes("catalog:friendRequest"));
  assert.ok(ids.includes("catalog:teeTime"));
  assert.ok(!ids.includes("catalog:highlight"), "sheet types come through the highlights");
  assert.ok(ids.includes("hl:HL-001-C01"));
  assert.equal(ids.filter((id) => id.startsWith("hl:")).length, 88, "every trigger in the sheet");
  assert.equal(menu.find((g) => g.title === "Friend requests")?.items[0].versions, 3);
});

test("a test picks one of the wordings at random and fills every blank", () => {
  const first = testWords("catalog:friendRequest", null, () => 0)!;
  const last = testWords("catalog:friendRequest", null, () => 0.99)!;
  assert.notDeepEqual(first, last);
  assert.match(first.title, /Collin Ross/);
  const streak = testWords("hl:HL-001-C01", BUILT_IN_HIGHLIGHTS, () => 0)!;
  assert.match(`${streak.title} ${streak.body}`, /Alex/);
  assert.doesNotMatch(`${streak.title} ${streak.body}`, /\{/);
  assert.equal(testWords("hl:nope", BUILT_IN_HIGHLIGHTS), null);
  assert.equal(testWords("bogus", null), null);
});
