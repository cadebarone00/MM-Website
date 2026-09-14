// lib/data/roundFormatArchive.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundFormatArchive, groupRoundFormatArchiveByDay } from "./roundFormatArchive.ts";
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
  assert.deepEqual(result[0], { round: 1, day: 1, session: "Morning", format: "Fourball", matchups: [{ side: ["a", "b"], opponent: ["c", "d"], teeTime: undefined }, { side: ["e", "f"], opponent: ["g", "h"], teeTime: undefined }] });
  assert.equal(result[1].round, 2);
  assert.equal(result[1].format, "Alt Shot");
  assert.equal(result[2].round, 3);
  assert.deepEqual(result[2].matchups, [{ side: ["a"], opponent: ["e"], teeTime: undefined }]);
});

test("roundFormatArchive carries a match's tee time through when it's set", () => {
  const matches: RealMatch[] = [match({ id: "m1", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["a", "b"], whitePlayers: ["c", "d"], teeTimeCst: "8:30 AM" })];
  const result = roundFormatArchive({ matches });
  assert.equal(result[0].matchups[0].teeTime, "8:30 AM");
});

test("roundFormatArchive returns an empty list for a tournament with no matches", () => {
  assert.deepEqual(roundFormatArchive({ matches: [] }), []);
});

test("groupRoundFormatArchiveByDay pairs Morning/Afternoon and leaves a missing session null", () => {
  const matches: RealMatch[] = [
    match({ id: "m1", day: 1, session: "Morning", format: "Fourball", maroonPlayers: ["a"], whitePlayers: ["b"] }),
    match({ id: "m2", day: 2, session: "Afternoon", format: "Singles", maroonPlayers: ["a"], whitePlayers: ["b"] }),
  ];
  const entries = roundFormatArchive({ matches });
  const days = groupRoundFormatArchiveByDay(entries, { 1: "2025-01-07" });
  assert.equal(days.length, 2);
  assert.equal(days[0].date, "2025-01-07");
  assert.equal(days[0].morning?.format, "Fourball");
  assert.equal(days[0].afternoon, null);
  assert.equal(days[1].date, null); // no dayDates entry for day 2
  assert.equal(days[1].morning, null);
  assert.equal(days[1].afternoon?.format, "Singles");
});
