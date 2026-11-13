import { test } from "node:test";
import assert from "node:assert/strict";
import { drawPairs, leaderboard, pairResults, segmentsOf, skins, stablefordPoints, teamHole, toParLabel, type League } from "./leagues.ts";

const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const SI = [7, 13, 17, 1, 9, 3, 15, 11, 5, 8, 14, 18, 2, 10, 4, 16, 12, 6];

/** A league with the given players' hole scores (strokes per hole; shorter arrays = holes not played yet). */
function league(cards: Record<string, number[]>, handicaps: Record<string, number | null> = {}, extra: Partial<League> = {}): League {
  const ids = Object.keys(cards);
  return {
    id: "l1", code: "ABC123", name: "Test League", organizer: ids[0], date: "2026-11-12", status: "live",
    course: { name: "Test GC", place: null, par: PAR, strokeIndex: SI, tee: null }, scoring: "Gross",
    players: ids.map((id) => ({ profileId: id, name: id.toUpperCase(), handicap: handicaps[id] ?? null })),
    groups: [{ number: 1, time: "08:00", hole: 1, scorer: ids[0], players: ids }],
    skins: { on: true, net: false, carryover: true },
    pairs: { on: true, format: "bestball", net: false, segments: 18, rule: "random", locked: true, teams: [] },
    holes: ids.flatMap((id) => cards[id].map((strokes, h) => ({ profileId: id, hole: h + 1, strokes }))),
    ...extra,
  };
}
const pars = (n: number, plus = 0) => PAR.slice(0, n).map((p) => p + plus);
/** A steady random sequence for draws. */
const seeded = (seed: number) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

test("leaderboard: total strokes and to par so far, lowest first; ties share a place; not started goes last", () => {
  const board = leaderboard(league({ a: pars(9, 1), b: pars(18), c: pars(18, 0).map((s, h) => h === 0 ? s - 1 : s), d: [] }), "Gross");
  assert.deepEqual(board.map((r) => [r.profileId, r.total, r.toPar, r.thru, r.position]), [
    ["c", 71, -1, 18, 1], ["b", 72, 0, 18, 2], ["a", 45, 9, 9, 3], ["d", null, null, 0, null],
  ]);
  const tied = leaderboard(league({ a: pars(18), b: pars(18) }), "Gross");
  assert.deepEqual(tied.map((r) => r.position), [1, 1]);
  assert.equal(toParLabel(0), "E"); assert.equal(toParLabel(3), "+3"); assert.equal(toParLabel(-2), "-2"); assert.equal(toParLabel(null), "–");
});

test("leaderboard: net takes off each player's handicap strokes (a 18 handicap gets one a hole)", () => {
  const l = league({ a: pars(18, 1), b: pars(18) }, { a: 18, b: 0 });
  assert.deepEqual(leaderboard(l, "Gross").map((r) => [r.profileId, r.total]), [["b", 72], ["a", 90]]);
  assert.deepEqual(leaderboard(l, "Net").map((r) => [r.profileId, r.total]), [["a", 72], ["b", 72]]);
});

test("skins: outright low across the whole league wins; ties carry over (or are lost with carryover off); open until everyone has a score", () => {
  const a = pars(3), b = pars(3), c = pars(3);
  a[0] -= 1;               // hole 1: a wins outright
  b[1] -= 1; c[1] -= 1;    // hole 2: tie → carries
  c[2] -= 1;               // hole 3: c wins 2 (1 + 1 carried)
  const l = league({ a, b, c: [...c, 4] });
  const result = skins(l);
  assert.deepEqual(result.holes.slice(0, 4).map((h) => [h.status, h.winner, h.value]), [["won", "a", 1], ["tied", null, 1], ["won", "c", 2], ["open", null, 1]]);
  assert.deepEqual(result.totals.map((t) => [t.profileId, t.skins]), [["c", 2], ["a", 1]]);
  const noCarry = skins({ ...l, skins: { ...l.skins, carryover: false } });
  assert.equal(noCarry.holes[2].value, 1);
});

test("skins: net uses handicap strokes on the hardest holes", () => {
  // Hole 4 is stroke index 1: a 1-handicap gets a stroke there, so a gross par ties a gross birdie… and wins net when the other makes par.
  const a = pars(4), b = pars(4);
  const l = league({ a, b }, { a: 1, b: 0 }, { skins: { on: true, net: true, carryover: true } });
  assert.deepEqual(skins(l).holes.slice(0, 4).map((h) => [h.status, h.winner]), [["tied", null], ["tied", null], ["tied", null], ["won", "a"]]);
});

