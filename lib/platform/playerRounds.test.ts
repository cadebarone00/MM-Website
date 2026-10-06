import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerRound, cardFromHoles, handicapSummary, holesFromCard, playerRoundId, type PlayerRoundInput } from "./playerRounds";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const card = (strokes: number) => ({
  strokes: PAR.map((par, i) => i === 0 ? par + (strokes - 72) : par),
  putts: PAR.map(() => 2), fairways: PAR.map((par) => par === 3 ? null : "center" as const), greens: PAR.map(() => "left" as const),
});
const input = (extra: Partial<PlayerRoundInput> = {}): PlayerRoundInput => ({
  id: playerRoundId("trip", "dev-trip", "round-2", "dev-cade"), profileId: "dev-cade", source: "trip", tripId: "dev-trip", tripRoundId: "round-2",
  datePlayed: "2027-04-23", course: { ref: null, name: "Canyon Ridge", place: "Scottsdale, AZ" }, tee: { name: "Blue", rating: 72, slope: 113 },
  holesPlayed: 18, format: "Singles Match Play", holes: holesFromCard(card(80), PAR), enteredBy: "player", ...extra,
});

test("an 18-hole own-ball round on a rated tee counts, with its differential", () => {
  const round = buildPlayerRound(input());
  assert.equal(round.total, 80);
  assert.equal(round.countsForHandicap, true);
  assert.equal(round.differential, 8);
  assert.equal(round.notCountedReason, null);
  assert.equal(round.status, "submitted");
});

test("rounds that don't qualify are saved but not counted, with a plain reason", () => {
  assert.match(buildPlayerRound(input({ format: "Scramble" })).notCountedReason ?? "", /Scramble/);
  assert.match(buildPlayerRound(input({ format: "Foursome" })).notCountedReason ?? "", /own ball/);
  assert.equal(buildPlayerRound(input({ format: "Fourball" })).countsForHandicap, true, "four-ball is own ball");
  assert.equal(buildPlayerRound(input({ tee: { name: "Blue", rating: null, slope: null } })).notCountedReason, "No course rating for this tee");
  assert.equal(buildPlayerRound(input({ tee: null })).notCountedReason, "No course rating for this tee");
  assert.equal(buildPlayerRound(input({ enteredBy: "organizer" })).notCountedReason, "Entered by organizer");
  assert.match(buildPlayerRound(input({ holesPlayed: 9, holes: holesFromCard(card(80), PAR).slice(0, 9) })).notCountedReason ?? "", /9-hole/);
  assert.equal(buildPlayerRound(input({ holes: holesFromCard(card(80), PAR).slice(0, 17) })).notCountedReason, "Not every hole was scored");
  const nope = buildPlayerRound(input({ format: "Scramble" }));
  assert.equal(nope.countsForHandicap, false);
  assert.equal(nope.differential, null);
});

test("a total-only round (History) keeps its total; bad scores are refused", () => {
  assert.equal(buildPlayerRound(input({ holes: [], total: 91, enteredBy: "organizer" })).total, 91);
  assert.throws(() => buildPlayerRound(input({ holes: [], total: undefined })), /total/);
  const holes = holesFromCard(card(80), PAR);
  holes[3] = { ...holes[3], strokes: 0 };
  assert.throws(() => buildPlayerRound(input({ holes })), /strokes/);
});

test("card ↔ holes keeps strokes, putts and shot results; par 3s have no fairway", () => {
  const holes = holesFromCard(card(80), PAR);
  assert.equal(holes[2].fairway, null);
  assert.equal(holes[0].strokes, 12);
  assert.deepEqual(cardFromHoles(holes), card(80));
});

test("handicap index needs 3 counting rounds and uses the most recent 20", () => {
  const counting = (total: number, date: string, id: string) => buildPlayerRound(input({ id, datePlayed: date, holes: holesFromCard(card(total), PAR) }));
  const scramble = buildPlayerRound(input({ id: "s", format: "Scramble" }));
  const two = [counting(80, "2027-01-01", "a"), counting(85, "2027-01-02", "b"), scramble];
  assert.deepEqual(handicapSummary(two), { index: null, lowIndex: null, counting: 2 });
  const three = [...two, counting(88, "2027-01-03", "c")];
  assert.deepEqual(handicapSummary(three), { index: 6, lowIndex: 6, counting: 3 }); // lowest of 8/13/16 = 8, −2.0 for 3 rounds
});
