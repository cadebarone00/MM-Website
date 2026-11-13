import { test } from "node:test";
import assert from "node:assert/strict";
import { draftSimFixture, validDraftSim } from "./draftSim";

const NOW = "2027-04-20T18:00:00";

test("no draft sample unless a draft page turns one on", () => {
  assert.equal(draftSimFixture({}, NOW), null);
  assert.equal(draftSimFixture({ draftSim: "off" }, NOW), null);
});

test("team draft sample: type, order, player count and how many are picked", () => {
  const sample = draftSimFixture({ draftSim: "team", teamDraftMethod: "Duck Race", teamDraftOrder: "Straight", teamDraftPlayers: 7, teamDraftPicked: "half" }, NOW)!;
  assert.equal(sample.team.selection, "Draft");
  assert.equal(sample.team.method, "Duck Race");
  assert.equal(sample.team.type, "Straight");
  assert.equal(sample.players.length, 7);
  assert.equal(sample.players.filter(player => player.team).length, 3);
  assert.deepEqual(sample.matchPlayers.map(player => player.team), ["A", "B", "A"]);
  assert.equal(sample.matchRounds.length, 0);
  const all = draftSimFixture({ draftSim: "team", teamDraftPicked: "all" }, NOW)!;
  assert.equal(all.players.length, 8);
  assert.ok(all.players.every(player => player.team));
});

test("when: no date, about a day away, or just reached", () => {
  assert.deepEqual([draftSimFixture({ draftSim: "team", draftWhen: "unset" }, NOW)!.team.date], [""]);
  const soon = draftSimFixture({ draftSim: "team", draftWhen: "countdown" }, NOW)!.team;
  assert.equal(soon.date + "T" + soon.time, "2027-04-21T20:00");
  const reached = draftSimFixture({ draftSim: "team", draftWhen: "reached" }, NOW)!.team;
  assert.equal(reached.date + "T" + reached.time, "2027-04-20T17:59");
});

test("match selection sample: teams already set, one round sized by format and roster", () => {
  const singles = draftSimFixture({ draftSim: "match", matchSelType: "Ranks", matchSelPerTeam: "6" }, NOW)!;
  assert.equal(singles.matchPlayers.length, 12);
  assert.equal(singles.matchRounds[0].type, "Ranks");
  assert.equal(singles.matchRounds[0].matches, 6);
  assert.ok(singles.team.date + "T" + singles.team.time < "2027-04-20T18:00", "the team draft is already over");
  const pairs = draftSimFixture({ draftSim: "match", matchSelFormat: "pairs", matchSelPerTeam: "5v4", matchSelLocked: true }, NOW)!;
  assert.deepEqual([pairs.matchPlayers.filter(p => p.team === "A").length, pairs.matchPlayers.filter(p => p.team === "B").length], [5, 4]);
  assert.equal(pairs.matchRounds[0].perSide, 2);
  assert.equal(pairs.matchRounds[0].matches, 2);
  assert.equal(pairs.matchRounds[0].locked, true);
  assert.equal(draftSimFixture({ draftSim: "match", draftWhen: "unset" }, NOW)!.matchRounds[0].when, "Draft date not set yet");
});

test("room opens only when asked, with a key that changes with the sample", () => {
  assert.equal(draftSimFixture({ draftSim: "match" }, NOW)!.roomKey, null);
  const a = draftSimFixture({ draftSim: "match", draftRoom: "open" }, NOW)!.roomKey;
  const b = draftSimFixture({ draftSim: "match", draftRoom: "open", matchSelType: "Randomized" }, NOW)!.roomKey;
  assert.ok(a && b && a !== b);
});

test("the simulator only accepts known draft values", () => {
  assert.ok(validDraftSim({ draftSim: "team", teamDraftPlayers: 16, matchSelLocked: false }));
  assert.ok(!validDraftSim({ draftSim: "both" }));
  assert.ok(!validDraftSim({ teamDraftPlayers: 5 }));
  assert.ok(!validDraftSim({ matchSelPerTeam: 4 }));
});

test("Pairs / 3-Ball / 4-Ball samples: a captain per team, picks placed in draft order, leftovers stay unpicked", () => {
  const pairs = draftSimFixture({ draftSim: "team", teamDraftType: "Pairs", teamDraftPlayers: 7, teamDraftPicked: "all" }, NOW)!;
  assert.equal(pairs.team.teamType, "Pairs");
  assert.deepEqual(pairs.players.filter(p => p.captain).map(p => p.teamIndex), [0, 1, 2]);
  assert.equal(pairs.players.filter(p => p.teamIndex !== undefined).length, 6);
  assert.equal(pairs.players.filter(p => p.teamIndex === undefined).length, 1, "7th player is left over");
  assert.deepEqual(pairs.matchPlayers, [], "Match Selection is 2 Teams only");
  const ball = draftSimFixture({ draftSim: "team", teamDraftType: "3-Ball", teamDraftPlayers: 9, teamDraftPicked: "half", teamDraftOrder: "Snake" }, NOW)!;
  // 3 teams of 3: 3 captains, 6 open spots → half = 3 picks, Snake → A, B, C.
  assert.deepEqual(ball.players.slice(3).map(p => p.teamIndex), [0, 1, 2, undefined, undefined, undefined]);
  const none = draftSimFixture({ draftSim: "team", teamDraftType: "4-Ball", teamDraftPlayers: 8 }, NOW)!;
  assert.equal(none.players.filter(p => p.teamIndex !== undefined).length, 2, "just the two captains");
});

test("big drafts: 3-Ball with 24 players and 4-Ball with 32 make 8 teams, each with a different captain", () => {
  for (const [type, count] of [["3-Ball", 24], ["4-Ball", 32]] as const) {
    const sample = draftSimFixture({ draftSim: "team", teamDraftType: type, teamDraftPlayers: count }, NOW)!;
    assert.equal(sample.players.length, count);
    assert.equal(new Set(sample.players.map(p => p.name)).size, count);
    assert.deepEqual(sample.players.filter(p => p.captain).map(p => p.teamIndex), [0, 1, 2, 3, 4, 5, 6, 7]);
  }
});

test("sample players carry a believable stats row (better handicap → lower average, more birdies)", () => {
  const sample = draftSimFixture({ draftSim: "team", teamDraftPlayers: 8 }, NOW)!;
  const [best, worst] = [sample.players[0], sample.players[7]];
  assert.ok(best.stats && worst.stats);
  assert.ok(best.stats.average < worst.stats.average && best.stats.adjusted < best.stats.average);
  assert.ok(best.stats.birdiesPerRound > worst.stats.birdiesPerRound && best.stats.girPct > worst.stats.girPct);
});
