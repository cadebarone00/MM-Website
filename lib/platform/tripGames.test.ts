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

test("Snake from the scorecard: whoever 3-putted holds it; a hole with no 3-putt leaves it where it was", async () => {
  const { snakeFromPutts } = await import("./tripGames");
  const m = trip(true);
  m.leaderboard = m.leaderboard.map((row) => ({ ...row, putts: row.golfer.name === "Drew" ? [3, 2, 2] : row.golfer.name === "Luke" ? [2, 3, 2] : [2, 2, 2] }));
  const inputs = snakeFromPutts(m, { round: 2, players: ["Cam", "Drew", "Cade", "Luke"] });
  assert.deepEqual(inputs.slice(0, 3), [{ snake: 1 }, { snake: 3 }, {}]);
  const result = scoreGame({ id: "snake", net: false, birdiesDouble: false }, gamePlayers(m, ["Cam", "Drew", "Cade", "Luke"]), gameCourse(m), [0, 18],
    gameStrokes(m, { round: 2, players: ["Cam", "Drew", "Cade", "Luke"] }), inputs);
  assert.equal(result.note, "Luke has the snake");
});

test("Vegas hole by hole: with the same teams all round it matches Play's Vegas exactly; changing teams on a hole changes only that hole", async () => {
  const { vegasByHole } = await import("./tripGames");
  const m = trip(true), names = ["Cam", "Drew", "Cade", "Luke"];
  const strokes = gameStrokes(m, { round: 2, players: names }), players = gamePlayers(m, names);
  const config = { id: "vegas" as const, net: false, birdiesDouble: false, teams: [0, 0, 1, 1] };
  const play = scoreGame(config, players, gameCourse(m), [0, 18], strokes, []);
  const trip1 = vegasByHole({ key: "v", round: 2, players: names, inputs: [], config }, players, gameCourse(m), strokes);
  assert.deepEqual(trip1.standings.map((s) => [s.label, s.value]), play.standings.map((s) => [s.label, s.value]));
  const swapped = vegasByHole({ key: "v", round: 2, players: names, inputs: [{}, { teams: [0, 1, 0, 1] }], config }, players, gameCourse(m), strokes);
  const byName = (r: typeof trip1) => Object.fromEntries(r.standings.map((s) => [s.label, s.value]));
  // Hole 2 (par 5): Drew's 4 is a birdie, so the other side's number flips (56 → 65): 65 − 45 = 20 from each opponent.
  assert.deepEqual(byName(trip1), { Cam: "+40", Drew: "+40", Cade: "-40", Luke: "-40" });
  assert.deepEqual(byName(swapped), { Cam: "-40", Drew: "+40", Cade: "-40", Luke: "+40" }, "Drew & Luke win hole 2 with the swapped teams");
});

test("organizer games: each round's games become my group's games, sized to fit, made once", async () => {
  const { organizerGames } = await import("./tripGames");
  const group = ["Cam", "Drew", "Cade", "Luke"];
  const made = organizerGames({ "1": ["wolf", "nines", "daytona"], "2": ["match"] }, group, []);
  assert.deepEqual(made.map((g) => [g.round, g.config.id, g.players.length, g.started]), [[1, "wolf", 4, true], [1, "nines", 3, true], [2, "match", 4, false]],
    "Daytona needs 5 so it's skipped; Nines takes 3; Match Play waits for teams");
  assert.equal(organizerGames({ "1": ["wolf"] }, group, made).length, 0, "already made");
});
