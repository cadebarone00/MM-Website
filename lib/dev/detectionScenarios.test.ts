import { test } from "node:test";
import assert from "node:assert/strict";
import { DETECTION_FIXTURES, detectionPreviewNotes, simulateDetection } from "./detectionScenarios.ts";
import { DEFAULT_HIGHLIGHT_SIM, DETECTION_FIXTURE_IDS, parseHighlightSim, type HighlightSim } from "./highlightScenarios.ts";

// H5B in the simulator: every scoring fixture through the real detectors + shadow runner, as the screens show it.
const sim = (changes: Partial<HighlightSim> = {}): HighlightSim => ({ ...DEFAULT_HIGHLIGHT_SIM, source: "detection", recipient: "cade", ...changes });
// Sorted: rows are listed by when each moment happened, which depends on entry order — compare what, not when.
const rows = (changes: Partial<HighlightSim> = {}) => simulateDetection(sim(changes)).rows.map((r) => `${r.moment.ruleId}${r.moment.tier ? `×${r.moment.tier}` : ""}@${r.moment.playerName}:${r.outcome}`).sort();

test("every fixture runs and the panel state validates", () => {
  for (const id of DETECTION_FIXTURE_IDS) {
    assert.ok(DETECTION_FIXTURES[id].label);
    assert.deepEqual(parseHighlightSim(sim({ detectionFixture: id })), sim({ detectionFixture: id }));
    simulateDetection(sim({ detectionFixture: id, correction: true }));
    simulateDetection(sim({ detectionFixture: id, correction: true, restore: true }));
    simulateDetection(sim({ detectionFixture: id, rerun: true }));
  }
  assert.equal(parseHighlightSim({ ...sim(), detectionFixture: "nope" }), null);
  assert.equal(parseHighlightSim({ ...sim(), volumeMax: 4 }), null);
});

test("positive: birdie streaks and the big plays are detected and reach the viewer", () => {
  assert.deepEqual(rows({ detectionFixture: "birdies" }), ["HL-001×3@Jake:delivered", "HL-001×4@Jake:delivered", "HL-001×5@Jake:delivered"]);
  assert.deepEqual(rows({ detectionFixture: "big-plays" }), ["HL-002@Cade:delivered", "HL-003@Alex:delivered", "HL-004@Cam:delivered"]);
  const { current, inbox } = detectionPreviewNotes(sim({ detectionFixture: "birdies" }));
  assert.match(`${current?.title} ${current?.body}`, /Jake/);
  assert.equal(inbox.length, 3);
});

test("negative: unconfirmed scores don't fire until the attester confirms them; without pars only the ace", () => {
  assert.deepEqual(rows({ detectionFixture: "unconfirmed" }), []);
  assert.deepEqual(rows({ detectionFixture: "unconfirmed", correction: true }), ["HL-001×3@Jake:delivered", "HL-001×4@Jake:delivered", "HL-001×5@Jake:delivered"]);
  const noPars = simulateDetection(sim({ detectionFixture: "no-pars" }));
  assert.deepEqual(noPars.rows.map((r) => r.moment.ruleId), ["HL-004"]);
  assert.match(noPars.report.notes[0], /only hole-in-ones/);
});

test("corrections withdraw; a second run sends nothing new; out-of-order syncing finds the same moments", () => {
  const corrected = simulateDetection(sim({ detectionFixture: "birdies", correction: true }));
  assert.deepEqual(corrected.report.withdrawn.map((k) => k.split(":").slice(2).join(":")), ["HL-001:jake:7:5"]);
  assert.ok(!detectionPreviewNotes(sim({ detectionFixture: "birdies", correction: true })).inbox.some((n) => n.id.includes("HL-001:jake:7:5")), "withdrawn leaves the inbox");
  assert.deepEqual(rows({ detectionFixture: "birdies", rerun: true }), ["HL-001×3@Jake:duplicate", "HL-001×4@Jake:duplicate", "HL-001×5@Jake:duplicate"]);
  assert.equal(detectionPreviewNotes(sim({ detectionFixture: "birdies", rerun: true })).current, null, "nothing new on the phone");
  assert.deepEqual(rows({ detectionFixture: "out-of-order" }), rows({ detectionFixture: "birdies" }));
  assert.deepEqual(rows({ detectionFixture: "out-of-order", correction: true }).map((r) => r.replace(":delivered", ":duplicate")), rows({ detectionFixture: "out-of-order", rerun: true }));
});

