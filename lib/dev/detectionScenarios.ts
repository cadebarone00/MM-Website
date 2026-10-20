/**
 * DEV ONLY — H5B shadow run in the simulator's Notifications group. Scoring fixtures (the people of the sample trip,
 * attesting each other in pairs) go through the real TypeScript detectors and the shadow runner
 * (lib/highlights/detect) with the sheet snapshot. Nothing is sent, scheduled or stored; the current momentum alerts
 * are untouched. Each fixture can be followed by a score correction or a second run (replayed cards) to show
 * withdrawals and duplicate suppression.
 */
import { competitionProfile, setupFor } from "@/lib/highlights/engine/competition";
import { DEFAULT_PREFERENCES } from "@/lib/highlights/engine/preferences";
import { runShadow, type ShadowReport, type ShadowRow } from "@/lib/highlights/detect/shadow";
import { buildScoring, card, PARS_72, type FixtureOptions } from "@/lib/highlights/detect/scoringFixture";
import type { AppNotification } from "@/lib/notifications/types";
import { SIM_MEMBERS, SIM_ROUNDS, SIM_TRIP, SNAPSHOT, type DETECTION_FIXTURE_IDS, type HighlightSim } from "./highlightScenarios";

type FixtureId = (typeof DETECTION_FIXTURE_IDS)[number];
const ATTESTER: Record<string, string> = { cade: "cam", cam: "cade", collin: "mike", mike: "collin", jake: "pete", pete: "jake", alex: "luke", luke: "alex" };
const PLAYERS = SIM_MEMBERS.map((m) => ({ id: m.id, name: m.name.split(" ")[0], attester: ATTESTER[m.id] }));
const run = { 3: -1, 4: -1, 5: -1, 6: -1, 7: -1 } as const;

