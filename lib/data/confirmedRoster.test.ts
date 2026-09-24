import { test } from "node:test";
import assert from "node:assert/strict";
import { filterLockedRoster } from "./confirmedRoster.ts";

test("filterLockedRoster keeps only entries whose player is in the locked set", () => {
  const roster = [
    { seasonYear: 2027, playerSlug: "cam-latto", team: "maroon" as const },
    { seasonYear: 2027, playerSlug: "kyle-schnabel", team: "white" as const },
  ];

  const result = filterLockedRoster(roster, ["cam-latto"]);

  assert.deepEqual(result, [{ seasonYear: 2027, playerSlug: "cam-latto", team: "maroon" }]);
});

test("filterLockedRoster returns an empty array when nothing is locked yet", () => {
  const roster = [{ seasonYear: 2027, playerSlug: "cam-latto", team: "maroon" as const }];

  assert.deepEqual(filterLockedRoster(roster, []), []);
});