test("preferences, competition and the volume limit apply to detected moments", () => {
  assert.ok(rows({ detectionFixture: "birdies", intensity: "big-plays" }).every((r) => r.endsWith(":muted")), "streaks are Balanced");
  assert.deepEqual(rows({ detectionFixture: "big-plays", intensity: "big-plays" }).every((r) => r.endsWith(":delivered")), true);
  assert.ok(rows({ detectionFixture: "birdies", categoriesOff: ["golf-performance"] }).every((r) => r.endsWith(":muted")));
  assert.deepEqual(rows({ detectionFixture: "birdies", tripType: "noncompetitive", teamCompetition: false }), rows({ detectionFixture: "birdies" }), "big plays and streaks are for every trip type");
  assert.deepEqual(rows({ detectionFixture: "burst", volumeMax: 2 }), ["HL-001×3@Jake:delivered", "HL-001×4@Jake:delivered", "HL-001×5@Jake:volume-limited", "HL-004@Cam:delivered"], "the ace always goes");
  assert.deepEqual(rows({ detectionFixture: "burst", volumeMax: 2, exceptional: "prioritize" }), ["HL-001×3@Jake:delivered", "HL-001×4@Jake:volume-limited", "HL-001×5@Jake:volume-limited", "HL-004@Cam:delivered"]);
  assert.ok(rows({ detectionFixture: "birdies", previewDrafts: false }).every((r) => r.endsWith(":not-created")), "Draft copy isn't sendable");
});

test("/dev: attested 3-streak → second birdie corrected to par (withdrawn) → restored (re-detected, same quip, no duplicate)", () => {
  const step = (changes: Partial<HighlightSim>) => simulateDetection(sim({ detectionFixture: "correct-restore", ...changes }));
  const first = step({});
  assert.deepEqual(first.rows.map((r) => `${r.moment.ruleId}×${r.moment.tier}:${r.outcome}`), ["HL-001×3:delivered"]);
  const quip = first.rows[0].alert!.variationId;
  const corrected = step({ correction: true });
  assert.deepEqual([corrected.rows.length, corrected.report.withdrawn.length], [0, 1]);
  assert.equal(detectionPreviewNotes(sim({ detectionFixture: "correct-restore", correction: true })).inbox.length, 0, "withdrawn: gone from the inbox");
  const restored = step({ correction: true, restore: true });
  assert.deepEqual(restored.rows.map((r) => `${r.moment.ruleId}×${r.moment.tier}:${r.outcome}`), ["HL-001×3:duplicate"], "re-detected, not re-sent");
  assert.equal(restored.rows[0].alert!.variationId, quip, "same quip");
  assert.equal(restored.report.added.length, 1);
  const notes = detectionPreviewNotes(sim({ detectionFixture: "correct-restore", correction: true, restore: true }));
  assert.equal(notes.current, null, "no new push on the phone");
  assert.equal(notes.inbox.length, 1, "back in the inbox");
});

test("/dev: shotgun fixture — the streak carries 18 → 1 from a 16th-hole start, and not from the 1st tee", () => {
  assert.deepEqual(rows({ detectionFixture: "shotgun" }), ["HL-001×3@Jake:delivered"]);
  assert.equal(simulateDetection(sim({ detectionFixture: "shotgun" })).rows[0].moment.hole, 1);
  assert.deepEqual(simulateDetection(sim({ detectionFixture: "shotgun", correction: true })).rows, []);
});
