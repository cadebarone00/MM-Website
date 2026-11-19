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
  assert.match(buildPlayerRound(input({ holesPlayed: 9, holes: holesFromCard(card(80), PAR).slice(0, 9) })).notCountedReason ?? "", /combined with another 9/);
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

test("other spellings and names of team formats don't count either", () => {
  for (const format of ["Alternate-Shot", "Pinehurst", "Gruesome", "Gruesomes", "Texas Scramble"]) {
    assert.equal(buildPlayerRound(input({ format })).countsForHandicap, false, format);
  }
  for (const format of ["Singles Stroke Play", "Best Ball", "Four-Ball", "Stableford"]) {
    assert.equal(buildPlayerRound(input({ format })).countsForHandicap, true, format);
  }
});


test("9-hole rounds count in pairs: two qualifying 9s make one 18-hole differential; the newest unpaired 9 waits", async () => {
  const { nineHolePairs, countingDifferentials, handicapSummary } = await import("./playerRounds.ts");
  const nine = (id: string, datePlayed: string, total: number, tee: { name: string; rating: number | null; slope: number | null } = { name: "Blue", rating: 71.6, slope: 128 }, extra = {}) => ({
    id, datePlayed, holesPlayed: 9 as const, format: "Stroke play", tee, total, enteredBy: "player" as const, countsForHandicap: false, differential: null,
    holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokes: i === 0 ? total - 32 : 4, putts: null, fairway: null, green: null })), ...extra });
  const rounds = [nine("a", "2026-05-01", 42), nine("b", "2026-05-08", 44), nine("c", "2026-05-15", 40)];
  const pairs = nineHolePairs(rounds);
  // (42 + 44 − (35.8 + 35.8)) × 113 ÷ 128 = 12.7
  assert.deepEqual(pairs.get("a"), { differential: 12.7, with: "b", datePlayed: "2026-05-08" });
  assert.deepEqual(pairs.get("b"), { differential: 12.7, with: "a", datePlayed: "2026-05-08" });
  assert.equal(pairs.get("c"), "waiting");
  assert.deepEqual(countingDifferentials(rounds), [12.7], "the pair counts once; the waiting 9 doesn't");
  // A fourth 9 pairs with the waiting one; an 18-hole round that counts sits among them by date.
  const eighteen = { id: "e", datePlayed: "2026-05-10", holesPlayed: 18 as const, format: "Stroke play", tee: { name: "Blue", rating: 71.6, slope: 128 }, total: 80,
    enteredBy: "player" as const, countsForHandicap: true, differential: 7.4, holes: [] };
  const more = [...rounds, nine("d", "2026-05-22", 41), eighteen];
  assert.deepEqual(countingDifferentials(more), [Math.round(((40 + 41 - 71.6) * 113 / 128) * 10) / 10, 7.4, 12.7], "newest first");
  // 9s that can't count are skipped: no rating, not every hole, a scramble, entered by the organizer, removed.
  const skipped = [nine("n1", "2026-06-01", 40, { name: "Blue", rating: null, slope: null }), { ...nine("n2", "2026-06-02", 40), holes: [] },
    nine("n3", "2026-06-03", 40, undefined, { format: "Scramble" }), nine("n4", "2026-06-04", 40, undefined, { enteredBy: "organizer" }),
    nine("n5", "2026-06-05", 40, undefined, { removedFromProfile: true })];
  assert.equal(nineHolePairs(skipped).size, 0);
  // A course that lists a 9-hole rating (under 50) uses it as is.
  assert.deepEqual(nineHolePairs([nine("x", "2026-07-01", 40, { name: "Short", rating: 34.5, slope: 110 }), nine("y", "2026-07-02", 40, { name: "Short", rating: 34.5, slope: 110 })]).get("x"),
    { differential: Math.round(((80 - 69) * 113 / 110) * 10) / 10, with: "y", datePlayed: "2026-07-02" });
  assert.equal(handicapSummary([]).counting, 0);
});
