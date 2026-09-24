// lib/data/tournamentRoundSequence.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { tournamentRoundSequence } from "./tournamentRoundSequence.ts";
import type { RealMatch } from "./types.ts";

function match(overrides: Partial<RealMatch> & Pick<RealMatch, "id" | "day" | "session" | "format">): RealMatch {
  return { maroonPlayers: [], whitePlayers: [], maroonPts: 0, whitePts: 0, ...overrides };
}

test("tournamentRoundSequence orders by day then Morning before Afternoon", () => {
  const matches = [
    match({ id: "m4", day: 2, session: "Afternoon", format: "Singles" }),
    match({ id: "m1", day: 1, session: "Morning", format: "Fourball" }),
    match({ id: "m3", day: 2, session: "Morning", format: "Fourball" }),
    match({ id: "m2", day: 1, session: "Afternoon", format: "Alt Shot" }),
  ];
  const result = tournamentRoundSequence({ matches });
  assert.deepEqual(result.map((m) => m.id), ["m1", "m2", "m3", "m4"]);
  assert.equal(result[1].format, "Alt Shot"); // round 2
});

test("tournamentRoundSequence collapses multiple matches in the same day+session to one entry", () => {
  const matches = [
    match({ id: "m1", day: 1, session: "Morning", format: "Fourball" }),
    match({ id: "m2", day: 1, session: "Morning", format: "Fourball" }),
    match({ id: "m3", day: 1, session: "Morning", format: "Fourball" }),
  ];
  const result = tournamentRoundSequence({ matches });
  assert.equal(result.length, 1);
});
