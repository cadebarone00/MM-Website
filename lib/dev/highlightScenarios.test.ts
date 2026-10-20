import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importHighlightSheet } from "../highlights/importer.ts";
import { HAS_EMOJI } from "../highlights/validator.ts";
import { evaluateAlert } from "../highlights/engine/evaluate.ts";
import { competitionProfile, setupFor } from "../highlights/engine/competition.ts";
import { DEFAULT_PREFERENCES } from "../highlights/engine/preferences.ts";
import { validSheet } from "../highlights/sheetFixture.ts";
import { DEFAULT_HIGHLIGHT_SIM, SCENARIOS, SIM_MEMBERS, SNAPSHOT, parseHighlightSim, simulate, simulatedInbox, type HighlightSim } from "./highlightScenarios.ts";

// The simulator's scenarios, run through the real engine on the snapshot of the 2026-10-19 sheet export.
const sim = (changes: Partial<HighlightSim> = {}): HighlightSim => ({ ...DEFAULT_HIGHLIGHT_SIM, ...changes });
const rules = SNAPSHOT.config.rules;

test("the sheet snapshot: 53 golf + 22 travel rules, unique stable IDs, three wordings per trigger (V01–V03)", () => {
  assert.deepEqual([rules.filter((r) => r.id.startsWith("HL-")).length, rules.filter((r) => r.id.startsWith("TR-")).length], [53, 22]);
  const ids = rules.flatMap((r) => [r.id, ...r.conditionals.flatMap((c) => [c.id, ...c.variations.map((v) => v.id)])]);
  assert.equal(new Set(ids).size, ids.length, "every rule, trigger and wording ID is unique");
  for (const rule of rules) for (const c of rule.conditionals) {
    assert.ok(c.id.startsWith(`${rule.id}-C`), c.id);
    assert.deepEqual(c.variations.map((v) => v.id), [`${c.id}-V01`, `${c.id}-V02`, `${c.id}-V03`], c.id);
  }
  assert.deepEqual([SNAPSHOT.counts.rules, SNAPSHOT.counts.conditionals, SNAPSHOT.counts.variations], [75, 88, 264], "fourball C02 triggers added 2026-10-20");
  assert.deepEqual(SNAPSHOT.report, { errors: [], warnings: 0 }, "the sheet (2026-10-20 9:21 AM) validates cleanly");
  assert.ok(rules.every((r) => r.status === "Draft" && r.conditionals.every((c) => c.status === "Draft")), "everything is still Draft (no 'Needs copy')");
});

test("same-group (HL-049) and different-groups (HL-053) shared birdies are distinct rules with distinct wording and players", () => {
  const same = rules.find((r) => r.id === "HL-049")!, different = rules.find((r) => r.id === "HL-053")!;
  assert.match(same.name, /same group/);
  assert.match(different.name, /different groups/);
  const words = (r: typeof same) => r.conditionals[0].variations.map((v) => `${v.headline} ${v.body}`);
  assert.equal(words(same).filter((w) => words(different).includes(w)).length, 0);
  const group = (name: string) => SIM_MEMBERS.find((m) => m.name.startsWith(name))!.group;
  const named = (id: string) => simulate(sim({ scenario: id, variation: "V02" })).evaluation.alert!.body.match(/[A-Z][a-z]+(?=,| and| all| in| from)/g)!;
  assert.equal(new Set(named("hl049").map(group)).size, 1, "same group: everyone from one tee group");
  assert.ok(new Set(named("hl053").map(group)).size > 1, "different groups: from more than one tee group");
  assert.ok(simulate(sim({ scenario: "hl049", variation: "V01" })).evaluation.alert!.body.includes("in the same group"));
});

test("no rendered notification has an unfilled placeholder, and every displayed headline has an emoji", () => {
  let rendered = 0;
  for (const scenario of SCENARIOS) for (const variation of ["V01", "V02", "V03"] as const) for (const matchFormat of ["singles", "fourball"] as const) {
    const alert = simulate(sim({ scenario: scenario.id, variation, matchFormat, intensity: "all" })).evaluation.alert;
    if (!alert) continue;
    rendered++;
    assert.ok(!/[{}]/.test(alert.title + alert.body), `${alert.variationId}: ${alert.title} — ${alert.body}`);
    assert.ok(HAS_EMOJI.test(alert.title), `${alert.variationId} headline has no emoji: ${alert.title}`);
  }
  assert.ok(rendered > 150, `rendered ${rendered}`);
});

