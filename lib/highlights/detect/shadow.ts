import type { AlertLevel } from "../metadata.ts";
import { ruleProfile } from "../metadata.ts";
import type { HighlightConfig } from "../types.ts";
import type { CompetitionProfile } from "../engine/competition.ts";
import { applyVolumeCap, DEFAULT_VOLUME_POLICY, reconcile, type VolumePolicy } from "../engine/delivery.ts";
import { evaluateAlert, type AlertEvent, type Check, type RenderedAlert } from "../engine/evaluate.ts";
import { DEFAULT_PREFERENCES, type AlertPreferences } from "../engine/preferences.ts";
import { seededRandom } from "../engine/selection.ts";
import { detectRoundMoments, type DetectedMoment, type DetectionInput } from "./scoreMoments.ts";

/**
 * H5B SHADOW MODE — test only. Runs the TypeScript detectors over a round and decides, per trip member, what WOULD be
 * sent — through the same engine (eligibility, audience, preferences, intensity, approval, placeholders, volume limit).
 * It never sends, schedules or writes anything: the result is a report, and `state` is plain data the caller keeps
 * (in tests / the simulator; a later phase may store it in a shadow table). The current momentum alerts are untouched.
 *
 * Idempotency: each moment's wording is picked once (seeded by its key, with per-trip anti-repetition) and reused on every
 * later run; a moment already "delivered" to someone is reported as a duplicate, never twice.
 * Corrections: moments that disappear after a score change are withdrawn; if they come back they keep their wording.
 */

export interface ShadowState {
  /** Moment key → the wording chosen for it (kept even after a withdrawal, so a restored moment reads the same). */
  picks: Record<string, string>;
  /** Moment keys the last run found. */
  active: string[];
  /** `${momentKey}|${recipient}` already delivered in an earlier run. */
  delivered: string[];
}
export const EMPTY_SHADOW_STATE: ShadowState = { picks: {}, active: [], delivered: [] };

export interface ShadowInput {
  detection: DetectionInput;
  config: HighlightConfig;
  configVersion: number | null;
  competition: CompetitionProfile;
  members: { id: string; name: string }[];
  /** Per member; missing = the defaults (Balanced, every category on). */
  preferences?: Record<string, AlertPreferences>;
  volume?: VolumePolicy;
  /** Simulator only: let Draft copy through, labeled. Production evaluates Approved only. */
  previewDrafts?: boolean;
  previous?: ShadowState;
}

export type ShadowOutcome = "delivered" | "duplicate" | "muted" | "volume-limited" | "not-created";
export interface ShadowRow {
  moment: DetectedMoment;
  recipient: string;
  outcome: ShadowOutcome;
  reason: string;
  checks: Check[];
  alert: RenderedAlert | null;
}
export interface ShadowReport {
  moments: DetectedMoment[];
  notes: string[];
  rows: ShadowRow[];
  /** Keys that were found last run but not now (a correction removed them). */
  withdrawn: string[];
  added: string[];
  state: ShadowState;
}

const eventOf = (tripId: string, moment: DetectedMoment): AlertEvent => ({ tripId, ruleId: moment.ruleId, tier: moment.tier, values: moment.values, key: moment.key });
const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 17);

