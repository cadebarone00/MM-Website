import { test } from "node:test";
import assert from "node:assert/strict";
import { homeDraftTeamsReady, homeDraftHasSchedule, homeTeamGroupsReady, homeMatchRounds, homeRoundRobinSides } from "./homeDraft";
import { defaultRoundComp } from "./roundCompetition";

test("match drafts require all players and both teams, never just a passed draft time", () => {
  assert.equal(homeDraftTeamsReady(0, []), false);
  assert.equal(homeDraftTeamsReady(4, [{ id: "0", name: "Alex", team: "A" }, { id: "1", name: "Sam", team: "B" }]), false);
  assert.equal(homeDraftTeamsReady(2, [{ id: "0", name: "Alex", team: "A" }, { id: "1", name: "Sam", team: "A" }]), false);
  assert.equal(homeDraftTeamsReady(2, [{ id: "0", name: "Alex", team: "A" }, { id: "0", name: "Alex", team: "B" }]), false);
  assert.equal(homeDraftTeamsReady(2, [{ id: "0", name: "Alex", team: "A" }, { id: "1", name: "Sam", team: "B" }]), true);
});

test("draft schedules need both a date and a valid time", () => {
  assert.equal(homeDraftHasSchedule("", ""), false);
  assert.equal(homeDraftHasSchedule("2027-04-20", ""), false);
  assert.equal(homeDraftHasSchedule("", "18:00"), false);
  assert.equal(homeDraftHasSchedule("2027-04-20", "25:00"), false);
  assert.equal(homeDraftHasSchedule("2027-04-20", "18:00"), true);
});

test("pairs and larger teams require unique complete assignments; individuals need no permanent teams", () => {
  const players = ["Alex", "Blair", "Cam", "Drew"].map(name => ({ name }));
  assert.equal(homeTeamGroupsReady(4, [[0, 1], [2, 3]], "Pairs"), true);
  assert.equal(homeTeamGroupsReady(4, [[0, 1], [1, 3]], "Pairs"), false);
  assert.equal(homeTeamGroupsReady(4, [[0], [1, 2, 3]], "Pairs"), false);
  assert.equal(homeTeamGroupsReady(4, [[0, 1], [2]], "Pairs"), false);
  assert.equal(homeTeamGroupsReady(6, [[0, 1], [2, 3], [4, 5]], "Pairs"), true);
  assert.equal(homeTeamGroupsReady(6, [[0, 1, 2], [3, 4, 5]], "3-Ball"), true);
  assert.equal(homeTeamGroupsReady(8, [[0, 1, 2, 3], [4, 5, 6, 7]], "4-Ball"), true);
  assert.equal(homeRoundRobinSides(players, null, null, []).length, 4);
  assert.equal(homeRoundRobinSides(players, "Pairs", [[0, 1], [2, 3]], []).length, 2);
  assert.deepEqual(homeRoundRobinSides(players, "Pairs", [[0, 1], [2]], []), []);
});

test("Home distinguishes score-based scrambles from match rounds, including mixed and unscheduled rounds", () => {
  const rounds = [1, 2, 3].map(number => ({ number, date: `2027-04-${20 + number}`, course: "Course TBD" }));
  const match = { ...defaultRoundComp(8), format: "Fourball" as const };
  const setup = { compFormats: { "0-0": { ...match, format: "Scramble", matchType: "Stroke Play" }, "1-0": match, "2-0": match }, compRounds: { "2-0": false }, allRoundsMatch: { method: "Round Robin" } };
  const applicable = homeMatchRounds(setup, rounds, 8);
  assert.deepEqual(applicable.map(round => round.number), [2]);
  assert.equal(applicable[0].method, "Round Robin");
  assert.equal(homeMatchRounds({ ...setup, allRoundsMatch: { method: null } }, rounds, 8).length, 1);
  assert.equal(homeMatchRounds({ ...setup, matchPerRound: true, matchSelections: { "1-0": { method: "Manual" } } }, rounds, 8)[0].method, "Manual");
  assert.equal(homeMatchRounds({}, [{ ...rounds[0], format: "Stroke Play" }], 8).length, 0);
  assert.equal(homeMatchRounds({ localCompetitionType: { individual: "Match Play", team: null } }, rounds, 8).length, 3);
  assert.equal(homeMatchRounds({ allRoundsMatch: { method: "Round Robin" } }, rounds, 8).length, 3);
  assert.equal(homeMatchRounds({ localCompetitionType: { individual: "Stroke Play", team: null } }, [{ ...rounds[0], format: "Singles" }], 8).length, 0);
});