test("match sides: Team A is the side the moment is about; swapping sides swaps every slot; no golfer fills both sides", () => {
  const a = simulate(sim({ scenario: "hl019", matchFormat: "fourball", variation: "V01" })).event.values;
  assert.deepEqual([a["Player 1, Team A"], a["Player 2, Team A"], a["Player 1, Team B"], a["Player 2, Team B"], a["Team A"], a["Team B"]], ["Jake", "Pete", "Alex", "Luke", "Team Maroon", "Team White"]);
  const b = simulate(sim({ scenario: "hl019", matchFormat: "fourball", swapSides: true, variation: "V01" })).event.values;
  assert.deepEqual([b["Player 1, Team A"], b["Player 1, Team B"], b["Team A"]], ["Alex", "Jake", "Team White"]);
  const sideA = [a["Player 1, Team A"], a["Player 2, Team A"]], sideB = [a["Player 1, Team B"], a["Player 2, Team B"]];
  assert.equal(sideA.filter((name) => sideB.includes(name)).length, 0);
  assert.equal(simulate(sim({ scenario: "hl012", matchFormat: "fourball" })).evaluation.alert?.conditionalId, "HL-012-C02", "fourball picks the Team of 2 trigger");
  assert.equal(simulate(sim({ scenario: "hl012", matchFormat: "singles" })).evaluation.alert?.conditionalId, "HL-012-C03", "singles picks the Single trigger");
});

test("V1 / V2 / V3 / random preview different wordings for the same moment", () => {
  const titles = ["V01", "V02", "V03"].map((variation) => simulate(sim({ scenario: "hl001-3", variation: variation as "V01" })).evaluation.alert!.title);
  assert.equal(new Set(titles).size, 3);
  const random = new Set(Array.from({ length: 30 }, (_, seed) => simulate(sim({ scenario: "hl001-3", seed })).evaluation.alert!.variationId));
  assert.equal(random.size, 3);
});

test("competition-ineligible highlights are never created; noncompetitive trips get no match, team or leaderboard results", () => {
  const competitive = ["hl012", "hl013", "hl014", "hl019", "hl031", "hl033", "hl022", "hl040"];
  for (const id of competitive) {
    const result = simulate(sim({ scenario: id, tripType: "noncompetitive", teamCompetition: false, intensity: "all" }));
    assert.equal(result.evaluation.outcome, "not-created", id);
    assert.equal(result.evaluation.checks[0].status, "fail", id);
  }
  for (const id of ["hl001-3", "hl002", "hl004", "hl049", "hl053"]) assert.equal(simulate(sim({ scenario: id, tripType: "noncompetitive", teamCompetition: false })).evaluation.outcome, "delivered", id);
  assert.equal(simulate(sim({ scenario: "hl022", tripType: "match-only", teamCompetition: false })).evaluation.outcome, "not-created", "team lead needs a team competition");
  assert.equal(simulate(sim({ scenario: "hl031", tripType: "match-only" })).evaluation.outcome, "not-created", "no leaderboard in Match Only");
  assert.equal(simulate(sim({ scenario: "hl014", tripType: "individual-only", intensity: "all" })).evaluation.outcome, "not-created", "no matches in Individual Only");
});

test("golf intensity mutes golf highlights but never travel; category switches mute either", () => {
  assert.equal(simulate(sim({ scenario: "hl014", intensity: "balanced" })).evaluation.outcome, "muted", "Lead change is an All-level rule");
  assert.equal(simulate(sim({ scenario: "hl014", intensity: "all" })).evaluation.outcome, "delivered");
  assert.equal(simulate(sim({ scenario: "hl004", intensity: "big-plays" })).evaluation.outcome, "delivered", "a hole-in-one is a Big Play");
  for (const intensity of ["off", "big-plays"] as const) {
    for (const id of ["tr001", "tr006", "tr012", "tr020"]) assert.equal(simulate(sim({ scenario: id, intensity })).evaluation.outcome, "delivered", `${id} with golf ${intensity}`);
  }
  assert.equal(simulate(sim({ scenario: "tr006", categoriesOff: ["flights-transportation"] })).evaluation.outcome, "muted");
  assert.equal(simulate(sim({ scenario: "hl001-3", tripIntensity: "off" })).evaluation.outcome, "muted", "a per-trip override applies");
  const muted = simulate(sim({ scenario: "tr006", categoriesOff: ["flights-transportation"] })).evaluation;
  assert.ok(muted.alert, "muted alerts are still rendered for the trip's history");
});

