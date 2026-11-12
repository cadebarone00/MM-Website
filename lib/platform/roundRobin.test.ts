import { test } from "node:test";
import assert from "node:assert/strict";
import { roundRobinSchedule, roundRobinStandings, validRoundRobinResults } from "./roundRobin";
import { validSetup } from "./savedTripSetup";

test("2–64 sides each meet every opponent once, without double booking or counting byes as matches", () => {
  for (let count = 2; count <= 64; count++) {
    const ids = Array.from({ length: count }, (_, i) => `side-${i}`), schedule = roundRobinSchedule(ids);
    assert.equal(schedule.length, count % 2 ? count : count - 1);
    const pairs = schedule.flatMap(rotation => rotation.matches.map(match => [match.home, match.away].sort().join("/")));
    assert.equal(pairs.length, count * (count - 1) / 2);
    assert.equal(new Set(pairs).size, pairs.length);
    for (const rotation of schedule) {
      const playing = rotation.matches.flatMap(match => [match.home, match.away]);
      assert.equal(new Set(playing).size, playing.length);
      assert.equal(playing.length + (rotation.bye ? 1 : 0), count);
      if (rotation.bye) assert.ok(!playing.includes(rotation.bye));
    }
  }
  assert.deepEqual(roundRobinSchedule(["same", "same"]), []);
});

test("standings count only recorded matches, share percentage ranks, and support corrections", () => {
  const sides = ["A", "B", "C"].map(id => ({ id, name: id })), schedule = roundRobinSchedule(sides.map(s => s.id));
  const match = schedule[0].matches[0];
  const standings = roundRobinStandings(sides, schedule, { [match.id]: "tie", garbage: "home" });
  assert.equal(standings.reduce((sum, row) => sum + row.played, 0), 2);
  assert.equal(standings[0].percentage, .5);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 1);
  const corrected = roundRobinStandings(sides, schedule, { [match.id]: "away" });
  assert.equal(corrected[0].id, match.away);
  assert.equal(corrected[0].wins, 1);
  assert.equal(corrected.find(row => row.id === match.home)?.losses, 1);
  assert.ok(roundRobinStandings(sides, schedule, {}).every(row => row.played === 0));
});

test("saved setup accepts round-robin selection/results, rejects malformed outcomes and bounds", () => {
  const choice = { method: "Round Robin", draftType: null, date: "", time: "" };
  assert.equal(validSetup({ allRoundsMatch: choice, matchSelections: { "0-0": choice }, roundRobinResults: { roster: "lineup", outcomes: { "side-0~side-1": "tie" } } }), true);
  assert.equal(validSetup({ localCompetitionType: { individual: "Match Play", team: null } }), true);
  assert.equal(validSetup({ localCompetitionType: { individual: "Stableford", team: null } }), true);
  assert.equal(validRoundRobinResults({ roster: "x", outcomes: { a: "winner" } }), false);
  assert.equal(validSetup({ roundRobinResults: { roster: "x", outcomes: { a: "away" }, secret: "extra" } }), false);
  assert.equal(validSetup({ roundRobinResults: { roster: "x", outcomes: Array(2).fill("tie") } }), false);
  const matches = roundRobinSchedule(Array.from({ length: 64 }, (_, i) => `side-${i}`)).flatMap(rotation => rotation.matches);
  assert.equal(validSetup({ roundRobinResults: { roster: "x".repeat(10000), outcomes: Object.fromEntries(matches.map(match => [match.id, "home"])) } }), true);
});
