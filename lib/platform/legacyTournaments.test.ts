import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAROON_TOURNAMENT_SLUG } from "./editionScope.ts";
import { legacyAdapterFor, withoutLegacyRows } from "./legacyTournaments.ts";

test("only legacy tournaments get an adapter", () => {
  assert.equal(legacyAdapterFor(MAROON_TOURNAMENT_SLUG)?.slug, MAROON_TOURNAMENT_SLUG);
  assert.equal(legacyAdapterFor("texas-cup"), null);
  assert.equal(legacyAdapterFor(""), null);
});

test("database rows for adapter-served tournaments are dropped (the adapter supplies them live)", () => {
  const rows = [{ slug: "texas-cup", year: 2027 }, { slug: MAROON_TOURNAMENT_SLUG, year: 2027 }, null, { slug: 5 }];
  assert.deepEqual(withoutLegacyRows(rows), [{ slug: "texas-cup", year: 2027 }, null, { slug: 5 }]);
  assert.deepEqual(withoutLegacyRows(undefined), []);
});

test("shared loaders and the /play screens never single out The Maroon", () => {
  const shared = [
    "lib/platform/tournamentHomeServer.ts", "lib/platform/tournamentHome.ts", "lib/platform/pastTournaments.ts", "lib/platform/pastTournamentsServer.ts",
    "lib/profile/myProfileServer.ts", "lib/profile/profileReadModel.ts", "lib/profile/profileReadModelServer.ts", "components/platform/JoinTournamentPage.tsx",
    "components/platform/MyPlayingTournamentsPage.tsx", "components/platform/play/PlayShell.tsx", "components/platform/play/PlayTabs.tsx",
    "components/platform/play/TournamentHomeScreen.tsx", "components/platform/play/MatchCard.tsx",
  ];
  for (const file of shared) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes(MAROON_TOURNAMENT_SLUG), false, `${file} names the legacy slug`);
    assert.equal(/MAROON_TOURNAMENT_SLUG|maroonAdapter|loadMaroon/.test(source), false, `${file} reaches past the boundary`);
  }
});
