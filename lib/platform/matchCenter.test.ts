import assert from "node:assert/strict";
import test from "node:test";
import type { GolfMatchPreview } from "./golfTripPreviewFixture";
import { matchCard, winCurve, withHoleStandings } from "./matchCenter";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const golfer = (name: string, hcp: number) => ({ name, hcp, thru: "", score: "", teeTime: "", course: "" });
const row = (name: string, hcp: number, holes: (number | null)[]) => ({ position: "1", golfer: golfer(name, hcp), total: "", thru: "", today: "", netTotal: "", netToday: "", holes });
const played = (scores: number[]) => PAR.map((_, h) => scores[h] ?? null);
function preview(a: (number | null)[], b: (number | null)[], hcps: [number, number] = [5, 5]): GolfMatchPreview {
  return { round: 1, roundCount: 1, course: "Test", roundDate: "2027-01-01", format: "Singles", handicap: false, par: PAR,
    sides: [{ name: "Maroon", winPct: 50, fairwayPct: "", greenPct: "", putts: "", score: "" }, { name: "White", winPct: 50, fairwayPct: "", greenPct: "", putts: "", score: "" }],
    matches: [{ left: golfer("Ace", hcps[0]), right: golfer("Bo", hcps[1]), gross: null, net: null }],
    leaderboard: [row("Ace", hcps[0], a), row("Bo", hcps[1], b)] };
}

test("scorecard: hole winners and running lead from the players' scores; status / THRU follow them", () => {
  const m = preview(played([3, 5, 3]), played([4, 5, 4]));
  const card = matchCard(m, m.matches[0], false);
  assert.deepEqual(card.holes.slice(0, 3).map((h) => [h.winner, h.lead]), [["left", 1], ["halved", 1], ["left", 2]]);
  assert.equal(card.played, 3);
  assert.deepEqual(card.standing, { leader: "left", up: 2 });
  const fixed = withHoleStandings(m).matches[0];
  assert.deepEqual(fixed.gross, { leader: "left", up: 2 });
  assert.equal((fixed.left as { thru: string }).thru, "Thru 3");
});

test("a match ends once it's decided: 5&4 after 14 holes", () => {
  const card = matchCard(preview(played(Array(14).fill(3)), played([3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4])), preview([], []).matches[0], false);
  assert.equal(card.played, 14);
  assert.equal(card.result, "5&4");
});

test("win curve: stronger player favored before hole 1; winning holes moves it; decided = 100%", () => {
  const m = preview(played([]), played([]), [2, 24]);
  const start = winCurve(m, matchCard(m, m.matches[0], false), 1500)[0];
  assert.ok(start.left > 0.75, `scratch-ish favored: ${start.left}`);
  const even = preview(played([3, 3, 3]), played([5, 5, 5]));
  const curve = winCurve(even, matchCard(even, even.matches[0], false), 1500);
  assert.equal(curve.length, 4);
  assert.ok(curve[3].left > curve[0].left + 0.2, "3 up after 3 helps a lot");
  const done = preview(played(Array(14).fill(3)), played(Array(14).fill(4)));
  const final = winCurve(done, matchCard(done, done.matches[0], false), 300);
  assert.deepEqual(final.at(-1), { hole: 10, left: 1, halved: 0, right: 0 });
});

test("net: handicap strokes come off on the hardest holes", () => {
  const m = { ...preview(played([4]), played([5]), [0.1, 18]), handicap: true };
  assert.equal(matchCard(m, m.matches[0], true).holes[0].winner, "halved");
  assert.equal(matchCard(m, m.matches[0], false).holes[0].winner, "left");
});

test("net match: handicap strokes even it out, so it starts near 50/50 even for a 2 vs a 24 (and an unknown handicap)", () => {
  const m = { ...preview(played([]), played([]), [2, 24]), handicap: true };
  const gross = winCurve(m, matchCard(m, m.matches[0], false), 3000)[0];
  const net = winCurve(m, matchCard(m, m.matches[0], true), 3000)[0];
  assert.ok(gross.left > 0.75, `gross favors the 2: ${gross.left}`);
  assert.ok(Math.abs(net.left - net.right) < 0.12, `net near even: ${net.left} vs ${net.right}`);
  const unknown = { ...preview(played([]), played([]), [18, 0]), handicap: true };
  const u = winCurve(unknown, matchCard(unknown, unknown.matches[0], true), 3000)[0];
  assert.ok(Math.abs(u.left - u.right) < 0.12, `unknown handicap treated as 18: ${u.left} vs ${u.right}`);
});
