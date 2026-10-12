import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileHistoryRound } from "./playerRoundsRows";
import { ACE_CHANCE_PER_PAR3, BETS, betAllowed, holeInOneChance, priceTrip, type Market, type TripSetup } from "./predictBets";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course = { par: PAR, rating: 72, slope: 113 };
function history(over: number[]): ProfileHistoryRound[] {
  return Array.from({ length: 12 }, (_, n) => {
    const holes = PAR.map((par, i) => ({ number: i + 1, par, strokes: par + over[(i + n) % over.length], putts: null, fairway: null, green: null }));
    return { id: `r${n}`, holesPlayed: 18, holes, total: holes.reduce((a, h) => a + h.strokes, 0) } as unknown as ProfileHistoryRound;
  });
}
const players = [
  { id: "a", name: "Ace", team: 0 as const, rounds: history([0, 0, -1, 0, 1, 0]), handicapIndex: 3 },
  { id: "b", name: "Bo", team: 0 as const, rounds: history([1, 0, 1, 2, 0, 1]), handicapIndex: 14 },
  { id: "c", name: "Cy", team: 1 as const, rounds: history([1, 1, 2, 1, 0, 2]), handicapIndex: 20 },
  { id: "d", name: "Di", team: 1 as const, rounds: history([2, 1, 2, 3, 1, 2]), handicapIndex: 28 },
];
const teamTrip: TripSetup = {
  players, teamNames: ["Maroon", "Gold"], teamEvent: true,
  rounds: [
    { course, matches: [{ left: ["a"], right: ["c"], points: 1, nassau: false }, { left: ["b"], right: ["d"], points: 1, nassau: false }] },
    { course, matches: [{ left: ["a", "b"], right: ["c", "d"], points: 2, nassau: false }] },
  ],
};
const get = <K extends Market["kind"]>(markets: Market[], bet: string) => markets.find((m) => m.bet === bet) as Extract<Market, { kind: K }>;
const sum = (xs: { chance: number }[]) => xs.reduce((a, x) => a + x.chance, 0);

test("20 bets in 4 tabs; team bets aren't offered for individual-only trips", () => {
  assert.equal(BETS.length, 20);
  assert.equal(betAllowed("teamWinner", false), false);
  assert.equal(betAllowed("birdies", false), true);
  const individual = priceTrip({ ...teamTrip, teamEvent: false, rounds: teamTrip.rounds.map((r) => ({ ...r, matches: [] })) }, 1500, 2);
  assert.ok(!individual.some((m) => m.bet === "teamWinner" || m.bet === "matchMargin"));
  assert.ok(individual.some((m) => m.bet === "individualWinner"));
});

test("team bets: the stronger team is favoured, chances add up, spreads move with the line", () => {
  const markets = priceTrip(teamTrip, 3000, 4);
  const winner = get<"outcomes">(markets, "teamWinner");
  assert.ok(Math.abs(sum(winner.outcomes) - 1) < 1e-9);
  assert.ok(winner.outcomes[0].chance > winner.outcomes[1].chance, "Maroon (the better players) favoured");
  const spread = get<"spread">(markets, "teamSpread");
  for (let i = 1; i < spread.lines.length; i++) assert.ok(spread.lines[i].chanceA >= spread.lines[i - 1].chanceA, "giving Maroon more points only helps");
  assert.ok(spread.lines.some((l) => l.spread === spread.defaultSpread));
  const top = get<"outcomes">(markets, "topPointEarner");
  assert.equal(top.outcomes[0].id, "a");
  assert.ok(Math.abs(sum(top.outcomes) - 1) < 1e-9);
  const margin = get<"ladder">(markets, "matchMargin");
  for (let i = 1; i < margin.lines.length; i++) assert.ok(margin.lines[i].chance <= margin.lines[i - 1].chance, "bigger margins are less likely");
});

