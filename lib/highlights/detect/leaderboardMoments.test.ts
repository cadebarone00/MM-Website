import { test } from "node:test";
import assert from "node:assert/strict";
import type { TripRoundScoring } from "../../platform/tripScoring.ts";
import { detectLeaderboardMoments, type LeaderboardRound } from "./leaderboardMoments.ts";
import { buildScoring, PARS_72, type FixturePlayer } from "./scoringFixture.ts";

const ids = ["a", "b", "c", "d", "e", "f", "g"];
const players = (n: number): FixturePlayer[] => ids.slice(0, n).map((id, i, all) => ({ id, name: id.toUpperCase(), attester: all[(i + 1) % all.length] }));
const names = new Map(ids.map((id) => [id, id.toUpperCase()]));
/** Per player: strokes to par per hole (0 = par); missing holes = not played. */
function card(toPar: number[], through = toPar.length) { return PARS_72.map((p, i) => (i < through ? p + (toPar[i] ?? 0) : null)); }
function later(scoring: TripRoundScoring, days: number): TripRoundScoring {
  const shift = (t: string) => new Date(Date.parse(t) + days * 86_400_000).toISOString();
  return { ...scoring, entries: scoring.entries.map((e) => ({ ...e, clientUpdatedAt: shift(e.clientUpdatedAt) })) };
}
const run = (rounds: LeaderboardRound[], finalRound = rounds.length) => detectLeaderboardMoments({ tripId: "t", rounds, finalRound, names });
const what = (moments: ReturnType<typeof run>) => moments.map((m) => `${m.ruleId}:${m.values.Player ?? "-"}@${m.hole}`);

test("solo leader, then tied for the lead, then a breakaway", () => {
  const scoring = buildScoring(players(3), { a: card([-1, 0, -1, -1]), b: card([0, -1, 0, 0]), c: card([0, 0, 0, 0]) }, { roundId: "r1" });
  const r = what(run([{ roundNumber: 1, scoring, pars: PARS_72 }], 2));
  assert.equal(r[0], "HL-031:A@1", r.join());
  assert.ok(r.includes("HL-032:B@2"), r.join());
  assert.ok(r.includes("HL-031:A@3"), "A takes it back alone");
  assert.ok(!r.includes("HL-033:A@4"), "only 2 clear of B");
});

test("a 3-shot solo lead is a breakaway; 3 players within a shot is a shakeup", () => {
  const away = buildScoring(players(3), { a: card([-1, -1, -1]), b: card([0, 0, 0]), c: card([0, 0, 0]) });
  assert.ok(what(run([{ roundNumber: 1, scoring: away, pars: PARS_72 }], 2)).some((x) => x.startsWith("HL-033:A")));
  const pack = buildScoring(players(5), { a: card([-1, 0]), b: card([0, 0]), c: card([0, 0]), d: card([0, 0]), e: card([1, 1]) });
  assert.ok(what(run([{ roundNumber: 1, scoring: pack, pars: PARS_72 }], 2)).some((x) => x.startsWith("HL-034")));
});

test("champion when the final round is done, a playoff on a tie, and no pars = no leaderboard", () => {
  const solo = buildScoring(players(2), { a: card(Array(18).fill(0)), b: card([1, ...Array(17).fill(0)]) });
  assert.ok(what(run([{ roundNumber: 1, scoring: solo, pars: PARS_72 }])).includes("HL-039:A@18"));
  const tie = buildScoring(players(2), { a: card(Array(18).fill(0)), b: card(Array(18).fill(0)) });
  const playoff = run([{ roundNumber: 1, scoring: tie, pars: PARS_72 }]).find((m) => m.ruleId === "HL-038");
  assert.equal(playoff?.values.Players, "A & B");
  assert.deepEqual(run([{ roundNumber: 1, scoring: solo, pars: null }]), []);
});

test("a big climb: 5+ places up from where the player started the round", () => {
  const p = players(7);
  const r1 = buildScoring(p, { a: card([-2]), b: card([-2]), c: card([-1]), d: card([-1]), e: card([-1]), f: card([0]), g: card([3]) }, { roundId: "r1" });
  const r2 = later(buildScoring(p, { g: card([-3, -3]), a: card([0]), b: card([0]), c: card([0]), d: card([0]), e: card([0]), f: card([0]) }, { roundId: "r2", roundNumber: 2 }), 1);
  const moments = run([{ roundNumber: 1, scoring: r1, pars: PARS_72 }, { roundNumber: 2, scoring: r2, pars: PARS_72 }], 3);
  const climb = moments.find((m) => m.ruleId === "HL-035");
  assert.equal(climb?.values.Player, "G", what(moments).join());
});

test("end to end with the built-in sheet: a new solo leader becomes a real notification", async () => {
  const { runShadow } = await import("./shadow.ts");
  const { BUILT_IN_HIGHLIGHTS } = await import("../builtIn.ts");
  const { competitionProfile, setupFor } = await import("../engine/competition.ts");
  const scoring = buildScoring(players(3), { a: card([-1]), b: card([0]), c: card([0]) });
  const report = runShadow({
    detection: { tripId: "t", scoring: buildScoring([], {}), pars: null, course: null, leaderboard: { tripId: "t", rounds: [{ roundNumber: 1, scoring, pars: PARS_72 }], finalRound: 2, names } },
    config: BUILT_IN_HIGHLIGHTS!, configVersion: null, competition: competitionProfile(setupFor("individual-only", false)),
    members: ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase() })),
  });
  const delivered = report.rows.filter((r) => r.moment.ruleId === "HL-031" && r.outcome === "delivered");
  assert.ok(delivered.length > 0, JSON.stringify(report.rows.filter((r) => r.moment.ruleId === "HL-031").map((r) => r.reason)));
  assert.doesNotMatch(`${delivered[0].alert!.title} ${delivered[0].alert!.body}`, /\{/);
});
