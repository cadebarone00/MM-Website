import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatchOutcome } from "./matchMoments.ts";
import { detectTeamMoments, type TeamRound } from "./teamMoments.ts";

/** Maroon (m1–m4) v White (w1–w4). `results`: per match, in finishing order, "M" | "W" | "H" (halved) | "-" (not finished). */
const teams: [{ name: string; ids: string[] }, { name: string; ids: string[] }] = [{ name: "Maroon", ids: ["m1", "m2", "m3", "m4"] }, { name: "White", ids: ["w1", "w2", "w3", "w4"] }];
const names = new Map([["m1", "Alex"], ["m2", "Sam"], ["m3", "Cam"], ["m4", "Drew"], ["w1", "Blake"], ["w2", "Riley"], ["w3", "Jo"], ["w4", "Kai"]]);
let clock = 0;
const at = () => new Date(Date.UTC(2027, 3, 22, 14, 0) + (clock++) * 600_000).toISOString();
function round(roundNumber: number, results: string, opts: { up9?: number[] } = {}): TeamRound {
  const outcomes: MatchOutcome[] = [...results].map((r, i) => ({
    index: i, a: [`m${(i % 4) + 1}`], b: [`w${(i % 4) + 1}`],
    result: r === "M" ? "a" : r === "W" ? "b" : r === "H" ? "halved" : null, endedAt: r === "-" ? null : at(),
    upAfter9: opts.up9?.[i] ?? null, at9: opts.up9 ? at() : null,
  }));
  return { roundNumber, roundId: `r${roundNumber}`, pointsPerMatch: 1, outcomes };
}
const run = (...rounds: TeamRound[]) => detectTeamMoments({ tripId: "t", teams, rounds, names });
const ids = (moments: ReturnType<typeof run>) => moments.map((m) => `${m.ruleId}:${m.values.Team}`);

test("lead, 3 in a row, match point and the title (8 points: 4.5 wins)", () => {
  clock = 0;
  const moments = run(round(1, "MMMM"), round(2, "MW--"));
  const r = ids(moments);
  assert.equal(r[0], "HL-022:Maroon", "first lead");
  assert.ok(r.includes("HL-024:Maroon"), r.join());
  assert.ok(r.includes("HL-026:Maroon"), "4 points, one win from more than 4");
  assert.ok(r.includes("HL-029:Maroon"), "round 1 sweep");
  assert.ok(r.includes("HL-027:Maroon"), "5 > 4");
  assert.equal(moments.find((m) => m.ruleId === "HL-027")!.values.Opponent, "White");
});

test("tied by a match win names the winner; comeback from 3 down replaces 'tied'", () => {
  clock = 0;
  const tied = run(round(1, "MW--"));
  const t = tied.find((m) => m.ruleId === "HL-023")!;
  assert.equal(t.values.Team, "White");
  assert.equal(t.values.Player, "Riley");
  clock = 0;
  const back = ids(run(round(1, "WWWMMM--")));
  assert.ok(back.includes("HL-025:Maroon"), back.join());
  assert.ok(!back.includes("HL-023:Maroon"), back.join());
});

test("the last match decides it, and halves split the points", () => {
  clock = 0;
  const r = ids(run(round(1, "MWMWH-"))); // 2.5–2.5 with one match left of 6 (3 > half needs 3.5)
  assert.ok(r.includes("HL-028:Maroon"), r.join());
  assert.ok(!r.some((x) => x.startsWith("HL-027")), "nobody has more than half yet");
});

test("leading every match after 9; nothing without two teams' players or matches", () => {
  clock = 0;
  const r = ids(run(round(1, "----", { up9: [1, 2, 1, 3] })));
  assert.ok(r.includes("HL-030:Maroon"), r.join());
  assert.deepEqual(detectTeamMoments({ tripId: "t", teams, rounds: [], names }), []);
});

test("end to end with the built-in sheet: the first team lead becomes a real notification", async () => {
  const { runShadow } = await import("./shadow.ts");
  const { BUILT_IN_HIGHLIGHTS } = await import("../builtIn.ts");
  const { competitionProfile, setupFor } = await import("../engine/competition.ts");
  const { buildScoring } = await import("./scoringFixture.ts");
  clock = 0;
  const report = runShadow({
    detection: { tripId: "t", scoring: buildScoring([], {}), pars: null, course: null, team: { tripId: "t", teams, rounds: [round(1, "M---")], names } },
    config: BUILT_IN_HIGHLIGHTS!, configVersion: null, competition: competitionProfile(setupFor("match-only", true)),
    members: [...names].map(([id, name]) => ({ id, name })),
  });
  const delivered = report.rows.filter((r) => r.moment.ruleId === "HL-022" && r.outcome === "delivered");
  assert.ok(delivered.length > 0, JSON.stringify(report.rows.filter((r) => r.moment.ruleId === "HL-022").map((r) => r.reason)));
  const words = `${delivered[0].alert!.title} ${delivered[0].alert!.body}`;
  assert.match(words, /Maroon/);
  assert.doesNotMatch(words, /\{/);
});