test("scoring ladders, most / least and the net winner", () => {
  const markets = priceTrip(teamTrip, 3000, 6);
  const low = get<"ladder">(markets, "lowRound");
  assert.ok(low.lines.length >= 3);
  for (let i = 1; i < low.lines.length; i++) assert.ok(low.lines[i].chance >= low.lines[i - 1].chance, "under a higher number is more likely");
  assert.ok(low.lines.every((l) => l.label.startsWith("Under ")));
  const high = get<"ladder">(markets, "highTotal");
  for (let i = 1; i < high.lines.length; i++) assert.ok(high.lines[i].chance <= high.lines[i - 1].chance);
  const birdies = get<"twoSided">(markets, "birdies");
  assert.equal(birdies.most[0].id, "a");
  assert.equal(birdies.least[0].id, "d");
  const gross = get<"outcomes">(markets, "lowTotal"), net = get<"outcomes">(markets, "individualWinner");
  assert.equal(gross.outcomes[0].id, "a");
  assert.ok(net.outcomes.find((o) => o.id === "d")!.chance > gross.outcomes.find((o) => o.id === "d")!.chance, "handicaps help the high handicapper");
});

test("hole in one: 1 in 12,500 per par 3, times every par 3 every player plays", () => {
  const expected = 1 - (1 - ACE_CHANCE_PER_PAR3) ** (4 * 2 * 4);
  assert.ok(Math.abs(holeInOneChance(teamTrip) - expected) < 1e-12);
  assert.ok(holeInOneChance(teamTrip) > 0.002 && holeInOneChance(teamTrip) < 0.003);
});

test("live scores move the odds: a hot start helps, a finished trip is certain, an ace makes it 100%", () => {
  const before = priceTrip(teamTrip, 3000, 8);
  const bo = (markets: Market[]) => get<"outcomes">(markets, "lowTotal").outcomes.find((o) => o.id === "b")!.chance;
  // Bo (a 14) is 8 under through 18 holes of round 1.
  const hot = PAR.map((p, i) => i < 8 ? p - 1 : p);
  const after = priceTrip({ ...teamTrip, live: { holes: { b: [hot] } } }, 3000, 8);
  assert.ok(bo(after) > bo(before) + 0.1, `${bo(before)} → ${bo(after)}`);
  // Every round finished: whoever has the lowest total is a lock.
  const totals = { a: [80, 80], b: [70, 70], c: [90, 90], d: [95, 95] };
  const done = priceTrip({ ...teamTrip, live: { roundTotals: totals } }, 500, 8);
  assert.equal(bo(done), 1);
  const ace = PAR.map((p) => p === 3 ? 1 : p);
  assert.equal(holeInOneChance({ ...teamTrip, live: { holes: { c: [ace] } } }), 1);
  assert.ok(holeInOneChance({ ...teamTrip, live: { roundTotals: totals } }) === 0, "no par 3s left to play");
});

