import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHandicapCareerRecords } from "./handicapCareerRecords.ts";
import { careerRoundKey } from "./careerStats.ts";
import { calculatePreRoundSinglesOdds } from "../odds/preRoundSingles.ts";

const rounds = ["one", "two"].map((id) => ({ id, player_slug: "example-player", date_played: "2026-09-09", course_id: "course" }));
const holes = rounds.flatMap((round) => Array.from({ length: 18 }, (_, i) => ({ round_id: round.id, hole: i + 1, par: 4, yards: 400, score: 4, putts: 2, fir: "1", gir: true })));
const courses = [{ id: "course", name: "Example course" }];
test("submitted rounds retain distinct IDs and all stats in Other", () => {
  const records = buildHandicapCareerRecords(rounds, holes, courses);
  assert.equal(records.length, 36);
  assert.equal(new Set(records.map(careerRoundKey)).size, 2);
  assert.ok(records.every((row) => row.source === "other" && row.format === "Stroke Play"));
  assert.equal(records[0].putts, 2);
  assert.equal(records[0].fairwayInRegulation, true);
  assert.equal(records[0].datePlayed, "2026-09-09");
});
test("incomplete submissions never enter career stats or odds", () => {
  const records = buildHandicapCareerRecords(rounds, holes.slice(1), courses);
  assert.equal(records.length, 18);
  assert.ok(records.every((row) => row.roundId === "handicap:two"));
});
test("odds can use personal rounds without historical Singles data", () => {
  const base = buildHandicapCareerRecords(rounds, holes, courses);
  const result = calculatePreRoundSinglesOdds({
    records: [...base.map((row) => ({ ...row, player: "A" })), ...base.map((row) => ({ ...row, player: "B" }))],
    courseHoles: Array.from({ length: 18 }, (_, i) => ({ year: 2026, course: "Example course", tee: null, hole: i + 1, par: 4, yards: 400, holeType: null, holeLengthBucket: null })),
    playerA: "A", playerB: "B", course: "Example course",
  });
  assert.ok(result);
  assert.ok(Number.isFinite(result.a) && Number.isFinite(result.tie) && Number.isFinite(result.b));
  assert.equal(result.tie, 1);
});
