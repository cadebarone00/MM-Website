// lib/data/roundFormatArchive.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundFormatArchive } from "./roundFormatArchive.ts";
import type { RealMatch } from "./types.ts";

function match(overrides: Partial<RealMatch> & Pick<RealMatch, "id" | "day" | "session" | "format" | "maroonPlayers" | "whitePlayers">): RealMatch {
  return { maroonPts: 0, whitePts: 0, ...overrides };
}

test("roundFormatArchive numbers rounds true-round-of-the-trip, grouping every simultaneous matchup", () => {
  const matches: RealMatch[] = [
    match({ id: "m1", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["a", "b"], whitePlayers: ["c", "d"] }),
    match({ id: "m2", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["e", "f"], whitePlayers: ["g", "h"] }),
    match({ id: "m3", day: 1, session: "Afternoon", format: "Alt Shot", maroonPlayers: ["a", "c"], whitePlayers: ["b", "d"] }),
    match({ id: "m4", day: 2, session: "Morning", format: "Singles", maroonPlayers: ["a"], whitePlayers: ["e"] }),
  ];
  const result = roundFormatArchive({ matches });
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], { round: 1, day: 1, session: "Morning", format: "Fourball", matchups: [{ side: ["a", "b"], opponent: ["c", "d"] }, { side: ["e", "f"], opponent: ["g", "h"] }] });
  assert.equal(result[1].round, 2);
  assert.equal(result[1].format, "Alt Shot");
  assert.equal(result[2].round, 3);
  assert.deepEqual(result[2].matchups, [{ side: ["a"], opponent: ["e"] }]);
});

test("roundFormatArchive returns an empty list for a tournament with no matches", () => {
  assert.deepEqual(roundFormatArchive({ matches: [] }), []);
});
