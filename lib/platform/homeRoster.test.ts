import { test } from "node:test";
import assert from "node:assert/strict";
import { homeTeamRoster, sortHomeRoster } from "./homeRoster";

const players = [{ name: "Zoe Adams", username: "zoe" }, { name: "Ben Young" }, { name: "alex Smith", avatarUrl: "/alex.jpg" }, { name: "Ben Adams" }];
const base = { teamCompetition: true, players, assignmentNames: players.map(p => p.name), groups: [[0, 2], [1, 3]], teamNames: ["Maroon", "White"] };
test("complete teams keep team order and sort by first name within each team", () => {
  const result = homeTeamRoster(base)!;
  assert.deepEqual(result.map(t => [t.name, t.players.map(p => p.name)]), [["Maroon", ["alex Smith", "Zoe Adams"]], ["White", ["Ben Adams", "Ben Young"]]]);
  assert.equal(result[0].players[0].avatarUrl, "/alex.jpg");
  assert.equal(result[0].players[1].username, "zoe");
  assert.deepEqual(base.groups, [[0, 2], [1, 3]]);
});
test("incomplete, duplicate, invalid and mismatched assignments retain Players", () => {
  for (const groups of [null, [[0, 2], [1]], [[0, 2], [1, 1]], [[0, 2], [1, 5]], [[0, 1, 2, 3], []]]) assert.equal(homeTeamRoster({ ...base, groups }), null);
  assert.equal(homeTeamRoster({ ...base, players: players.slice(1) }), null);
  assert.equal(homeTeamRoster({ ...base, teamCompetition: false }), null);
});
test("plain roster sorts by first name without mutating the supplied players", () => {
  assert.deepEqual(sortHomeRoster(players).map(p => p.name), ["alex Smith", "Ben Adams", "Ben Young", "Zoe Adams"]);
  assert.equal(players[0].name, "Zoe Adams");
  assert.deepEqual(homeTeamRoster({ ...base, teamNames: [] })!.map(t => t.name), ["Team 1", "Team 2"]);
});
