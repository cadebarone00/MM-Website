import test from "node:test";
import assert from "node:assert/strict";
import { careerArchiveRecords, careerArchiveTeamRecords } from "@/lib/data/careerArchive";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { reconstructHistoricalMatchOdds, remainingMatchOdds } from "./historicalMatchOdds";

test("remaining-hole odds distinguish wins, halves, and mathematical completion", () => {
  const fair = { a: 0.25, tie: 0.5, b: 0.25 };
  assert.deepEqual(remainingMatchOdds([fair], 0), fair);
  assert.deepEqual(remainingMatchOdds([fair], 2), { a: 1, tie: 0, b: 0 });
  assert.deepEqual(remainingMatchOdds([], 0), { a: 0, tie: 1, b: 0 });
});

test("all 33 2026 matches have finite normalized replay odds and published final outcomes", () => {
  assert.equal(palmSprings2026.matches.length, 33);
  for (const match of palmSprings2026.matches) {
    const result = reconstructHistoricalMatchOdds(palmSprings2026, match, careerArchiveRecords, careerArchiveTeamRecords);
    assert.ok(result.points.length > 2, match.id);
    assert.equal(result.points[0].state_thru, 0);
    for (const [index, point] of result.points.entries()) {
      const values = [point.maroon_win_probability, point.tie_probability, point.white_win_probability];
      assert.ok(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1 + 1e-10));
      assert.ok(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-10);
      if (index) assert.ok(point.state_thru > result.points[index - 1].state_thru);
    }
    const final = result.points.at(-1)!;
    assert.equal(final.state_thru, 18 - (match.holesRemaining ?? 0));
    assert.equal(final.maroon_win_probability, Number(match.maroonPts > match.whitePts));
    assert.equal(final.tie_probability, Number(match.maroonPts === match.whitePts));
    assert.equal(final.white_win_probability, Number(match.maroonPts < match.whitePts));
  }
});

test("2026 strokes never train pre-round strength; later years cannot affect the replay", () => {
  for (const format of ["Singles", "Fourball", "Alt Shot"]) {
    const match = palmSprings2026.matches.find((row) => row.format === format)!;
    const original = reconstructHistoricalMatchOdds(palmSprings2026, match, careerArchiveRecords, careerArchiveTeamRecords);
    const changed = reconstructHistoricalMatchOdds(palmSprings2026, match,
      careerArchiveRecords.map((row) => row.year === 2026 ? { ...row, score: 1 } : row),
      careerArchiveTeamRecords.map((row) => row.year === 2026 ? { ...row, score: 1 } : row));
    assert.deepEqual(original.points[0], changed.points[0]);
    const future = reconstructHistoricalMatchOdds(palmSprings2026, match,
      [...careerArchiveRecords, ...careerArchiveRecords.map((row) => ({ ...row, year: 2027, score: 1 }))],
      [...careerArchiveTeamRecords, ...careerArchiveTeamRecords.map((row) => ({ ...row, year: 2027, score: 1 }))]);
    assert.deepEqual(original, future);
  }
});

test("replay labels discrepancies and keeps other tournament years unchanged", () => {
  const match = palmSprings2026.matches[0];
  assert.match(reconstructHistoricalMatchOdds(palmSprings2026, match, careerArchiveRecords, careerArchiveTeamRecords).note, /differ from the published result/);
  assert.deepEqual(reconstructHistoricalMatchOdds({ ...palmSprings2026, year: 2025 }, match, careerArchiveRecords, careerArchiveTeamRecords).points, []);
});
