import { test } from "node:test";
import assert from "node:assert/strict";
import { SEASON_YEARS, isValidSeasonYear } from "./activeSeason.ts";

test("SEASON_YEARS covers 2027 through 2034", () => {
  assert.deepEqual(SEASON_YEARS, [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034]);
});

test("isValidSeasonYear accepts only integers in range", () => {
  assert.equal(isValidSeasonYear(2027), true);
  assert.equal(isValidSeasonYear(2034), true);
  assert.equal(isValidSeasonYear(2026), false);
  assert.equal(isValidSeasonYear(2035), false);
  assert.equal(isValidSeasonYear(2027.5), false);
  assert.equal(isValidSeasonYear("2027"), false);
});
