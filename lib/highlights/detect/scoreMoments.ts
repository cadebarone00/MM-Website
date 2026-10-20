import type { HoleScoreEntry, TripRoundScoring } from "../../platform/tripScoring.ts";
import type { TemplateValues } from "../template.ts";

/**
 * H5B — the first automatic golf detectors, in TypeScript (spec: "Highlights Engine", decision 1: gradual move from SQL).
 * Pure: a round's scoring (the same TripRoundScoring the Scoring screen loads) + the round's hole pars in → moments out.
 *   HL-004 Hole-in-one · HL-003 Albatross (3 under par) · HL-002 Eagle (2 under par) · HL-001 Birdie streak (3–10 in a row).
 * Only ATTESTED scores count: the golfer's own entry and their attester's entry for the hole agree (the current momentum
 * triggers use the same rule). Per entry, the newest version wins, so replays and offline re-sends are harmless.
 * Everything is recomputed from the whole round, in hole order — so entry order never matters, and a correction simply
 * produces a different set of moments (shadow.ts withdraws the ones that disappeared).
 * One hole earns one moment: a hole-in-one is never also an eagle / albatross. Birdie streaks count exactly-one-under
 * holes in a row; an eagle, a missing / unconfirmed hole or anything over a birdie breaks the run (spec 2026-10-09).
 * Shotgun starts: each group plays from its starting hole (e.g. 7 → 18, then 1 → 6); streaks follow that playing order,
 * so a run can carry from 18 to 1 and never links the last hole played back to the first.
 * Pars must come from a CONFIRMED per-round snapshot (roundPars.ts) — never guessed; without one only aces are possible.
 */

export interface DetectionInput {
  tripId: string;
  scoring: TripRoundScoring;
  /** The round's 18 pars from the course scorecard; null when unknown (then only hole-in-ones can be detected). */
  pars: number[] | null;
  course: string | null;
  /** Shotgun: scoring group id → the hole that group starts on (1–18). Missing = hole 1. */
  startHoles?: Record<string, number>;
}

/** The order a group plays its holes: start → 18, then 1 → start − 1. */
export function playingOrder(startHole = 1): number[] {
  const start = Number.isInteger(startHole) && startHole >= 1 && startHole <= HOLES ? startHole : 1;
  return Array.from({ length: HOLES }, (_, i) => ((start - 1 + i) % HOLES) + 1);
}

export type DetectorRule = "HL-001" | "HL-002" | "HL-003" | "HL-004";
export interface DetectedMoment {
  /** Stable identity: the same moment always has the same key (idempotency, corrections). */
  key: string;
  ruleId: DetectorRule;
  /** Birdie streak length (3–10); null for the others. */
  tier: number | null;
  profileId: string;
  playerName: string;
  /** The hole it happened on (for a streak: the hole that made it N in a row). */
  hole: number;
  /** When it happened: the later of the two agreeing entries for that hole. */
  at: string;
  values: TemplateValues;
}
export interface DetectionResult { moments: DetectedMoment[]; notes: string[] }

export const STREAK_MIN = 3;
export const STREAK_MAX = 10;
const HOLES = 18;

/** The newest entry per (golfer, who entered it, hole): highest version, then latest client time. */
function latestEntries(entries: HoleScoreEntry[]): Map<string, HoleScoreEntry> {
  const latest = new Map<string, HoleScoreEntry>();
  for (const entry of entries) {
    const key = `${entry.scoredProfileId}|${entry.enteredByProfileId}|${entry.hole}`;
    const seen = latest.get(key);
    if (!seen || entry.version > seen.version || (entry.version === seen.version && entry.clientUpdatedAt > seen.clientUpdatedAt)) latest.set(key, entry);
  }
  return latest;
}

/** Per golfer: hole → attested strokes (both entries agree) and when, or null. */
export function attestedScores(scoring: TripRoundScoring): Map<string, ({ strokes: number; at: string } | null)[]> {
  const latest = latestEntries(scoring.entries);
  const result = new Map<string, ({ strokes: number; at: string } | null)[]>();
  for (const group of scoring.groups) for (const player of group.players) {
    const holes = Array.from({ length: HOLES }, (_, i) => {
      if (!player.attesterProfileId) return null; // no attester: nothing is confirmed
      const own = latest.get(`${player.profileId}|${player.profileId}|${i + 1}`);
      const attest = latest.get(`${player.profileId}|${player.attesterProfileId}|${i + 1}`);
      if (!own || !attest || own.strokes === null || own.strokes !== attest.strokes) return null;
      return { strokes: own.strokes, at: own.clientUpdatedAt > attest.clientUpdatedAt ? own.clientUpdatedAt : attest.clientUpdatedAt };
    });
    result.set(player.profileId, holes);
  }
  return result;
}

export function detectRoundMoments(input: DetectionInput): DetectionResult {
  const { scoring, pars } = input;
  const notes: string[] = [];
  const parsOk = Array.isArray(pars) && pars.length === HOLES && pars.every((p) => Number.isInteger(p) && p >= 3 && p <= 6);
  if (!parsOk) notes.push("No valid pars for this round: only hole-in-ones can be detected (birdies, eagles and albatrosses need the course's pars).");
  const names = new Map(scoring.groups.flatMap((g) => g.players.map((p) => [p.profileId, p.displayName] as const)));
  const base = (profileId: string) => ({ Player: names.get(profileId) ?? "A golfer", Round: String(scoring.roundNumber), ...(input.course ? { Course: input.course } : {}) });
  const moments: DetectedMoment[] = [];
  const keyOf = (rule: string, profileId: string, hole: number, extra = "") => `${input.tripId}:${scoring.roundId}:${rule}:${profileId}:${hole}${extra}`;

  const startOf = new Map(scoring.groups.flatMap((g) => g.players.map((p) => [p.profileId, input.startHoles?.[g.id] ?? 1] as const)));
  for (const [profileId, holes] of attestedScores(scoring)) {
    let run = 0;
    for (const hole of playingOrder(startOf.get(profileId))) {
      const i = hole - 1;
      const score = holes[i];
      if (score && score.strokes === 1) {
        moments.push({ key: keyOf("HL-004", profileId, hole), ruleId: "HL-004", tier: null, profileId, playerName: names.get(profileId) ?? "", hole, at: score.at, values: { ...base(profileId), Hole: String(hole) } });
      } else if (score && parsOk) {
        const toPar = score.strokes - pars![i];
        if (toPar === -3) moments.push({ key: keyOf("HL-003", profileId, hole), ruleId: "HL-003", tier: null, profileId, playerName: names.get(profileId) ?? "", hole, at: score.at, values: { ...base(profileId), Hole: String(hole) } });
        if (toPar === -2) moments.push({ key: keyOf("HL-002", profileId, hole), ruleId: "HL-002", tier: null, profileId, playerName: names.get(profileId) ?? "", hole, at: score.at, values: { ...base(profileId), Hole: String(hole) } });
      }
      // Birdie streak: exactly one under, hole after hole.
      const birdie = !!score && parsOk && score.strokes > 1 && score.strokes - pars![i] === -1;
      run = birdie ? run + 1 : 0;
      if (birdie && run >= STREAK_MIN && run <= STREAK_MAX) {
        moments.push({ key: keyOf("HL-001", profileId, hole, `:${run}`), ruleId: "HL-001", tier: run, profileId, playerName: names.get(profileId) ?? "", hole, at: score!.at,
          values: { ...base(profileId), Hole: String(hole), Count: String(run) } });
      }
    }
  }
  moments.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
  return { moments, notes };
}
