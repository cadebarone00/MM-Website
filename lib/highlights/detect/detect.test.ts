import { test } from "node:test";
import assert from "node:assert/strict";
import snapshot from "../../dev/highlightsSnapshot.json";
import { competitionProfile, setupFor } from "../engine/competition.ts";
import { DEFAULT_PREFERENCES } from "../engine/preferences.ts";
import type { HighlightConfig } from "../types.ts";
import { detectRoundMoments, attestedScores, playingOrder } from "./scoreMoments.ts";
import { parsForDetection } from "./roundPars.ts";
import { compareWithMomentum, runShadow, type ShadowInput } from "./shadow.ts";
import { buildScoring, card, PARS_72, type FixtureOptions } from "./scoringFixture.ts";

// H5B: the HL-001…HL-004 detectors and the shadow runner, on repeatable scoring fixtures.
const PLAYERS = [
  { id: "jake", name: "Jake", attester: "pete" }, { id: "pete", name: "Pete", attester: "jake" },
  { id: "cade", name: "Cade", attester: "cam" }, { id: "cam", name: "Cam", attester: "cade" },
];
const detect = (scores: Record<string, (number | null)[]>, options: FixtureOptions = {}, pars: number[] | null = PARS_72) =>
  detectRoundMoments({ tripId: "trip", scoring: buildScoring(PLAYERS, scores, options), pars, course: "PGA West Stadium" });
const summary = (moments: ReturnType<typeof detect>["moments"]) => moments.map((m) => `${m.ruleId}${m.tier ? `×${m.tier}` : ""}@${m.profileId}:${m.hole}`);
const birdieRun = { jake: card(PARS_72, { 3: -1, 4: -1, 5: -1, 6: -1, 7: -1 }) };

test("HL-001: a birdie streak fires at 3, 4 and 5 in a row, each with its count and the hole that made it", () => {
  const { moments, notes } = detect(birdieRun);
  assert.deepEqual(notes, []);
  assert.deepEqual(summary(moments), ["HL-001×3@jake:5", "HL-001×4@jake:6", "HL-001×5@jake:7"]);
  assert.deepEqual(moments[0].values, { Player: "Jake", Round: "2", Course: "PGA West Stadium", Hole: "5", Count: "3" });
  assert.equal(moments[2].key, "trip:round-2:HL-001:jake:7:5");
});

test("HL-002 / 003 / 004: eagle (2 under), albatross (3 under), hole-in-one — one moment per hole, an ace is never also an eagle", () => {
  const { moments } = detect({ cade: card(PARS_72, { 5: -2, 9: -3, 3: "ace" }), cam: card(PARS_72, { 1: "ace" }) });
  assert.deepEqual(summary(moments).sort(), ["HL-002@cade:5", "HL-003@cade:9", "HL-004@cade:3", "HL-004@cam:1"]);
  assert.ok(!summary(moments).includes("HL-002@cade:3"), "an ace on a par 3 is not also an eagle");
  assert.ok(!summary(moments).includes("HL-003@cam:1"), "an ace on a par 4 is not also an albatross");
});

test("negative: pars, bogeys, a single eagle among birdies, gaps, disagreements and missing attesters don't fire", () => {
  assert.deepEqual(detect({ jake: card(PARS_72, {}), pete: card(PARS_72, { 2: 1, 3: 2, 8: 3 }) }).moments, [], "pars and bogeys");
  // Holes 9–13 are par 5, 4, 4, 3, 4: birdie, birdie, EAGLE (2 on a par 4), birdie, birdie.
  assert.deepEqual(detect({ jake: card(PARS_72, { 9: -1, 10: -1, 11: -2, 12: -1, 13: -1 }) }).moments.map((m) => m.ruleId), ["HL-002"], "an eagle breaks the streak (2 + 2, no 3)");
  assert.deepEqual(detect({ jake: card(PARS_72, { 3: -1, 4: -1, 6: -1, 7: -1 }) }).moments, [], "a par on 5 breaks it");
  assert.deepEqual(detect(birdieRun, { unattested: { jake: [5] } }).moments, [], "hole 5 not attested yet → 2 + 2");
  assert.deepEqual(detect(birdieRun, { disagree: { jake: { 5: 6 } } }).moments, [], "attester disagrees on 5 → 2 + 2, no streak");
  assert.deepEqual(summary(detect(birdieRun, { disagree: { jake: { 4: 5 } } }).moments), ["HL-001×3@jake:7"], "a disagreement on 4 still leaves 5-6-7");
  const solo = detectRoundMoments({ tripId: "t", scoring: buildScoring([{ id: "x", name: "X", attester: null }], { x: card(PARS_72, { 3: "ace" }) }), pars: PARS_72, course: null });
  assert.deepEqual(solo.moments, [], "no attester = nothing confirmed");
  assert.deepEqual(summary(detect({ jake: card(PARS_72, { 1: -1, 2: -1, 3: -1, 4: -1, 5: -1, 6: -1, 7: -1, 8: -1, 9: -1, 10: -1, 11: -1, 12: -1 }) }).moments).at(-1), "HL-001×10@jake:10", "tiers stop at 10");
});

