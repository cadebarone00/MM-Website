import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLF_MATCH_PREVIEW_FOURBALL, GOLF_MATCH_PREVIEW_SINGLES, normalizeCompetitor } from "@/lib/platform/golfTripPreviewFixture";
import { buildPlayerRound } from "@/lib/platform/playerRounds";
import { attesteeOf, devGolferId, devTripGroup, withSavedRounds } from "./devTripScores";

test("singles: me and my opponent attest each other", () => {
  const group = devTripGroup(GOLF_MATCH_PREVIEW_SINGLES, "dev-cade")!;
  const opponent = normalizeCompetitor(GOLF_MATCH_PREVIEW_SINGLES.matches[0].right!).golfers[0].name;
  assert.equal(attesteeOf(group, "dev-cade"), devGolferId(opponent));
  assert.equal(group.names[devGolferId(opponent)], opponent);
});

test("fourball: I attest the first golfer on the other side, never my partner", () => {
  const group = devTripGroup(GOLF_MATCH_PREVIEW_FOURBALL, "dev-cade")!;
  const right = normalizeCompetitor(GOLF_MATCH_PREVIEW_FOURBALL.matches[0].right!).golfers;
  assert.equal(group.players.length, 4);
  assert.equal(attesteeOf(group, "dev-cade"), devGolferId(right[0].name));
});

test("a stored swap changes who attests me", () => {
  const plain = devTripGroup(GOLF_MATCH_PREVIEW_FOURBALL, "dev-cade")!;
  const partner = plain.players[1].profileId;
  const swapped = devTripGroup(GOLF_MATCH_PREVIEW_FOURBALL, "dev-cade", { [`${plain.id}|dev-cade`]: partner })!;
  assert.equal(swapped.players.find((p) => p.profileId === "dev-cade")?.attesterProfileId, partner);
});

test("no matches → no group", () => assert.equal(devTripGroup({ ...GOLF_MATCH_PREVIEW_SINGLES, matches: [] }, "dev-cade"), null));

test("a saved round replaces my leaderboard row: holes, F, and the round's score to par", () => {
  const match = GOLF_MATCH_PREVIEW_SINGLES;
  const group = devTripGroup(match, "dev-cade")!;
  const me = group.names["dev-cade"];
  const round = buildPlayerRound({ id: "r", profileId: "dev-cade", source: "trip", tripId: "dev-trip", tripRoundId: `round-${match.round}`, datePlayed: match.roundDate,
    course: { ref: null, name: match.course, place: "" }, tee: null, holesPlayed: 18, format: match.format, enteredBy: "player",
    holes: match.par.map((p, i) => ({ number: i + 1, par: p, strokes: p + (i === 0 ? 1 : 0), putts: 2, fairway: null, green: null })) });
  const row = withSavedRounds(match, group, [round]).leaderboard.find((r) => r.golfer.name === me)!;
  assert.equal(row.thru, "F");
  assert.equal(row.today, "+1");
  assert.equal(row.holes[0], match.par[0] + 1);
});

test("devTripScoring: my attestee's name, my saved round on the leaderboard, and trip stats with names", async () => {
  const { devRoundsReducer, devTripRound, seedDevRounds } = await import("./devPlayerRounds");
  const { devTripScoring } = await import("./devTripScores");
  const match = GOLF_MATCH_PREVIEW_SINGLES;
  const empty = devTripScoring(seedDevRounds(), match, "dev-cade");
  const opponent = normalizeCompetitor(match.matches[0].right!).golfers[0].name;
  assert.equal(empty.attesteeName, opponent);
  assert.equal(empty.tripStats.trip, null);
  const card = { strokes: match.par, putts: match.par.map(() => 2), fairways: match.par.map(() => null), greens: match.par.map(() => null) };
  const store = devRoundsReducer(seedDevRounds(), { type: "saveRound", round: devTripRound(match, "dev-cade", card, { groupId: empty.group!.id }) });
  const after = devTripScoring(store, match, "dev-cade");
  assert.equal(after.tripStats.players[0].name, empty.group!.names["dev-cade"]);
  assert.equal(after.shownMatch!.leaderboard.find((r) => r.golfer.name === empty.group!.names["dev-cade"])!.thru, "F");
  assert.equal(devTripScoring(seedDevRounds(), undefined, "dev-cade").group, null);
});
