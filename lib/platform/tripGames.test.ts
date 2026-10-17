import assert from "node:assert/strict";
import test from "node:test";
import type { GolfMatchPreview } from "./golfTripPreviewFixture";
import { scoreGame } from "./roundGames";
import { currentHole, gameCourse, gamePlayers, gameStrokes, groupOf, holesThru, meOn } from "./tripGames";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const golfer = (name: string, teeTime = "", hcp = 0) => ({ name, hcp, thru: "", score: "", teeTime, course: "" });
const row = (name: string, teeTime: string, holes: (number | null)[]) => ({ position: "1", golfer: golfer(name, teeTime, 10), total: "", thru: "", today: "", netTotal: "", netToday: "", holes });
const scores = (list: number[]) => PAR.map((_, h) => list[h] ?? null);
function trip(teeTimes: boolean): GolfMatchPreview {
  const t = (time: string) => teeTimes ? time : "";
  return { round: 2, roundCount: 3, course: "Test", roundDate: "2027-01-02", format: "Fourball", handicap: false, par: PAR,
    sides: [{ name: "Maroon", winPct: 50, fairwayPct: "", greenPct: "", putts: "", score: "" }, { name: "White", winPct: 50, fairwayPct: "", greenPct: "", putts: "", score: "" }],
    matches: [
      { left: { golfers: [golfer("Cam"), golfer("Drew")] }, right: { golfers: [golfer("Cade"), golfer("Luke")] }, gross: null, net: null },
      { left: { golfers: [golfer("Pete"), golfer("Hugo")] }, right: { golfers: [golfer("Kyle"), golfer("Quez")] }, gross: null, net: null },
    ],
    leaderboard: [
      row("Cam", t("8:00 AM"), scores([4, 5, 3])), row("Drew", t("8:00 AM"), scores([5, 4, 3])), row("Cade", t("8:00 AM"), scores([4, 6, 2])),
      row("Luke", t("8:00 AM"), scores([5, 5])), row("Pete", t("8:10 AM"), scores([4])), row("Hugo", t("8:10 AM"), []), row("Kyle", t("8:10 AM"), []), row("Quez", t("8:10 AM"), []),
    ] };
}

test("my group: my tee time, me first; without tee times, the players in my match", () => {
  assert.equal(meOn(trip(true)), "Cam");
  assert.equal(meOn(trip(true), "Someone Else"), "Cam", "a name that isn't on the trip falls back");
  assert.equal(meOn(trip(true), " Luke "), "Luke", "the signed-in player, matched by name");
  assert.deepEqual(groupOf(trip(true), "Luke"), ["Luke", "Cam", "Drew", "Cade"]);
  assert.deepEqual(groupOf(trip(true), "Cam"), ["Cam", "Drew", "Cade", "Luke"]);
  assert.deepEqual(groupOf(trip(false), "Pete"), ["Pete", "Hugo", "Kyle", "Quez"]);
});

test("scores come from the scorecard for the game's round only; current hole is the first one someone hasn't scored", () => {
  const m = trip(true);
  const strokes = gameStrokes(m, { round: 2, players: ["Cam", "Drew", "Cade", "Luke"] });
  assert.deepEqual(strokes.map((r) => r.slice(0, 3)), [[4, 5, 3], [5, 4, 3], [4, 6, 2], [5, 5, null]]);
  assert.equal(currentHole(strokes, 18), 2);
  assert.equal(holesThru(strokes, 18), 2);
  assert.ok(gameStrokes(m, { round: 1, players: ["Cam"] })[0].every((s) => s === null), "another round has no scores yet");
});

test("same rules as Play: a trip game's standings are exactly Play's scoreGame on the scorecard", () => {
  const m = trip(true), names = ["Cam", "Drew", "Cade", "Luke"];
  const strokes = gameStrokes(m, { round: 2, players: names });
  const config = { id: "wolf" as const, net: false, birdiesDouble: false };
  const inputs = [{ wolfPartner: 2 }, { wolfPartner: null }];
  const result = scoreGame(config, gamePlayers(m, names), gameCourse(m), [0, 18], strokes, inputs);
  assert.equal(result.standings.length, 4);
  // Hole 1: Wolf Cam picks Cade; Cam + Cade (best 4) beat Drew + Luke (best 5): +2 each, −2 each.
  // Hole 2: Drew is the Wolf and goes alone; his 4 beats everyone: +2 from each of 3 (Lone Wolf double) = +6, the rest −2.
  const value = (name: string) => result.standings.find((s) => s.label === name)?.value;
  assert.deepEqual([value("Cam"), value("Drew"), value("Cade"), value("Luke")], ["0", "+4", "0", "-4"]);
});
