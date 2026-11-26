import { test } from "node:test";
import assert from "node:assert/strict";
import { tournamentPathFromLink } from "../../../lib/platform/pastTournaments.ts";

test("tournament page links stay on the configured site and open the edition", () => {
  const origin = "https://www.themaroon.site";
  assert.equal(tournamentPathFromLink("https://www.themaroon.site/t/example-cup/2026/players", origin), "/t/example-cup/2026");
  assert.equal(tournamentPathFromLink("/t/example-cup/2026", origin), "/t/example-cup/2026");
  assert.equal(tournamentPathFromLink("https://other.example/t/example-cup/2026", origin), null);
  assert.equal(tournamentPathFromLink("/t/example-cup/not-a-year", origin), null);
});