export function runShadow(input: ShadowInput): ShadowReport {
  const previous = input.previous ?? EMPTY_SHADOW_STATE;
  const { moments, notes } = detectRoundMoments(input.detection);
  const keys = moments.map((m) => m.key);
  const { withdraw: withdrawn, add } = reconcile(previous.active, keys);
  const picks = { ...previous.picks };
  const delivered = new Set(previous.delivered);
  const memberIds = input.members.map((m) => m.id);
  const audience = { members: memberIds };
  const common = { config: input.config, configVersion: input.configVersion, competition: input.competition, audience, previewDrafts: input.previewDrafts };

  // 1. One wording per moment, picked once with every preference on (who it's FOR is decided per person below).
  const recentByConditional = new Map<string, string[]>();
  for (const moment of moments) {
    const observer = memberIds[0];
    const forced = picks[moment.key] ?? null;
    const conditionalOf = (variationId: string) => variationId.replace(/-V\d{2}$/, "");
    const evaluation = evaluateAlert(eventOf(input.detection.tripId, moment), {
      ...common, recipientId: observer, preferences: { golf: "all", categories: { ...DEFAULT_PREFERENCES.categories } },
      forcedVariation: forced, random: seededRandom(hash(moment.key)),
      recent: forced ? [] : [...(recentByConditional.values())].flat(),
    });
    if (evaluation.alert && !forced) picks[moment.key] = evaluation.alert.variationId;
    if (evaluation.alert) {
      const cond = conditionalOf(evaluation.alert.variationId);
      recentByConditional.set(cond, [evaluation.alert.variationId, ...(recentByConditional.get(cond) ?? [])]);
    }
  }

  // 2. Per member: the engine's decision, then the golf volume limit over what would be delivered.
  const rows: ShadowRow[] = [];
  for (const recipient of memberIds) {
    const preferences = input.preferences?.[recipient] ?? DEFAULT_PREFERENCES;
    const mine: ShadowRow[] = moments.map((moment) => {
      const evaluation = evaluateAlert(eventOf(input.detection.tripId, moment), { ...common, recipientId: recipient, preferences, forcedVariation: picks[moment.key] ?? null, random: () => 0 });
      const outcome: ShadowOutcome = evaluation.outcome === "delivered" && delivered.has(`${moment.key}|${recipient}`) ? "duplicate" : evaluation.outcome;
      return { moment, recipient, outcome, reason: outcome === "duplicate" ? "Already delivered in an earlier run — never sent twice." : evaluation.summary, checks: evaluation.checks, alert: evaluation.alert };
    });
    const levelOf = (row: ShadowRow): AlertLevel => {
      const rule = input.config.rules.find((r) => r.id === row.moment.ruleId);
      return (rule && ruleProfile(rule)?.alertLevel) || "all";
    };
    const fresh = mine.filter((row) => row.outcome === "delivered");
    const { muted } = applyVolumeCap(fresh.map((row) => ({ key: row.moment.key, level: levelOf(row), at: row.moment.at })), input.volume ?? DEFAULT_VOLUME_POLICY);
    for (const row of mine) {
      if (row.outcome === "delivered" && muted.includes(row.moment.key)) {
        row.outcome = "volume-limited";
        row.reason = "Over the golf volume limit for this window — kept in the trip's history, no push.";
      }
      if (row.outcome === "delivered") delivered.add(`${row.moment.key}|${recipient}`);
      rows.push(row);
    }
  }

  return { moments, notes, rows, withdrawn, added: add, state: { picks, active: keys, delivered: [...delivered] } };
}

/**
 * Shadow comparison with the current SQL momentum alerts (trip_momentum_events causes). Expected differences are listed,
 * not hidden: the sheet starts birdie streaks at 3 (SQL also fires at 2), and eagles / albatrosses / streaks of 5–10 are
 * new. Returns matches and what each side found that the other didn't, so they can be resolved before any cutover.
 */
export function compareWithMomentum(moments: DetectedMoment[], momentum: { cause: string; profileId: string; hole: number }[]) {
  const asCause = (m: DetectedMoment) => (m.ruleId === "HL-004" ? "hole_in_one" : m.ruleId === "HL-001" && m.tier! <= 4 ? `birdie_${m.tier}` : null);
  const ts = moments.flatMap((m) => (asCause(m) ? [`${asCause(m)}|${m.profileId}|${m.hole}`] : []));
  const sql = momentum.filter((e) => e.cause !== "early_match_win").map((e) => `${e.cause}|${e.profileId}|${e.hole}`);
  return {
    matched: ts.filter((k) => sql.includes(k)),
    onlyTypeScript: ts.filter((k) => !sql.includes(k)),
    onlySql: sql.filter((k) => !ts.includes(k)),
    expectedOnlySql: sql.filter((k) => !ts.includes(k) && k.startsWith("birdie_2|")),
    newInTypeScript: moments.filter((m) => !asCause(m)).map((m) => `${m.ruleId}${m.tier ? `×${m.tier}` : ""}|${m.profileId}|${m.hole}`),
  };
}
