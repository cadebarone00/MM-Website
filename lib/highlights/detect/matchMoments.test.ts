import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMatchMoments, type MatchSetup } from "./matchMoments.ts";
import { buildScoring, type FixturePlayer } from "./scoringFixture.ts";

/** A singles match, Alex (side A) v Blake (side B), each attesting the other. `results`: per hole "a" | "b" | "h". */
const players: FixturePlayer[] = [{ id: "alex", name: "Alex", attester: "blake" }, { id: "blake", name: "Blake", attester: "alex" }];
const singles: MatchSetup[] = [{ index: 0, format: "singles", a: ["alex"], b: ["blake"] }];
function round(results: string, matches = singles) {
  const holes = [...results];
  const a = holes.map((r) => (r === "a" ? 3 : r === "b" ? 5 : 4));
  const b = holes.map((r) => (r === "b" ? 3 : r === "a" ? 5 : 4));
  const pad = (xs: number[]) => [...xs, ...Array(18 - xs.length).fill(null)];
  return detectMatchMoments({ tripId: "t", scoring: buildScoring(players, { alex: pad(a), blake: pad(b) }), matches });
}
const rules = (moments: ReturnType<typeof round>) => moments.map((m) => `${m.ruleId}@${m.hole}`);

test("3 holes in a row, then the match clinched 5&4 is a big win (HL-021 instead of HL-019)", () => {
  const moments = round("aaaaahhhhhhhhh");
  assert.ok(rules(moments).includes("HL-012@3"), rules(moments).join());
  const end = moments.find((m) => m.ruleId === "HL-021")!;
  assert.equal(end.values.Margin, "5&4");
  assert.equal(end.values["Player 1, Team A"], "Alex");
  assert.equal(end.values["Player 1, Team B"], "Blake");
  assert.ok(!moments.some((m) => m.ruleId === "HL-019"), "never both");
  assert.equal(end.format, "singles");
});

test("a 2&1 win is a plain clinch (HL-019) with the dormie on the way, and nothing after the match ends", () => {
  // Alex 2 up after 16 holes (dormie: 2 up, 2 left), halves 17 → wins 2&1.
  const moments = round("ahahhhhhhhhhhhhhh" + "h");
  const r = rules(moments);
  assert.ok(r.includes("HL-015@16"), r.join());
  assert.ok(r.includes("HL-019@17"), r.join());
  assert.equal(moments.find((m) => m.ruleId === "HL-019")!.values.Margin, "2&1");
  assert.ok(!r.some((x) => x.endsWith("@18")), "the match is over after 17");
});

test("won on the last hole, halved, and going to the last hole", () => {
  const won = rules(round("hhhhhhhhhhhhhhhhha"));
  assert.ok(won.includes("HL-016@17") && won.includes("HL-017@18"), won.join());
  const halved = rules(round("hhhhhhhhhhhhhhhhhh"));
  assert.ok(halved.includes("HL-018@18"), halved.join());
});

test("dormie going into 18 sends dormie, not also 'going to the last hole'", () => {
  const r = rules(round("ahhhhhhhhhhhhhhhh" + "b")); // 1 up after 17 = dormie with 1 left
  assert.ok(r.includes("HL-015@17"), r.join());
  assert.ok(!r.includes("HL-016@17"), r.join());
});

test("comeback from 3 down, then a lead change with the comeback side as Team A", () => {
  const moments = round("bbbaaaa");
  const back = moments.find((m) => m.ruleId === "HL-013")!;
  assert.equal(back.hole, 6);
  assert.equal(back.values["Player 1, Team A"], "Alex", "Team A = the side that came back");
  assert.equal(back.values.Count, "3");
  const flip = moments.find((m) => m.ruleId === "HL-014")!;
  assert.equal(flip.hole, 7);
  assert.equal(flip.values["Player 1, Team A"], "Alex");
  assert.ok(!moments.some((m) => m.ruleId === "HL-011"), "the comeback replaces 'back to all square'");
});

test("back to all square after 5+ holes not square (HL-011)", () => {
  const r = rules(round("ahhhhb")); // 1 up for 5 holes, then square
  assert.ok(r.includes("HL-011@6"), r.join());
  assert.ok(!rules(round("ahb")).includes("HL-011@3"), "too short");
});

test("fourball: best ball per side, partners named, unfinished holes stop the match", () => {
  const four: FixturePlayer[] = [
    { id: "a1", name: "Alex", attester: "b1" }, { id: "a2", name: "Sam", attester: "b2" },
    { id: "b1", name: "Blake", attester: "a1" }, { id: "b2", name: "Riley", attester: "a2" },
  ];
  const scores = { a1: [3, 3, 3, ...Array(15).fill(null)], a2: [6, 6, 6, ...Array(15).fill(null)], b1: [4, 4, 4, ...Array(15).fill(null)], b2: [5, 5, 5, ...Array(15).fill(null)] };
  const moments = detectMatchMoments({ tripId: "t", scoring: buildScoring(four, scores), matches: [{ index: 2, format: "fourball", a: ["a1", "a2"], b: ["b1", "b2"] }] });
  const run = moments.find((m) => m.ruleId === "HL-012")!;
  assert.equal(run.values["Player 2, Team A"], "Sam");
  assert.equal(run.values["Player 2, Team B"], "Riley");
  assert.deepEqual(run.sides, { a: 2, b: 2 });
  assert.equal(moments.length, 1);
});

test("keys are stable per match + rule + hole", () => {
  assert.deepEqual(round("aaa").map((m) => m.key), ["t:r1:HL-012:m0:3"].map((k) => k.replace("r1", buildScoring(players, {}).roundId)));
});

test("end to end with the built-in sheet: a singles run of 3 becomes a real notification in the sheet's words", async () => {
  const { runShadow } = await import("./shadow.ts");
  const { BUILT_IN_HIGHLIGHTS } = await import("../builtIn.ts");
  const { competitionProfile, setupFor } = await import("../engine/competition.ts");
  const pad = (xs: number[]) => [...xs, ...Array(18 - xs.length).fill(null)];
  const scoring = buildScoring(players, { alex: pad([3, 3, 3]), blake: pad([5, 5, 5]) });
  const report = runShadow({
    detection: { tripId: "t", scoring, pars: null, course: null, matches: singles },
    config: BUILT_IN_HIGHLIGHTS!, configVersion: null, competition: competitionProfile(setupFor("match-only", false)),
    members: [{ id: "alex", name: "Alex" }, { id: "blake", name: "Blake" }, { id: "cam", name: "Cam" }],
  });
  const delivered = report.rows.filter((r) => r.moment.ruleId === "HL-012" && r.outcome === "delivered");
  assert.ok(delivered.length > 0, JSON.stringify(report.rows.filter((r) => r.moment.ruleId === "HL-012").map((r) => r.reason)));
  const words = `${delivered[0].alert!.title} ${delivered[0].alert!.body}`;
  assert.match(words, /Alex/);
  assert.match(words, /Blake/);
  assert.doesNotMatch(words, /{/, "every blank filled in");
});
