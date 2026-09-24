import { test } from "node:test";
import assert from "node:assert/strict";
import { careerArchiveRecords, careerArchiveTeamRecords } from "@/lib/data/careerArchive";
import { pastTournaments } from "@/lib/data";
import { buildTournamentSetup, referenceSetup, roundList } from "./tournamentSetup";

const reference = referenceSetup(2027, careerArchiveRecords, careerArchiveTeamRecords, pastTournaments);

test("2027 defaults to the 2026 schedule, courses and roster from the Career Archive", () => {
  assert.ok(reference);
  assert.equal(reference.year, 2026);
  assert.equal(reference.rounds.size, 8);
  assert.deepEqual(
    [...reference.rounds.entries()].sort(([a], [b]) => a - b).map(([round, setup]) => [round, setup.format]),
    [[1, "Fourball"], [2, "Foursome"], [3, "Fourball"], [4, "Singles"], [5, "Fourball"], [6, "Foursome"], [7, "Singles"], [8, "Singles"]],
  );
  for (const setup of reference.rounds.values()) assert.equal(setup.course.holes.length, 18);
  assert.equal(reference.roster?.maroon.length, 6);
  assert.equal(reference.roster?.white.length, 6);
});

test("an unconfigured season uses every default and says so", () => {
  const setup = buildTournamentSetup({ roundCount: null, roundRows: [], snapshot: { players: {}, courses: {}, roundCourses: {} }, reference });
  assert.deepEqual(setup.blockers, []);
  assert.equal(setup.rounds.length, 8);
  assert.ok(setup.rounds.every((round) => round.formatAssumed && round.courseAssumed));
  assert.equal(setup.assumptions.length, 3);
});

test("what Tiger has set wins over the defaults", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, par: 4, yards: 400 }));
  const setup = buildTournamentSetup({
    roundCount: 2,
    roundRows: [{ round: 1, format: "Singles", matchups_locked: true }],
    snapshot: { players: { a: { team: "maroon" }, b: { team: "white" } }, courses: { c1: { id: "c1", name: "New Course", holes, rating: null, slope: null } }, roundCourses: { 1: "c1" } },
    reference,
  });
  assert.deepEqual(setup.roster, { maroon: ["a"], white: ["b"] });
  assert.equal(setup.rounds[0].format, "Singles");
  assert.equal(setup.rounds[0].course.key, "c1");
  assert.equal(setup.rounds[0].matchupsLocked, true);
  assert.equal(setup.rounds[0].formatAssumed || setup.rounds[0].courseAssumed, false);
  assert.equal(setup.rounds[1].format, "Foursome"); // 2026 round 2
  assert.ok(setup.rounds[1].courseAssumed);
  assert.deepEqual(setup.assumptions, ["Round 2 uses 2026's format and course until Tiger sets them."]);
});

test("a placeholder or incomplete course keeps last year's course", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, par: 4, yards: 400 }));
  const blank = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, par: 0, yards: 0 }));
  const setup = buildTournamentSetup({
    roundCount: 3,
    roundRows: [1, 2, 3].map((round) => ({ round, format: "Fourball", matchups_locked: false })),
    snapshot: {
      players: { a: { team: "maroon" }, b: { team: "white" } },
      courses: {
        tbd: { id: "tbd", name: "To Be Determined", holes, rating: null, slope: null },
        empty: { id: "empty", name: "New Course", holes: blank, rating: null, slope: null },
        real: { id: "real", name: "Real Course", holes, rating: null, slope: null },
      },
      roundCourses: { 1: "tbd", 2: "empty", 3: "real" },
    },
    reference,
  });
  assert.deepEqual(setup.rounds.map((round) => round.courseAssumed), [true, true, false]);
  assert.equal(setup.rounds[0].course.key, reference!.rounds.get(1)!.course.key);
  assert.deepEqual(setup.assumptions, ["Rounds 1–2 use 2026's course until Tiger sets them."]);
});

test("round lists collapse consecutive rounds", () => {
  assert.equal(roundList([1, 2, 3, 5, 7, 8]), "1–3, 5, 7–8");
});
