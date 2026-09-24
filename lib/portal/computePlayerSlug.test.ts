import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlayerSlug } from "./computePlayerSlug";

test("kebab-cases a simple two-word name", () => {
  assert.equal(computePlayerSlug("John Smith"), "john-smith");
});

test("collapses extra whitespace between words", () => {
  assert.equal(computePlayerSlug("  John   Smith  "), "john-smith");
});

test("strips punctuation", () => {
  assert.equal(computePlayerSlug("O'Brien Jr."), "obrien-jr");
});
