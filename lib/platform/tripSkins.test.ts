import assert from "node:assert/strict";
import test from "node:test";
import type { GolfMatchPreview } from "./golfTripPreviewFixture";
import { skinsCount, skinsRoundsFrom } from "./tripSkins";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const row = (name: string, holes: (number | null)[]) => ({ position: "1", golfer: { name, hcp: 0, thru: "", score: "", teeTime: "", course: "" }, total: "", thru: "", today: "", netTotal: "", netToday: "", holes });
const field = (rows: ReturnType<typeof row>[], skins: GolfMatchPreview["skins"]): GolfMatchPreview => ({ round: 1, roundCount: 1, course: "", roundDate: "", format: "", handicap: false, par: PAR, matches: [], skins,
  sides: [{ name: "A", winPct: 50, fairwayPct: "", greenPct: "", putts: "", score: "" }, { name: "B", winPct: 50, fairwayPct: "", greenPct: "", putts: "", score: "" }], leaderboard: rows });

test("one player alone with the low score wins the skin; a tie for low gives no skin; unfinished holes don't count", () => {
  const pars = (edits: Record<number, number>, upTo = 18) => PAR.map((p, h) => h >= upTo ? null : edits[h] ?? p);
  const m = field([row("Cam", pars({ 4: 3, 5: 3 })), row("Drew", pars({ 5: 3 })), row("Cade", pars({}, 17)), row("Luke", pars({ 17: 4 }))], [{ round: 1, players: null }]);
  // Hole 5: only Cam birdies → skin. Hole 6: Cam and Drew birdie → no skin. Hole 18: Cade hasn't finished → not yet.
  assert.deepEqual(Object.fromEntries(skinsCount(m)!), { Cam: 1, Drew: 0, Cade: 0, Luke: 0 });
});

test("only the round's skins players count; rounds without skins show nothing", () => {
  const m = field([row("Cam", PAR.map((p) => p)), row("Drew", PAR.map((p, h) => h === 0 ? 3 : p)), row("Cade", PAR.map((p, h) => h === 0 ? 2 : p))], [{ round: 1, players: ["Cam", "Drew"] }]);
  assert.deepEqual(Object.fromEntries(skinsCount(m)!), { Cam: 0, Drew: 1 }, "Cade's eagle doesn't count; he isn't in skins");
  assert.equal(skinsCount(field([], [{ round: 2, players: null }])), null);
});

test("settings: skins off = none; rounds on unless switched off; players are roster positions", () => {
  const rounds = [{ number: 1, dayNumber: 1 }, { number: 2, dayNumber: 2 }, { number: 3, dayNumber: 2 }];
  assert.deepEqual(skinsRoundsFrom(rounds, { skinsOn: false }, []), []);
  const on = skinsRoundsFrom(rounds, { skinsOn: true, skinsRounds: { "1-0": false }, skinsPlayers: { "1-1": { $set: [0, 2] } } }, ["Cam", "Drew", "Cade"]);
  assert.deepEqual(on, [{ round: 1, players: null }, { round: 3, players: ["Cam", "Cade"] }]);
});