const ids = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
const sixteen = (): Pick<League, "players" | "groups"> => ({
  players: ids.map((id, i) => ({ profileId: id, name: id, handicap: i })),
  groups: [0, 1, 2, 3].map((g) => ({ number: g + 1, time: "08:00", hole: 1, scorer: ids[g * 4], players: ids.slice(g * 4, g * 4 + 4) })),
});
const everyoneOnce = (pairs: string[][], players: string[]) => assert.deepEqual([...pairs.flat()].sort(), [...players].sort());

test("pair draws: every rule puts each player in exactly one pair of 2", () => {
  for (const rule of ["random", "balanced", "split-groups", "keep-groups"] as const) {
    const pairs = drawPairs(sixteen(), rule, seeded(7));
    everyoneOnce(pairs, ids);
    assert.ok(pairs.every((p) => p.length === 2), rule);
  }
});

test("pair draws: balanced pairs a better-half player with an other-half player; split and keep do what they say", () => {
  const l = sixteen();
  const group = (id: string) => l.groups.find((g) => g.players.includes(id))!.number;
  for (let seed = 1; seed < 20; seed++) {
    for (const [x, y] of drawPairs(l, "balanced", seeded(seed))) assert.notEqual(Number(x.slice(1)) <= 8, Number(y.slice(1)) <= 8);
    for (const [x, y] of drawPairs(l, "split-groups", seeded(seed))) assert.notEqual(group(x), group(y));
    for (const [x, y] of drawPairs(l, "keep-groups", seeded(seed))) assert.equal(group(x), group(y));
  }
});

test("pair draws: an odd number of players makes one team of 3", () => {
  const l = sixteen();
  const odd = { players: l.players.slice(0, 15), groups: [...l.groups.slice(0, 3), { ...l.groups[3], players: l.groups[3].players.slice(0, 3) }] };
  for (const rule of ["random", "balanced", "split-groups", "keep-groups"] as const) {
    const pairs = drawPairs(odd, rule, seeded(3));
    everyoneOnce(pairs, ids.slice(0, 15));
    assert.deepEqual(pairs.map((p) => p.length).sort(), [2, 2, 2, 2, 2, 2, 3], rule);
  }
});

test("pairs game: best ball, combined and both Stableford formats, counted once every teammate has a score", () => {
  const cards = { a: [3, 5], b: [5, 4] }; // hole 1 par 4: a birdie, b bogey. Hole 2 par 4: a bogey, b par.
  const base = league(cards, {}, { pairs: { on: true, format: "bestball", net: false, segments: 18, rule: "random", locked: true, teams: [["a", "b"]] } });
  const at = (format: League["pairs"]["format"], hole: number) => teamHole({ ...base, pairs: { ...base.pairs, format } }, ["a", "b"], hole);
  assert.deepEqual([at("bestball", 0), at("bestball", 1)], [3, 4]);
  assert.deepEqual([at("combined", 0), at("combined", 1)], [8, 9]);
  assert.deepEqual([at("stableford-bestball", 0), at("stableford-bestball", 1)], [3, 2]);
  assert.deepEqual([at("stableford-combined", 0), at("stableford-combined", 1)], [4, 3]);
  assert.equal(at("bestball", 2), null, "hole 3 not played");
  assert.equal(stablefordPoints(7, 4), 0);
  // A team of 3: best ball takes the best one, combined the best two.
  const three = league({ a: [3], b: [5], c: [4] });
  assert.equal(teamHole({ ...three, pairs: { ...three.pairs, format: "combined" } }, ["a", "b", "c"], 0), 7);
});

