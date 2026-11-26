import assert from "node:assert/strict";
import test from "node:test";
import { matchDraftCountdown, matchDraftStatus } from "./matchDraftStatus";

test("no match selection saved: no Match Draft", () => {
  assert.equal(matchDraftStatus({}, 1), null);
});

test("all rounds share one Match Draft", () => {
  const status = matchDraftStatus({ allRoundsMatch: { method: "Match Draft", date: "2026-12-14", time: "19:00" } }, 3);
  assert.deepEqual(status, { date: "2026-12-14", time: "19:00", target: new Date("2026-12-14T19:00").getTime() });
});

test("a method other than Match Draft shows no draft", () => {
  assert.equal(matchDraftStatus({ allRoundsMatch: { method: "Random", date: "2026-12-14", time: "19:00" } }, 1), null);
});

test("per round: round 3 with two rounds on day 0 is day 1, first round", () => {
  const setup = { matchPerRound: true, roundsPerDay: { 0: 2 }, matchSelections: { "1-0": { method: "Match Draft", date: "2026-12-15", time: "07:00" } } };
  assert.equal(matchDraftStatus(setup, 3)?.date, "2026-12-15");
  assert.equal(matchDraftStatus(setup, 2), null);
});

test("per round without a date or time: no draft", () => {
  assert.equal(matchDraftStatus({ matchPerRound: true, matchSelections: { "0-0": { method: "Match Draft", date: "2026-12-15" } } }, 1), null);
});

test("countdown text", () => {
  const target = new Date("2026-12-15T07:00").getTime();
  assert.equal(matchDraftCountdown(target, target - (86400 + 2 * 3600 + 3 * 60 + 4) * 1000), "1d 2h 3m 4s");
  assert.equal(matchDraftCountdown(target, target), "Draft time reached");
  assert.equal(matchDraftCountdown(target, target + 5000), "Draft time reached");
});