test("audiences: travel alerts reach only the travelers / group concerned", () => {
  assert.equal(simulate(sim({ scenario: "tr008", recipient: "cade" })).evaluation.outcome, "not-created", "Cade isn't in the rental group");
  assert.equal(simulate(sim({ scenario: "tr008", recipient: "pete" })).evaluation.outcome, "delivered", "Pete drives the rental");
  assert.equal(simulate(sim({ scenario: "tr006", recipient: "cam" })).evaluation.outcome, "delivered", "the carpool driver gets it");
  assert.equal(simulate(sim({ scenario: "tr012", recipient: "jake" })).evaluation.outcome, "not-created", "tee group 1 only");
  assert.deepEqual(simulate(sim({ scenario: "tr012" })).audienceNames, ["Cade Barone", "Cam Latto", "Collin Ross", "Mike Chen"]);
});

test("unconfirmed live facts are refused; scheduled reminders have trip-time send times", () => {
  assert.equal(simulate(sim({ scenario: "tr004-unconfirmed" })).evaluation.outcome, "not-created");
  assert.equal(simulate(sim({ scenario: "tr004" })).evaluation.outcome, "delivered");
  assert.equal(simulate(sim({ scenario: "tr012" })).sendAt, "2026-10-16T20:10:00.000Z", "60 min before a 2:10 PM PDT tee time");
  assert.match(simulate(sim({ scenario: "tr012" })).trigger, /60m before → sends Fri, Oct 16, 1:10 PM PDT/);
  assert.equal(simulate(sim({ scenario: "tr003" })).sendAt, null, "edits send when they happen");
});

test("Draft copy only appears with the Draft preview switch; production (Approved) path renders without it", () => {
  assert.equal(simulate(sim({ previewDrafts: false })).evaluation.outcome, "not-created", "the sheet is all Draft today");
  assert.equal(simulate(sim()).evaluation.alert?.draft, true);
  const approved = importHighlightSheet(validSheet()).config; // HL-001 is Approved in this fixture
  const result = evaluateAlert({ tripId: "t", ruleId: "HL-001", tier: 3, values: { Player: "Jake", Count: 3 }, key: "k" }, {
    config: approved, configVersion: 7, competition: competitionProfile(setupFor("noncompetitive", false)),
    audience: { members: ["me"] }, recipientId: "me", preferences: DEFAULT_PREFERENCES, random: () => 0,
  });
  assert.equal(result.outcome, "delivered");
  assert.deepEqual([result.alert?.draft, result.alert?.configVersion, result.alert?.variationId, result.alert?.title], [false, 7, "HL-001-C01-V01", "Jake's heating up! 🔥"]);
});

test("the inbox lists only delivered alerts for the viewer; scheduled / withdrawn ones aren't in it", () => {
  const now = new Date("2026-10-16T21:41:00.000Z");
  const inbox = simulatedInbox(sim(), now);
  assert.ok(inbox.length > 10);
  assert.equal(inbox[0].id.startsWith("hl001-3:"), true);
  assert.equal(inbox[0].read, false);
  assert.ok(inbox.every((note) => note.groupName === "Desert Classic" && note.link.startsWith("/golf-trips/")));
  assert.ok(!inbox.some((note) => note.id.startsWith("tr008")), "not Cade's rental");
  for (const delivery of ["scheduled", "withdrawn"] as const) assert.ok(!simulatedInbox(sim({ delivery }), now).some((n) => n.id.startsWith("hl001-3:")), delivery);
});

test("simulator state from the panel is validated strictly", () => {
  assert.deepEqual(parseHighlightSim(DEFAULT_HIGHLIGHT_SIM), DEFAULT_HIGHLIGHT_SIM);
  for (const bad of [null, {}, { ...DEFAULT_HIGHLIGHT_SIM, scenario: "nope" }, { ...DEFAULT_HIGHLIGHT_SIM, hole: 19 }, { ...DEFAULT_HIGHLIGHT_SIM, recipient: "hacker" },
    { ...DEFAULT_HIGHLIGHT_SIM, categoriesOff: ["everything"] }, { ...DEFAULT_HIGHLIGHT_SIM, intensity: "loud" }]) assert.equal(parseHighlightSim(bad), null, JSON.stringify(bad));
});

