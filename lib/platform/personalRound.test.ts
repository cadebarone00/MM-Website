import assert from "node:assert/strict";
import test from "node:test";
import type { GolfCourse } from "./golfGps/domain";
import { holeRange, personalRound, scoringCourse, type PersonalRoundSetup } from "./personalRound";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course = (holes = PAR) => ({
  name: "Test Links", address: { city: "Austin", state: "TX" },
  holes: holes.map((par, i) => ({ number: i + 1, par })),
  teeSets: [{ id: "b", name: "Blue", ratings: [{ gender: "women", courseRating: 75, slopeRating: 130 }, { gender: "men", courseRating: 71.2, slopeRating: 125 }] }, { id: "r", name: "Red" }],
}) as unknown as GolfCourse;
const card = { strokes: PAR.map((p) => p + 1), putts: PAR.map(() => 2), fairways: PAR.map(() => "center" as const), greens: PAR.map(() => "left" as const) };
const setup = (overrides: Partial<PersonalRoundSetup> = {}): PersonalRoundSetup => {
  const c = scoringCourse("og-1", course())!;
  return { course: c, tee: c.tees[0], holes: "18", stats: true, countForHandicap: true, datePlayed: "2026-10-07", ...overrides };
};

test("scoringCourse takes pars in hole order and the men's rating for each tee", () => {
  const c = scoringCourse("og-1", course())!;
  assert.deepEqual(c.par, PAR);
  assert.equal(c.strokeIndex?.length, 18);
  assert.equal(c.place, "Austin, TX");
  assert.deepEqual(c.tees, [{ name: "Blue", rating: 71.2, slope: 125 }, { name: "Red", rating: null, slope: null }]);
  assert.equal(scoringCourse("og-2", course(PAR.slice(0, 9))), null, "a 9-hole course can't be scored here yet");
});

test("holeRange picks the right nine", () => {
  assert.deepEqual(holeRange("18"), [0, 18]);
  assert.deepEqual(holeRange("front"), [0, 9]);
  assert.deepEqual(holeRange("back"), [9, 18]);
});

test("an 18-hole round with a rated tee counts; a practice round doesn't", () => {
  const counted = personalRound("p1", setup(), card, "t1");
  assert.equal(counted.source, "personal");
  assert.equal(counted.total, 72 + 18);
  assert.equal(counted.countsForHandicap, true);
  assert.equal(counted.id, "personal:p1:t1");
  const practice = personalRound("p1", setup({ countForHandicap: false }), card, "t1");
  assert.equal(practice.countsForHandicap, false);
  assert.equal(practice.differential, null);
  assert.equal(practice.notCountedReason, "Practice round");
});

test("a back nine keeps hole numbers 10–18; stats off saves strokes only", () => {
  const round = personalRound("p1", setup({ holes: "back", stats: false }), card, "t2");
  assert.equal(round.holesPlayed, 9);
  assert.deepEqual(round.holes.map((h) => h.number), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.ok(round.holes.every((h) => h.putts === null && h.fairway === null && h.green === null));
  assert.equal(round.countsForHandicap, false);
});

test("no tee rating = saved but not counted", () => {
  const round = personalRound("p1", setup({ tee: null }), card, "t3");
  assert.equal(round.countsForHandicap, false);
  assert.equal(round.notCountedReason, "No course rating for this tee");
});

test("a game's name is the format; team formats never count", () => {
  assert.equal(personalRound("p1", setup({ game: { id: "wolf", net: false, birdiesDouble: false } }), card, "t4").format, "Wolf");
  assert.equal(personalRound("p1", setup({ game: { id: "scramble", net: false, birdiesDouble: false } }), card, "t5").countsForHandicap, false);
});
