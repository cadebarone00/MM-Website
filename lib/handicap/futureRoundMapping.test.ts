import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFutureHandicapRounds } from "./futureRoundMapping";
import { archivedDifferential } from "./archiveIndex";

const tee = { courseId: "course", teeSetId: "blue", teeSetName: "Blue", rating: 72, slope: 113, holes: [] };
const row = { season_year: 2028, round: 1, course: "Old name", played_on: "2028-06-01", format: "Singles", handicap_setup: tee, status: "final" };
const holes = Array.from({ length: 18 }, (_, i) => ({ season_year: 2028, round: 1, hole: i + 1, score: 4, did_not_finish: false }));

test("future rounds use the shared archive setup over the old player snapshot", () => {
  const [round] = mapFutureHandicapRounds([row], holes, [{ seasonYear: 2028, round: 1, courseName: "Library name", datePlayed: "2028-06-02", teeSetup: { ...tee, rating: 70 } }]);
  assert.equal(round.courseName, "Library name");
  assert.equal(round.datePlayed, "2028-06-02");
  assert.equal(archivedDifferential(round), 2);
});
test("locked player snapshots remain usable before shared setup migration", () => {
  const [round] = mapFutureHandicapRounds([row], holes, []);
  assert.equal(archivedDifferential(round), 0);
});
test("pending, disputed, and pickup holes cannot create a complete handicap round", () => {
  assert.deepEqual(mapFutureHandicapRounds([row], [], []), []);
  assert.equal(archivedDifferential(mapFutureHandicapRounds([row], holes.slice(1), [])[0]), null);
  assert.equal(archivedDifferential(mapFutureHandicapRounds([row], holes.map((h) => ({ ...h, did_not_finish: h.hole === 1 })), [])[0]), null);
});
test("setups are scoped to both year and round; alternate shot stays excluded", () => {
  const wrongYear = { seasonYear: 2027, round: 1, courseName: "Wrong", datePlayed: "2027-06-02", teeSetup: { ...tee, rating: 60 } };
  assert.equal(archivedDifferential(mapFutureHandicapRounds([row], holes, [wrongYear])[0]), 0);
  assert.equal(archivedDifferential(mapFutureHandicapRounds([{ ...row, format: "Foursome" }], holes, [])[0]), null);
});
test("only submitted or final rounds count toward handicap; live and scheduled rounds do not", () => {
  assert.deepEqual(mapFutureHandicapRounds([{ ...row, status: "live" }], holes, []), []);
  assert.deepEqual(mapFutureHandicapRounds([{ ...row, status: "scheduled" }], holes, []), []);
  assert.equal(mapFutureHandicapRounds([{ ...row, status: "submitted" }], holes, []).length, 1);
  assert.equal(mapFutureHandicapRounds([{ ...row, status: "final" }], holes, []).length, 1);
});

test("the 2034 test season never reaches a real handicap, unless the Tiger rehearsal status asks for it", () => {
  const testRow = { ...row, season_year: 2034 };
  const testHoles = holes.map((h) => ({ ...h, season_year: 2034 }));
  assert.deepEqual(mapFutureHandicapRounds([testRow], testHoles, []), []);
  assert.equal(mapFutureHandicapRounds([testRow], testHoles, [], { includeTestSeason: true }).length, 1);
});