test("pairs game: winners per segment (6, 9 or 18 holes), final once every team has played the segment's holes", () => {
  assert.deepEqual(segmentsOf(6), [[0, 6], [6, 12], [12, 18]]);
  assert.deepEqual(segmentsOf(9), [[0, 9], [9, 18]]);
  const cards = { a: pars(9, 0).map((s, h) => h === 0 ? s - 1 : s), b: pars(9), c: pars(9), d: pars(9) };
  const l = league(cards, {}, { pairs: { on: true, format: "bestball", net: false, segments: 9, rule: "random", locked: true, teams: [["a", "b"], ["c", "d"]] } });
  const [front, back] = pairResults(l);
  assert.equal(front.label, "Front 9"); assert.equal(back.label, "Back 9");
  assert.equal(front.final, true);
  assert.deepEqual(front.winners, [["a", "b"]]);
  assert.deepEqual(front.standings.map((s) => [s.names, s.total, s.toPar, s.thru]), [["A & B", 35, -1, 9], ["C & D", 36, 0, 9]]);
  // Combined plays double par (both scores count); Stableford shows points, not to par.
  const combined = pairResults({ ...l, pairs: { ...l.pairs, format: "combined" } })[0];
  assert.deepEqual(combined.standings.map((s) => [s.total, s.toPar]), [[71, -1], [72, 0]]);
  assert.equal(pairResults({ ...l, pairs: { ...l.pairs, format: "stableford-combined" } })[0].standings[0].toPar, null);
  // While teams are on different holes, the one better against par leads, not the one with fewer strokes.
  const uneven = league({ a: pars(5, 1), b: pars(5, 1), c: pars(2), d: pars(2) }, {}, { pairs: { ...l.pairs, segments: 9 } });
  assert.deepEqual(pairResults(uneven)[0].standings.map((s) => [s.names, s.toPar, s.thru]), [["C & D", 0, 2], ["A & B", 5, 5]]);
  assert.equal(back.final, false);
  assert.deepEqual(back.winners, []);
  // Points formats: most wins.
  const points = pairResults({ ...l, pairs: { ...l.pairs, format: "stableford-bestball" } })[0];
  assert.deepEqual(points.winners, [["a", "b"]]);
});

test("league changes: the page applies each change the way the server saves it", async () => {
  const { applyLeagueChange, makeTeeTimes, ungrouped, leagueSection } = await import("./leagues.ts");
  const base = league({ a: [4], b: [5], c: [], d: [] });
  // Strokes: set, replace, clear (holes are 1-based).
  let next = applyLeagueChange(base, { action: "strokes", player: "c", hole: 1, strokes: 3 });
  next = applyLeagueChange(next, { action: "strokes", player: "a", hole: 1, strokes: 6 });
  next = applyLeagueChange(next, { action: "strokes", player: "b", hole: 1, strokes: null });
  assert.deepEqual(next.holes.map((h) => [h.profileId, h.strokes]).sort(), [["a", 6], ["c", 3]]);
  // Groups: same players keep their game; changed players start over; the scorer must be in the group.
  next = applyLeagueChange({ ...next, groups: [{ number: 1, time: "08:00", hole: 1, scorer: "a", players: ["a", "b"], game: { id: "skins", net: false, birdiesDouble: false }, inputs: [] }] },
    { action: "groups", groups: [{ time: "08:10", hole: 1, scorer: "a", players: ["a", "b"] }, { time: "08:20", hole: 10, scorer: "z", players: ["c", "d"] }] });
  assert.equal(next.groups[0].game?.id, "skins"); assert.equal(next.groups[0].time, "08:10");
  assert.equal(next.groups[1].scorer, "c"); assert.equal(next.groups[1].number, 2);
  next = applyLeagueChange(next, { action: "groups", groups: [{ time: "08:10", hole: 1, scorer: "a", players: ["a", "c"] }] });
  assert.equal(next.groups[0].game, null);
  assert.deepEqual(ungrouped(next).map((p) => p.profileId), ["b", "d"]);
  // Game, submit, end.
  next = applyLeagueChange(next, { action: "game", group: 1, game: { id: "wolf", net: true, birdiesDouble: false }, inputs: [{ wolfPartner: 1 }] });
  assert.equal(next.groups[0].game?.id, "wolf"); assert.equal(next.groups[0].inputs?.length, 1);
  assert.equal(applyLeagueChange(next, { action: "submit", group: 1 }).groups[0].submitted, true);
  assert.equal(applyLeagueChange(next, { action: "end" }).status, "ended");
  // Tee times: everyone once, foursomes (threesomes when it doesn't divide), timed, scorer = first player.
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  const groups = makeTeeTimes(ids, { first: "08:00", every: 10, start: "1" }, seeded(5));
  assert.deepEqual(groups.map((g) => g.players.length), [4, 3, 3]);
  assert.deepEqual([...groups.flatMap((g) => g.players)].sort(), [...ids].sort());
  assert.deepEqual(groups.map((g) => g.time), ["08:00", "08:10", "08:20"]);
  assert.ok(groups.every((g) => g.scorer === g.players[0]));
  // The Leagues tab's sections.
  assert.equal(leagueSection({ status: "ended", date: "2026-11-20" }, "2026-11-12"), "Past");
  assert.equal(leagueSection({ status: "live", date: "2026-11-20" }, "2026-11-12"), "Upcoming");
  assert.equal(leagueSection({ status: "live", date: "2026-11-01" }, "2026-11-12"), "Live");
});
