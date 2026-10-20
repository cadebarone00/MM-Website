import test from "node:test";
import assert from "node:assert/strict";
import { nonIndividualRound } from "./nonIndividualRound";
import { GOLF_MATCH_PREVIEW_FOURSOME } from "./golfTripPreviewFixture";
import { adaptTournamentToPreviewMatch, tournamentSessions } from "./tournamentToGolfTrip";
import { historicalTripStandings } from "./historicalTripStandings";
import { palmSprings2026 } from "../data/2026-palm-springs";
import { scorecards2026 } from "../data/scorecards-2026";

test("historical shared-ball rounds show partner, competitors and the player-relative result", () => {
  const match = { ...adaptTournamentToPreviewMatch(palmSprings2026), roundStandings: historicalTripStandings(palmSprings2026, scorecards2026, tournamentSessions(palmSprings2026)) };
  const pair = match.matches.find(p => p.round === 2)!;
  assert.ok("golfers" in pair.left && pair.right && "golfers" in pair.right);
  const a = nonIndividualRound(match, 2, pair.left.golfers[0].name)!;
  const b = nonIndividualRound(match, 2, pair.right.golfers[0].name)!;
  assert.deepEqual(a.partners, [pair.left.golfers[1].name]);
  assert.deepEqual(a.competitors, pair.right.golfers.map(g => g.name));
  assert.match(a.result, /Maroon (wins|loses|ties)/);
  assert.match(b.result, /White (wins|loses|ties)/);
  assert.equal(nonIndividualRound(match, 1, pair.left.golfers[0].name), null);
});

test("team stroke play uses supplied team totals and never adds individual scores", () => {
  const golfer = (name: string) => ({ name, hcp: 0, thru: "F", score: "", teeTime: "", course: "" });
  const match = { ...GOLF_MATCH_PREVIEW_FOURSOME, format: "Scramble", matches: [{ left: { name: "Maroon", golfers: [golfer("A"), golfer("B")], totalScore: "68" }, right: { name: "White", golfers: [golfer("C"), golfer("D")], totalScore: "71" }, gross: null, net: null }] };
  assert.equal(nonIndividualRound(match, match.round, "A")?.result, "68 to 71");
  assert.equal(nonIndividualRound(match, match.round, "C")?.result, "71 to 68");
  assert.equal(nonIndividualRound({ ...match, matches: [] }, match.round, "A")?.result, "Result not available");
});
