import { createPlayerResolver } from "./resolvePlayer.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { playerProfiles, getPlayerSlug, getPlayerFirstName, getPlayerLastName, getPlayerDisplayName, requirePlayerSlug } from "./index.ts";
import { normalizeArchivePlayerFields } from "./archiveIdentity.ts";
import { pastTournaments, getPlayerScorecard } from "../index.ts";
import { careerArchiveRecords, careerArchiveTeamRecords, careerArchivePartnerships } from "../careerArchive.generated.ts";
import { players2024 } from "../stats/players-2024.ts";
import { players2025 } from "../stats/players-2025.ts";
import { players2026 } from "../stats/players-2026.ts";

const slugs = new Set(playerProfiles.map((player) => player.slug));
test("every archive relationship uses a known canonical player slug", () => {
  const check = (value: string) => assert.ok(slugs.has(value), "Noncanonical archive identity: " + value);
  for (const tournament of pastTournaments) {
    [...tournament.roster.maroon, ...tournament.roster.white].forEach(check);
    if (tournament.individualChampion) check(tournament.individualChampion);
    tournament.matches.forEach((match) => [...match.maroonPlayers, ...match.whitePlayers].filter((player) => player !== "Team Maroon" && player !== "Team White").forEach(check));
    tournament.individualLeaderboard.forEach((entry) => check(entry.player));
    tournament.scorecards?.forEach((card) => check(card.player));
  }
  careerArchiveRecords.forEach((row) => check(row.player));
  careerArchiveTeamRecords.forEach((row) => { check(row.player1); if (row.player2) check(row.player2); });
  careerArchivePartnerships.forEach((row) => { check(row.player); check(row.partner); });
  [players2024, players2025, players2026].forEach((table) => Object.keys(table).forEach(check));
});

test("legacy names resolve without becoming persisted identifiers or display labels", () => {
  for (const profile of playerProfiles) {
    assert.equal(profile.id, profile.slug);
    const first = profile.fullName.split(" ")[0];
    for (const input of [first, first.toUpperCase(), profile.fullName.split(" ").at(-1)!, profile.fullName, profile.slug, `  ${profile.fullName.replace(" ", "   ")}  `]) {
      assert.equal(getPlayerSlug(input), profile.slug);
      assert.equal(getPlayerFirstName(input), first);
      assert.equal(getPlayerLastName(input), profile.fullName.split(" ").at(-1));
      assert.equal(getPlayerDisplayName(input), profile.fullName);
    }
  }
  assert.equal(getPlayerSlug(" Cade "), "cade-barone");
  assert.throws(() => requirePlayerSlug("Unrecognized Player"), /Unknown player/);
});

test("old scorecard links and canonical IDs find the same card", () => {
  for (const tournament of pastTournaments) for (const card of tournament.scorecards ?? []) {
    assert.equal(getPlayerScorecard(tournament, getPlayerFirstName(card.player)), card);
    assert.equal(getPlayerScorecard(tournament, card.player), card);
    assert.equal(getPlayerScorecard(tournament, getPlayerLastName(card.player)), card);
    assert.equal(getPlayerScorecard(tournament, getPlayerDisplayName(card.player)), card);
  }
});

test("workbook imports normalize players, partners, opponents, and team lists", () => {
  const row = normalizeArchivePlayerFields({ player: "CADE", partner: "Kyle Schnabel", opponent_1: "Cam", player_2: null, maroon_players: "Cam & Pete", white_players: "Cade Barone, Kyle", score: 4, source_record_id: "Cade-2026-hole1" });
  assert.deepEqual(row, { player: "cade-barone", partner: "kyle-schnabel", opponent_1: "cam-latto", player_2: null, maroon_players: "cam-latto & pete-peabody", white_players: "cade-barone & kyle-schnabel", score: 4, source_record_id: "Cade-2026-hole1" });
  assert.throws(() => normalizeArchivePlayerFields({ player: "No Such Player" }), /Unknown player/);
});


test("ambiguous short names never select an arbitrary player", () => {
  const resolve = createPlayerResolver([
    { id: "alex-smith", slug: "alex-smith", fullName: "Alex Smith" },
    { id: "alex-jones", slug: "alex-jones", fullName: "Alex Jones" },
    { id: "jordan-smith", slug: "jordan-smith", fullName: "Jordan Smith" },
    { id: "jones-taylor", slug: "jones-taylor", fullName: "Jones Taylor" },
  ]);
  assert.equal(resolve("Alex"), undefined);
  assert.equal(resolve("Smith"), undefined);
  assert.equal(resolve("Jones"), undefined);
  assert.equal(resolve("Alex Smith")?.slug, "alex-smith");
  assert.equal(resolve("alex-jones")?.slug, "alex-jones");
  assert.equal(resolve("Taylor")?.slug, "jones-taylor");
});

test("last-name source records normalize before archive import", () => {
  assert.deepEqual(normalizeArchivePlayerFields({ player: "BARONE", partner: "Schnabel", opponent_1: "Latto" }), { player: "cade-barone", partner: "kyle-schnabel", opponent_1: "cam-latto" });
});