test("incomplete rounds and missing pars: what's confirmed so far counts; without pars only aces are possible", () => {
  assert.deepEqual(summary(detect({ jake: card(PARS_72, { 3: -1, 4: -1, 5: -1, 6: -1 }, 5) }).moments), ["HL-001×3@jake:5"], "mid-round: through 5");
  const noPars = detect({ jake: card(PARS_72, { 3: -1, 4: -1, 5: -1 }), cam: card(PARS_72, { 7: "ace" }) }, {}, null);
  assert.deepEqual(summary(noPars.moments), ["HL-004@cam:7"]);
  assert.match(noPars.notes[0], /only hole-in-ones/);
  assert.equal(detect(birdieRun, {}, PARS_72.slice(0, 17)).notes.length, 1, "17 pars isn't a valid layout");
});

test("entry order, replays and re-syncs never change what's detected", () => {
  // Moments are listed by when they happened (entry order changes that), so compare WHAT was found, and the keys.
  const found = (options: FixtureOptions) => detect(birdieRun, options).moments.map((m) => m.key).sort();
  const forward = found({});
  assert.deepEqual(found({ order: "reverse" }), forward);
  assert.deepEqual(found({ order: [7, 3, 5, 18, 4, 6, 1, 2, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] }), forward);
  const replayed = detect(birdieRun, { replay: true });
  assert.deepEqual(replayed.moments.map((m) => m.key).sort(), forward, "a replayed card (higher versions, same strokes) adds nothing");
  assert.deepEqual(new Set(replayed.moments.map((m) => m.key)).size, replayed.moments.length);
});

test("corrections: a newer version wins, so a corrected hole changes the moments", () => {
  assert.deepEqual(summary(detect(birdieRun, { corrections: { jake: { 7: 3 } } }).moments), ["HL-001×3@jake:5", "HL-001×4@jake:6"], "hole 7 corrected to par");
  assert.deepEqual(summary(detect({ jake: card(PARS_72, { 3: -1, 4: -1 }) }, { corrections: { jake: { 5: 4 } } }).moments), ["HL-001×3@jake:5"], "a correction can also create one");
  const scores = attestedScores(buildScoring(PLAYERS, birdieRun, { corrections: { jake: { 7: 3 } } })).get("jake")!;
  assert.deepEqual(scores[6]?.strokes, 3);
});

// --- Shadow runs through the engine (real sheet snapshot; everything is still Draft, so previews use Draft copy) ---
const config = snapshot.config as unknown as HighlightConfig;
const MEMBERS = PLAYERS.map((p) => ({ id: p.id, name: p.name }));
const shadow = (scores: Record<string, (number | null)[]>, extra: Partial<ShadowInput> = {}, options: FixtureOptions = {}) => runShadow({
  detection: { tripId: "trip", scoring: buildScoring(PLAYERS, scores, options), pars: PARS_72, course: "PGA West Stadium" },
  config, configVersion: null, competition: competitionProfile(setupFor("match+individual", true)), members: MEMBERS, previewDrafts: true, ...extra,
});
const outcomes = (report: ReturnType<typeof shadow>, recipient = "cade") => report.rows.filter((r) => r.recipient === recipient).map((r) => `${r.moment.ruleId}${r.moment.tier ? `×${r.moment.tier}` : ""}:${r.outcome}`);

test("shadow: detected moments go through the engine for every member; one wording per moment, same for everyone", () => {
  const report = shadow(birdieRun);
  assert.deepEqual(outcomes(report), ["HL-001×3:delivered", "HL-001×4:delivered", "HL-001×5:delivered"]);
  for (const moment of report.moments) {
    const texts = new Set(report.rows.filter((r) => r.moment.key === moment.key).map((r) => r.alert?.title));
    assert.equal(texts.size, 1, "every member sees the same words");
  }
  const tier3 = report.rows.find((r) => r.moment.tier === 3)!.alert!;
  assert.match(`${tier3.title} ${tier3.body}`, /Jake/);
  assert.ok(!/[{}]/.test(tier3.title + tier3.body));
  assert.equal(tier3.draft, true, "Draft copy is labeled in previews");
});