test("nothing here can send: no network calls, and no push / database modules are imported", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error("no network in the simulator"); }) as typeof fetch;
  try { simulatedInbox(sim(), new Date()); for (const s of SCENARIOS) simulate(sim({ scenario: s.id })); }
  finally { globalThis.fetch = original; }
  assert.equal(calls, 0);
  const sources = ["lib/dev/highlightScenarios.ts", ...["audience", "competition", "delivery", "destinations", "evaluate", "preferences", "selection", "values"].map((f) => `lib/highlights/engine/${f}.ts`)];
  for (const file of sources) assert.ok(!/webPushTransport|tripPush|supabase|fetch\(|sendWebPush/.test(readFileSync(file, "utf8")), file);
});

test("corrected rules: HL-022 one message per quip, HL-023 typo gone, HL-004 / HL-049 / HL-053 use {Hole}, HL-010 fills {Score}", () => {
  const copy = (id: string) => rules.find((r) => r.id === id)!.conditionals.flatMap((c) => c.variations.map((v) => `${v.headline} ${v.body}`));
  assert.ok(copy("HL-022").every((t) => !t.includes(" / ") && t.includes("{Team}")));
  assert.ok(copy("HL-023").every((t) => !/win4/.test(t)));
  assert.ok(copy("HL-004").every((t) => t.includes("{Hole}") && !/12/.test(t)));
  for (const id of ["HL-049", "HL-053"]) assert.ok(copy(id).every((t) => /hole {Hole}|on {Hole}/.test(t)), id);
  const evaluation = evaluateAlert({ tripId: "t", ruleId: "HL-010", values: { Player: "Cam", Score: "double bogey" }, key: "k" }, {
    config: SNAPSHOT.config, configVersion: null, competition: competitionProfile(setupFor("noncompetitive", false)), audience: { members: ["me"] },
    recipientId: "me", preferences: DEFAULT_PREFERENCES, previewDrafts: true, forcedVariation: "HL-010-C01-V01",
  });
  assert.equal(evaluation.alert?.body, "Cam gets one back after his double bogey");
});

test("singles vs fourball: the format picks the trigger — singles keeps C01 (no partners), fourball C02 names all four", () => {
  for (const id of ["hl013", "hl014", "hl017", "hl019"]) {
    assert.ok(SCENARIOS.some((s) => s.id === id), id);
    for (const variation of ["V01", "V02", "V03"] as const) {
      const singles = simulate(sim({ scenario: id, matchFormat: "singles", intensity: "all", variation }));
      assert.equal(singles.evaluation.alert?.conditionalId.slice(-3), "C01", `${id} singles`);
      assert.ok(!/Pete|Luke/.test(singles.evaluation.alert!.body), `${id} singles names no partner: ${singles.evaluation.alert!.body}`);
      const fourball = simulate(sim({ scenario: id, matchFormat: "fourball", intensity: "all", variation }));
      assert.equal(fourball.evaluation.alert?.conditionalId.slice(-3), "C02", `${id} fourball`);
      for (const name of ["Jake", "Pete", "Alex", "Luke"]) assert.ok(fourball.evaluation.alert!.body.includes(name), `${id} ${variation} fourball names ${name}: ${fourball.evaluation.alert!.body}`);
    }
  }
  // The pairs rule still guards: forcing a singles wording onto a fourball event is refused, with the reason.
  const forced = evaluateAlert({ tripId: "t", ruleId: "HL-013", conditionalId: "HL-013-C01", values: simulate(sim({ scenario: "hl013", matchFormat: "fourball" })).event.values, sides: { a: 2, b: 2 }, key: "k" }, {
    config: SNAPSHOT.config, configVersion: null, competition: competitionProfile(setupFor("match-only", true)), audience: { members: ["me"] }, recipientId: "me", preferences: DEFAULT_PREFERENCES, previewDrafts: true,
  });
  assert.equal(forced.outcome, "not-created");
  assert.match(forced.checks.find((c) => c.id === "placeholders")!.detail, /names 1 of the 2 golfers on Team A/);
  const pairs = simulate(sim({ scenario: "hl012", matchFormat: "fourball" }));
  assert.equal(pairs.evaluation.outcome, "delivered", "HL-012 has a Team of 2 trigger that names both partners");
  assert.ok(/Jake/.test(pairs.evaluation.alert!.body + pairs.evaluation.alert!.title) && /Pete/.test(pairs.evaluation.alert!.body + pairs.evaluation.alert!.title), pairs.evaluation.alert!.body);
  assert.ok(/Alex/.test(pairs.evaluation.alert!.body) && /Luke/.test(pairs.evaluation.alert!.body), "both opponents too");
});
