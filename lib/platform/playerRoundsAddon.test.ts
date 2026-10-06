import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRound, cardFromHoles, handicapSummary, holesFromCard, type PlayerRound } from "./playerRounds.ts";

const par = Array<number>(18).fill(4);
const holesFor = (total: number) => Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokes: Math.floor(total / 18) + (i < total % 18 ? 1 : 0), putts: 2, fairway: null, green: null }));
const round = (id: string, total: number, extra: Partial<PlayerRound> = {}): PlayerRound => buildPlayerRound({
  id, profileId: "p1", source: "trip", tripId: "t", tripRoundId: "round-1", datePlayed: `2027-04-${10 + Number(id.slice(-1))}`,
  course: { ref: null, name: "Pine", place: "" }, tee: { name: "Blue", rating: 71.4, slope: 131 }, holesPlayed: 18, format: "Stroke play",
  enteredBy: "player", holes: holesFor(total), ...extra,
});

test("penalties go from the card to the saved holes and back", () => {
  const card = { strokes: par, putts: par.map(() => 2), fairways: par.map(() => null), greens: par.map(() => "center" as const),
    penalties: par.map((_, i) => ({ fairway: i === 2, green: false })) };
  const holes = holesFromCard(card, par);
  assert.deepEqual(holes[2].penalties, { fairway: true, green: false });
  assert.deepEqual(cardFromHoles(holes).penalties?.[2], { fairway: true, green: false });
});

test("a card without penalties saves holes without them (older rounds keep their shape)", () => {
  const holes = holesFromCard({ strokes: par, putts: par.map(() => 2), fairways: par.map(() => null), greens: par.map(() => null) }, par);
  assert.equal("penalties" in holes[0], false);
  assert.equal(cardFromHoles(holes).penalties, undefined);
});

test("optional add-on fields pass through buildPlayerRound", () => {
  const saved = round("r1", 80, { groupId: "g1", removedFromProfile: true, edits: [] });
  assert.equal(saved.groupId, "g1");
  assert.equal(saved.removedFromProfile, true);
  assert.equal(saved.countsForHandicap, true);
});

test("a round removed from the profile no longer counts toward the handicap", () => {
  const rounds = [round("r1", 80), round("r2", 82), round("r3", 84), round("r4", 70, { removedFromProfile: true })];
  assert.equal(handicapSummary(rounds).counting, 3);
});
