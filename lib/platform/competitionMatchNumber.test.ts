import test from "node:test";
import assert from "node:assert/strict";
import { competitionMatchOffset } from "./competitionMatchNumber";
import { GOLF_MATCH_PREVIEW_SINGLES } from "./golfTripPreviewFixture";

test("competition numbering counts actual matches in previous rounds, including uneven schedules", () => {
  const pairing = GOLF_MATCH_PREVIEW_SINGLES.matches[0];
  const match = { round: 1, matches: [2, 1, 2, 1, 2, 2, 1, 2, 2].map(round => ({ ...pairing, round })) };
  assert.equal(competitionMatchOffset(match, 1), 0);
  assert.equal(competitionMatchOffset(match, 2) + 1, 4);
  assert.equal(competitionMatchOffset(match, 2) + 6, 9);
  assert.equal(competitionMatchOffset(match, 3) + 1, 10);
});

test("matches without a round belong to the source round and empty rounds add nothing", () => {
  const pairing = { ...GOLF_MATCH_PREVIEW_SINGLES.matches[0], round: undefined };
  const match = { round: 2, matches: [pairing, { ...pairing, round: 4 }] };
  assert.equal(competitionMatchOffset(match, 2), 0);
  assert.equal(competitionMatchOffset(match, 3), 1);
  assert.equal(competitionMatchOffset(match, 4), 1);
});
