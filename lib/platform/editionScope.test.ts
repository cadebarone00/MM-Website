import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EditionNotLiveError, MAROON_TOURNAMENT_SLUG, assertLiveTablesReady, editionColumns, editionFilter,
  editionRealtimeFilter, isMaroon, maroonEdition, maroonTournament, withYear,
} from "./editionScope.ts";

test("The Maroon's edition scope produces exactly the year filter existing code used", () => {
  const scope = maroonEdition(2027);
  assert.deepEqual(scope, { tournamentSlug: "the-maroon-tournament", seasonYear: 2027 });
  assert.deepEqual(editionFilter(scope), { season_year: 2027 });
  assert.deepEqual(editionColumns(scope), { season_year: 2027 });
  assert.equal(editionRealtimeFilter(scope), "season_year=eq.2027");
  assert.equal(isMaroon(maroonTournament()), true);
  assert.deepEqual(withYear(maroonTournament(), 2034), maroonEdition(2034));
});

test("the tournament slug matches the one platform_foundation.sql seeds", async () => {
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync("supabase/platform_foundation.sql", "utf8"), new RegExp(`'${MAROON_TOURNAMENT_SLUG}'`));
});

test("any other tournament is refused instead of silently touching The Maroon's rows", () => {
  const texas = { tournamentSlug: "texas-cup", seasonYear: 2027 };
  for (const use of [editionFilter, editionColumns, editionRealtimeFilter]) {
    assert.throws(() => use(texas), EditionNotLiveError);
  }
  assert.throws(() => assertLiveTablesReady({ tournamentSlug: "texas-cup" }), /isn't available for "texas-cup"/);
});

test("rejects non-integer years", () => {
  for (const bad of [NaN, 2027.5, Infinity]) {
    assert.throws(() => maroonEdition(bad), TypeError);
    assert.throws(() => withYear(maroonTournament(), bad), TypeError);
  }
});