test("shadow: running again is idempotent — nothing is delivered twice and wordings never change", () => {
  const first = shadow(birdieRun);
  const second = shadow(birdieRun, { previous: first.state });
  assert.ok(second.rows.every((r) => r.outcome === "duplicate"));
  assert.deepEqual(second.state.picks, first.state.picks);
  assert.deepEqual([second.added, second.withdrawn], [[], []]);
});

test("shadow: a correction withdraws the moment; restoring the score brings back the same wording without re-sending", () => {
  const first = shadow(birdieRun);
  const corrected = shadow(birdieRun, { previous: first.state }, { corrections: { jake: { 7: 3 } } });
  assert.deepEqual(corrected.withdrawn, ["trip:round-2:HL-001:jake:7:5"]);
  assert.equal(corrected.rows.some((r) => r.moment.tier === 5), false);
  const restored = shadow(birdieRun, { previous: corrected.state });
  assert.deepEqual(restored.added, ["trip:round-2:HL-001:jake:7:5"]);
  assert.equal(restored.state.picks["trip:round-2:HL-001:jake:7:5"], first.state.picks["trip:round-2:HL-001:jake:7:5"]);
  assert.equal(restored.rows.find((r) => r.moment.tier === 5 && r.recipient === "cade")!.outcome, "duplicate", "already delivered before the correction");
});

test("shadow: preferences, intensity and the volume limit — exceptional moments first", () => {
  const prefs = (golf: "big-plays" | "balanced" | "all", off: string[] = []) => ({ golf, categories: { ...DEFAULT_PREFERENCES.categories, ...Object.fromEntries(off.map((c) => [c, false])) } });
  const mixed = { jake: card(PARS_72, { 3: -1, 4: -1, 5: -1, 6: -1, 7: -1 }), cam: card(PARS_72, { 8: "ace" }) };
  assert.deepEqual(outcomes(shadow(mixed, { preferences: { cade: prefs("big-plays") } })), ["HL-001×3:muted", "HL-001×4:muted", "HL-001×5:muted", "HL-004:delivered"], "Big Plays: only the ace");
  assert.deepEqual(outcomes(shadow(mixed, { preferences: { cade: prefs("all", ["golf-performance"]) } })).every((o) => o.endsWith(":muted")), true, "category off");
  const limited = outcomes(shadow(mixed, { volume: { maxPerWindow: 2, windowMinutes: 60, exceptional: "always-send" } }));
  assert.deepEqual(limited, ["HL-001×3:delivered", "HL-001×4:delivered", "HL-001×5:volume-limited", "HL-004:delivered"], "the ace always goes; streak capped at 2");
  const prioritized = outcomes(shadow(mixed, { volume: { maxPerWindow: 2, windowMinutes: 60, exceptional: "prioritize" } }));
  assert.deepEqual(prioritized, ["HL-001×3:delivered", "HL-001×4:volume-limited", "HL-001×5:volume-limited", "HL-004:delivered"], "the ace takes one of the 2 slots first");
});

test("shadow: production path — Draft copy isn't sendable; Approved copy is; competition eligibility still applies", () => {
  assert.ok(shadow(birdieRun, { previewDrafts: false }).rows.every((r) => r.outcome === "not-created"), "the sheet is all Draft today");
  const approved = structuredClone(config);
  for (const rule of approved.rules.filter((r) => ["HL-001", "HL-004"].includes(r.id))) {
    rule.status = "Approved";
    for (const c of rule.conditionals) { c.status = "Approved"; for (const v of c.variations) v.status = "Approved"; }
  }
  const report = shadow({ ...birdieRun, cam: card(PARS_72, { 8: "ace" }) }, { config: approved, configVersion: 12, previewDrafts: false, competition: competitionProfile(setupFor("noncompetitive", false)) });
  assert.deepEqual(outcomes(report), ["HL-001×3:delivered", "HL-001×4:delivered", "HL-001×5:delivered", "HL-004:delivered"], "big plays are for every trip type");
  assert.ok(report.rows.every((r) => r.alert?.draft === false && r.alert.configVersion === 12));
});

