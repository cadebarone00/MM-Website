import test from "node:test";
import assert from "node:assert/strict";
import { legacyScorecardRound, generatedCareerRound, matchRound } from "./roundIdentity";
import { pastTournaments } from "./index";
import { scorecards2024 } from "./scorecards-2024";
import { scorecards2025 } from "./scorecards-2025";
import { scorecards2026 } from "./scorecards-2026";
import { careerArchiveTeamRecords } from "./careerArchive";
import { historicalMatchScorecard } from "./historicalMatchScorecard";
import { getPlayerSlug } from "./players";

test("source maps retain every player's round once, including INDI and Pinehurst's nine holes", () => {
  for (const [year, cards, count] of [[2024, scorecards2024, 47], [2025, scorecards2025, 40], [2026, scorecards2026, 72]] as const) {
    const keys = cards.flatMap(card => card.rounds.map(round => `${card.player}:${legacyScorecardRound(year, round.round)}`));
    assert.equal(keys.length, count); assert.equal(new Set(keys).size, count);
  }
  assert.equal(legacyScorecardRound(2025, 2), 0);
  assert.equal(legacyScorecardRound(2026, 2), 3);
  assert.equal(generatedCareerRound(2024, 3), 4);
  assert.equal(generatedCareerRound(2024, 4), 5);
  assert.equal(generatedCareerRound(2026, 6), 5);
  assert.equal(generatedCareerRound(2026, 5), 6);
  assert.throws(() => legacyScorecardRound(2026, 9));
});

test("every historical match reads the exact same canonical player holes as its profile", () => {
  for (const tournament of pastTournaments) {
    const source = tournament.year === 2024 ? scorecards2024 : tournament.year === 2025 ? scorecards2025 : scorecards2026;
    const cards = source.map(card => ({ ...card, rounds: card.rounds.map(round => ({ ...round, round: legacyScorecardRound(tournament.year, round.round) })) }));
    for (const match of tournament.matches) {
      const round = matchRound(tournament, match);
      const scorecard = historicalMatchScorecard(tournament, match, cards, careerArchiveTeamRecords);
      if (match.format === "Alt Shot") {
        assert.ok(scorecard, `Shared scores missing ${tournament.year}/${round}`);
        continue;
      }
      for (const player of [...match.maroonPlayers, ...match.whitePlayers]) {
        const original = cards.find(card => getPlayerSlug(card.player) === player)?.rounds.find(entry => entry.round === round);
        if (!original) continue;
        for (const hole of original.holes) assert.equal(scorecard?.holes.find(entry => entry.number === hole.hole)?.scores[player], hole.score, `${tournament.year}/${round}/${player}/${hole.hole}`);
      }
    }
  }
});