test("today's matches: odds per match that follow the live holes", () => {
  type Matches = Extract<Market, { kind: "matches" }>;
  const start = priceTrip(teamTrip, 3000, 10).find((m) => m.bet === "todayMatches") as Matches;
  assert.equal(start.round, 0);
  assert.equal(start.matches.length, 2);
  assert.equal(start.matches[0].status, "Not started");
  assert.ok(Math.abs(start.matches[1].chances.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // Bo (14) v Di (28): Di leads 3 up through 9 → Di's chance jumps.
  const bo = PAR.map((p, i) => i < 9 ? p + 1 : null), di = PAR.map((p, i) => i < 9 ? (i < 3 ? p : p + 1) : null);
  const live = priceTrip({ ...teamTrip, live: { holes: { b: [bo], d: [di] } } }, 3000, 10).find((m) => m.bet === "todayMatches") as Matches;
  assert.equal(live.matches[1].status, "Thru 9 · Di 3 UP");
  assert.ok(live.matches[1].chances[2] > start.matches[1].chances[2] + 0.05, `${start.matches[1].chances[2]} → ${live.matches[1].chances[2]}`);
  // Net match play: handicap strokes make the 28 a real chance against the 14 from the first tee.
  const netTrip = { ...teamTrip, rounds: teamTrip.rounds.map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m, net: true })) })) };
  const net = priceTrip(netTrip, 3000, 10).find((m) => m.bet === "todayMatches") as Matches;
  assert.ok(net.matches[1].chances[2] > start.matches[1].chances[2] + 0.15, `gross ${start.matches[1].chances[2]} vs net ${net.matches[1].chances[2]}`);
  // Ace closes out Cy 5&4.
  const ace = PAR.map((p, i) => i < 14 ? (i < 5 ? p - 1 : p) : null), cy = PAR.map((p, i) => i < 14 ? p : null);
  const done = priceTrip({ ...teamTrip, live: { holes: { a: [ace], c: [cy] } } }, 1000, 10).find((m) => m.bet === "todayMatches") as Matches;
  assert.equal(done.matches[0].status, "Ace won 5&4");
  assert.equal(done.matches[0].chances[0], 1);
});

test("round over / unders: a line near 50 / 50 per player, and birdies already made raise it", () => {
  type Lines = Extract<Market, { kind: "playerLines" }>;
  const start = priceTrip(teamTrip, 3000, 12).find((m) => m.bet === "roundBirdies") as Lines;
  assert.equal(start.rows.length, 4);
  for (const row of start.rows) assert.ok(row.line % 1 === 0.5 && (row.line === 0.5 || (row.over > 0.15 && row.over < 0.85)), JSON.stringify(row));
  assert.ok(start.rows.find((r) => r.id === "a")!.line >= start.rows.find((r) => r.id === "d")!.line, "the better player gets the higher birdie line");
  // Di has 3 birdies through 6: their line can't sit below 3.5 any more.
  const hot = PAR.map((p, i) => i < 6 ? (i < 3 ? p - 1 : p) : null);
  const live = priceTrip({ ...teamTrip, live: { holes: { d: [hot] } } }, 3000, 12).find((m) => m.bet === "roundBirdies") as Lines;
  const di = live.rows.find((r) => r.id === "d")!;
  assert.equal(di.count, 3);
  assert.ok(di.line >= 3.5);
  const doubles = priceTrip(teamTrip, 3000, 12).find((m) => m.bet === "roundDoubles") as Lines;
  assert.ok(doubles.rows.find((r) => r.id === "d")!.line > doubles.rows.find((r) => r.id === "a")!.line, "the higher handicap gets the higher doubles line");
});

test("player score and greens / fairways / putts over / unders: better players get lower score lines, more greens, fewer putts", () => {
  const markets = priceTrip(teamTrip, 2000, 5);
  const round = get<"playerLines">(markets, "roundScore"), trip = get<"playerLines">(markets, "tripScore");
  assert.ok(round.rows[0].line < round.rows[3].line && trip.rows[0].line < trip.rows[3].line);
  assert.ok(trip.rows[0].line > round.rows[0].line * 1.8, "trip line covers both rounds");
  const stats = get<"statLines">(markets, "tripStats").stats;
  assert.ok(stats.gir[0].line > stats.gir[3].line && stats.fairways[0].line >= stats.fairways[3].line && stats.putts[0].line < stats.putts[3].line);
  for (const r of [...round.rows, ...stats.putts]) assert.ok(r.over > 0.25 && r.over < 0.75, "lines sit near 50 / 50");
  // Live: strokes already made count, and the line can't sit below them.
  const live = priceTrip({ ...teamTrip, live: { holes: { a: [PAR.map((p, h) => h < 9 ? p + 3 : null)] } } }, 2000, 5);
  const a = get<"playerLines">(live, "roundScore").rows[0];
  assert.ok(a.count > 0 && a.line > round.rows[0].line && a.line > a.count);
});