test("shadow comparison with the SQL momentum alerts: matches, expected differences and new moments are all listed", () => {
  const { moments } = detect({ jake: card(PARS_72, { 3: -1, 4: -1, 5: -1, 6: -1 }), cam: card(PARS_72, { 8: "ace", 14: -2 }) });
  const sql = [{ cause: "birdie_2", profileId: "jake", hole: 4 }, { cause: "birdie_3", profileId: "jake", hole: 5 }, { cause: "birdie_4", profileId: "jake", hole: 6 }, { cause: "hole_in_one", profileId: "cam", hole: 8 }];
  const result = compareWithMomentum(moments, sql);
  assert.deepEqual(result.matched.sort(), ["birdie_3|jake|5", "birdie_4|jake|6", "hole_in_one|cam|8"]);
  assert.deepEqual([result.onlyTypeScript, result.onlySql, result.expectedOnlySql], [[], ["birdie_2|jake|4"], ["birdie_2|jake|4"]]);
  assert.deepEqual(result.newInTypeScript, ["HL-002|cam|14"]);
});

test("shadow mode can't send: no network, no push, no database modules", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error("no network"); }) as typeof fetch;
  try { shadow(birdieRun); } finally { globalThis.fetch = original; }
  assert.equal(calls, 0);
  const { readFileSync } = await import("node:fs");
  for (const file of ["scoreMoments.ts", "shadow.ts", "scoringFixture.ts", "roundPars.ts"]) {
    assert.ok(!/webPushTransport|tripPush|supabase|fetch\(|sendWebPush|insert into/i.test(readFileSync(`lib/highlights/detect/${file}`, "utf8")), file);
  }
});

test("shotgun: streaks follow each group's playing order, carrying 18 → 1 but never linking the last hole back to the first", () => {
  assert.deepEqual(playingOrder(16).slice(0, 5), [16, 17, 18, 1, 2]);
  assert.deepEqual(playingOrder(1), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.equal(playingOrder(0)[0], 1, "an invalid start falls back to hole 1");
  const wrap = { jake: card(PARS_72, { 17: -1, 18: -1, 1: -1 }) };
  const shotgun = detectRoundMoments({ tripId: "trip", scoring: buildScoring(PLAYERS, wrap), pars: PARS_72, course: null, startHoles: { "group-1": 16 } });
  assert.deepEqual(summary(shotgun.moments), ["HL-001×3@jake:1"], "17-18-1 in a row from a 16th-hole start");
  assert.deepEqual(detect(wrap).moments, [], "from the 1st tee, hole 1 is played first and 17-18 last");
  const lastToFirst = detectRoundMoments({ tripId: "trip", scoring: buildScoring(PLAYERS, { jake: card(PARS_72, { 15: -1, 16: -1, 14: -1 }) }), pars: PARS_72, course: null, startHoles: { "group-1": 15 } });
  assert.deepEqual(lastToFirst.moments, [], "from a 15th start, 14 is played last, so it doesn't continue 15-16");
});

test("pars: detection only uses a confirmed 18-hole snapshot; anything else means aces only, with the reason", () => {
  const snapshot = { pars: PARS_72, source: "course-library" as const, sourceRef: "golf_courses:pga-west-stadium:blue", confirmedBy: "organizer", confirmedAt: "2026-10-16T19:00:00Z", lockedAt: null };
  assert.deepEqual(parsForDetection(snapshot), { pars: PARS_72, reason: null });
  assert.match(parsForDetection(null).reason!, /no par snapshot/);
  assert.match(parsForDetection({ ...snapshot, confirmedAt: null }).reason!, /not confirmed by the organizer|aren't confirmed by the organizer/);
  assert.match(parsForDetection({ ...snapshot, pars: PARS_72.slice(0, 17) }).reason!, /18 valid pars/);
  assert.equal(parsForDetection({ ...snapshot, pars: [...PARS_72.slice(0, 17), 7] }).pars, null, "par 7 isn't a hole");
});

test("correct → withdraw → restore: the second birdie corrected to par withdraws the 3-streak; restoring it re-detects it with the same quip and doesn't re-send", () => {
  const three = { jake: card(PARS_72, { 3: -1, 4: -1, 5: -1 }) };
  const key = "trip:round-2:HL-001:jake:5:3";
  const first = shadow(three);
  assert.deepEqual(first.moments.map((m) => m.key), [key]);
  assert.ok(first.rows.every((r) => r.outcome === "delivered"));
  const corrected = shadow(three, { previous: first.state }, { corrections: { jake: { 4: 4 } } });
  assert.deepEqual([corrected.moments, corrected.withdrawn], [[], [key]]);
  const restored = shadow(three, { previous: corrected.state }, { corrections: { jake: { 4: 4 } }, laterCorrections: { jake: { 4: 3 } } });
  assert.deepEqual([restored.moments.map((m) => m.key), restored.added, restored.withdrawn], [[key], [key], []]);
  assert.equal(restored.state.picks[key], first.state.picks[key], "same quip");
  assert.ok(restored.rows.every((r) => r.outcome === "duplicate"), "nobody is notified twice");
});