export const DETECTION_FIXTURES: Record<FixtureId, { label: string; scores: Record<string, (number | null)[]>; options?: FixtureOptions; pars?: null; startHoles?: Record<string, number>;
  correction: { label: string; options: FixtureOptions }; restore?: { label: string; options: FixtureOptions } }> = {
  "correct-restore": {
    label: "Jake: attested birdies on 3, 4, 5 (a 3-streak)", scores: { jake: card(PARS_72, { 3: -1, 4: -1, 5: -1 }), cade: card(PARS_72, {}) },
    correction: { label: "Second birdie (hole 4) corrected to par → the streak is withdrawn", options: { corrections: { jake: { 4: 4 } } } },
    restore: { label: "Hole 4 restored to a birdie → the streak is back, same quip, not re-sent", options: { corrections: { jake: { 4: 4 } }, laterCorrections: { jake: { 4: 3 } } } },
  },
  shotgun: {
    label: "Shotgun start on 16: Jake birdies 17, 18, 1 (streak carries 18 → 1)", scores: { jake: card(PARS_72, { 17: -1, 18: -1, 1: -1 }) }, startHoles: { "group-1": 16 },
    correction: { label: "Same round as a normal 1st-tee start → no streak (1 and 17–18 aren't consecutive)", options: {} },
  },
  birdies: {
    label: "Jake: birdies on 3–7 (streaks of 3, 4, 5)", scores: { jake: card(PARS_72, run), cade: card(PARS_72, {}) },
    correction: { label: "Hole 7 corrected to par → the 5-streak is withdrawn", options: { corrections: { jake: { 7: 3 } } } },
  },
  "big-plays": {
    label: "Cam ace on 8 · Cade eagle on 5 · Alex albatross on 9", scores: { cam: card(PARS_72, { 8: "ace" }), cade: card(PARS_72, { 5: -2 }), alex: card(PARS_72, { 9: -3 }) },
    correction: { label: "Cam's ace corrected to a 2 → withdrawn (a birdie on its own isn't a highlight)", options: { corrections: { cam: { 8: 3 } } } },
  },
  burst: {
    label: "Burst: Jake's birdie run + Cam's ace on 7 (volume limit)", scores: { jake: card(PARS_72, run), cam: card(PARS_72, { 7: "ace" }) },
    correction: { label: "Hole 6 corrected to par → streaks re-evaluated", options: { corrections: { jake: { 6: 4 } } } },
  },
  unconfirmed: {
    label: "Not confirmed: hole 5 unattested, attester disagrees on 6", scores: { jake: card(PARS_72, run) }, options: { unattested: { jake: [5] }, disagree: { jake: { 6: 5 } } },
    correction: { label: "Attester enters 5 and fixes 6 → the streaks appear", options: { unattested: {}, disagree: {} } },
  },
  "no-pars": {
    label: "No pars on file: Jake's birdie run + Cam's ace", scores: { jake: card(PARS_72, run), cam: card(PARS_72, { 8: "ace" }) }, pars: null,
    correction: { label: "(nothing to correct)", options: {} },
  },
  "out-of-order": {
    label: "Jake's birdie run synced out of order (7, 3, 5, 4, 6 …)", scores: { jake: card(PARS_72, run) }, options: { order: [7, 3, 5, 18, 4, 6, 1, 2, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
    correction: { label: "Same entries replayed in another order", options: { order: "reverse" } },
  },
};

export interface DetectionView { first: ShadowReport; report: ShadowReport; rows: ShadowRow[]; fixtureLabel: string; secondRun: string | null }

/** The shadow run for the simulator state: a first run, then (optionally) a correction or a replayed second run. */
export function simulateDetection(sim: HighlightSim): DetectionView {
  const fixture = DETECTION_FIXTURES[sim.detectionFixture as FixtureId] ?? DETECTION_FIXTURES.birdies;
  const preferences = { [sim.recipient]: {
    golf: sim.tripIntensity === "inherit" ? sim.intensity : sim.tripIntensity,
    categories: { ...DEFAULT_PREFERENCES.categories, ...Object.fromEntries(sim.categoriesOff.map((c) => [c, false])) },
  } };
  const shadow = (options: FixtureOptions, previous?: ShadowReport["state"], startHoles = fixture.startHoles) => runShadow({
    detection: { tripId: SIM_TRIP.id, scoring: buildScoring(PLAYERS, fixture.scores, options), pars: fixture.pars === null ? null : PARS_72, course: SIM_ROUNDS[1].course, startHoles },
    config: SNAPSHOT.config, configVersion: null, competition: competitionProfile(setupFor(sim.tripType, sim.teamCompetition)),
    members: SIM_MEMBERS.map((m) => ({ id: m.id, name: m.name })), preferences, previewDrafts: sim.previewDrafts,
    volume: { maxPerWindow: sim.volumeMax, windowMinutes: 15, exceptional: sim.exceptional }, previous,
  });
  const first = shadow(fixture.options ?? {});
  // The shotgun fixture's "correction" replays the same scores as a normal start on hole 1.
  const shotgunAsNormal = sim.detectionFixture === "shotgun";
  const second = sim.correction ? shadow({ ...fixture.options, ...fixture.correction.options }, first.state, shotgunAsNormal ? {} : fixture.startHoles)
    : sim.rerun ? shadow({ ...fixture.options, replay: true }, first.state) : null;
  const third = second && sim.correction && sim.restore && fixture.restore ? shadow({ ...fixture.options, ...fixture.restore.options }, second.state) : null;
  const report = third ?? second ?? first;
  return {
    first, report, rows: report.rows.filter((row) => row.recipient === sim.recipient), fixtureLabel: fixture.label,
    secondRun: third ? `${fixture.correction.label}; then ${fixture.restore!.label}` : sim.correction ? fixture.correction.label : sim.rerun ? "Second run: the same cards replayed (higher versions)" : null,
  };
}

/** What the existing preview screens draw: the newest alert just delivered to the viewer, and their inbox. */
export function detectionPreviewNotes(sim: HighlightSim): { current: AppNotification | null; inbox: AppNotification[] } {
  const { rows } = simulateDetection(sim);
  const note = (row: ShadowRow, read: boolean): AppNotification => ({
    id: `${row.moment.key}:${row.alert!.variationId}`, kind: "highlight", title: row.alert!.title, body: row.alert!.body, link: row.alert!.link,
    groupId: SIM_TRIP.id, groupName: SIM_TRIP.name, createdAt: row.moment.at, read,
  });
  // Delivered now, or delivered in the first run (duplicates); withdrawn moments are no longer in the report.
  const shown = rows.filter((r) => r.alert && (r.outcome === "delivered" || r.outcome === "duplicate")).sort((a, b) => b.moment.at.localeCompare(a.moment.at));
  const fresh = shown.find((r) => r.outcome === "delivered") ?? null;
  return { current: fresh ? note(fresh, sim.read) : null, inbox: shown.map((r) => note(r, r.outcome === "duplicate" || (r === fresh && sim.read))) };
}
