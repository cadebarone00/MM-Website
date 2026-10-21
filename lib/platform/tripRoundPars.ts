import type { GolfCourse } from "./golfGps/domain";
import { scoringCourse } from "./personalRound.ts";
import { datePlus, type SetupBasis, type SetupValues } from "./savedTripSetup.ts";

/**
 * H5C Part 1 — a Golf Trip round's hole pars (supabase/golf_trip_round_pars.sql). Pure.
 *
 * One confirmed snapshot per trip round, stored in golf_trip_rounds.momentum_pars with where it came from:
 *   - "course": the round's course + tee from Trip Settings (pickedCourses / roundTees), loaded through the same
 *     scoringCourse() as personal rounds, with any tee-specific par (e.g. a forward-tee par 5) applied hole by hole;
 *   - "manual": typed or edited by the organizer (a course without a scorecard, or a correction before tee-off).
 * Only the organizer saves pars, so saved pars are confirmed. Missing pars stay missing: scorecards draw plain numbers and
 * Highlights only detects aces (lib/golf/holeResult.ts never guesses). Locked at the round's first score.
 *
 * Owner decision (2026-10-21) — PAR IS REFERENCE INFORMATION, NEVER AN AUTOMATICALLY ENTERED SCORE. On saved Golf Trip
 * scorecards an untouched hole stays null / unentered; the confirmed par is shown for reference only; only scores a
 * golfer explicitly entered count toward scoring, stats, competitions and Highlights. Attestation, submission, the
 * offline queue and corrections don't change. Part 1 therefore never passes pars to the live scoring sheet
 * (GolfTripScoring), which would count untouched holes as par; H5C Part 2 must show them there for reference without
 * that default.
 */

export type TripParSource = "course" | "manual";
export interface TripRoundPars {
  pars: number[];
  source: TripParSource;
  courseRef: string | null;
  courseName: string | null;
  tee: string | null;
  /** The organizer's trip display name. */
  confirmedBy: string | null;
  confirmedAt: string | null;
  /** The round's first score; pars can't change after it. */
  lockedAt: string | null;
}

const HOLES = 18;
/** 18 whole-number pars, each 3–6 (what the database accepts and what Highlights trusts). */
export const validTripPars = (pars: unknown): pars is number[] =>
  Array.isArray(pars) && pars.length === HOLES && pars.every((p) => Number.isInteger(p) && p >= 3 && p <= 6);

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const textOrNull = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

/** get_trip_round_scoring's 'pars', checked. Null when there are none or anything is off (never half-trusted). */
export function tripRoundParsFromJson(value: unknown): TripRoundPars | null {
  if (!isObject(value) || !validTripPars(value.pars) || (value.source !== "course" && value.source !== "manual")) return null;
  return {
    pars: [...value.pars], source: value.source, courseRef: textOrNull(value.courseRef), courseName: textOrNull(value.courseName), tee: textOrNull(value.tee),
    confirmedBy: textOrNull(value.confirmedBy), confirmedAt: textOrNull(value.confirmedAt), lockedAt: textOrNull(value.lockedAt),
  };
}

/** A round's tees as Trip Settings saves them (RoundTeeBoxes): one tee for the round, or one per hole. */
export interface RoundTeeChoice { tee: string | null; perHole: boolean; holeTees: Record<number, string> }

export type CourseParsResult =
  | { ok: true; pars: number[]; tee: string | null }
  | { ok: false; reason: "no-scorecard" | "tee-par" };

/**
 * The round's pars from its course + tee. scoringCourse() gives the course pars (18 holes, 3–6, or no scorecard);
 * a tee that plays to a different par on a hole overrides it there. Null tee = the course's own pars.
 */
export function coursePars(ref: string, course: GolfCourse, tees: RoundTeeChoice | null): CourseParsResult {
  const scoring = scoringCourse(ref, course);
  if (!scoring) return { ok: false, reason: "no-scorecard" };
  const holes = [...course.holes].sort((a, b) => a.number - b.number);
  const teeFor = (number: number) => (tees?.perHole ? tees.holeTees[number] ?? tees.tee : tees?.tee) ?? null;
  const pars = scoring.par.map((par, i) => {
    const tee = teeFor(i + 1);
    return (tee && holes[i]?.tees.find((t) => t.name === tee)?.par) || par;
  });
  if (!validTripPars(pars)) return { ok: false, reason: "tee-par" };
  const named = tees?.perHole ? [...new Set(Array.from({ length: HOLES }, (_, i) => teeFor(i + 1)).filter(Boolean))] : [tees?.tee ?? null].filter(Boolean);
  return { ok: true, pars, tee: named.length ? named.join(" / ") : null };
}

/**
 * Trip Settings keys each round slot "<day>-<slot>" (pickedCourses, roundTees); saved rounds are numbered in that same
 * order by setupPlan() in savedTripSetup.ts. Index i here = round i + 1. Same day / slot rules as setupPlan.
 */
export function roundSlotKeys(basis: SetupBasis, values: SetupValues): string[] {
  const arrival = datePlus(basis.startDate, Number(values.arrivalShift ?? 0));
  const dayCount = Number(values.dayCount ?? Math.round((Date.parse(`${basis.endDate}T12:00:00Z`) - Date.parse(`${basis.startDate}T12:00:00Z`)) / 86400000) + 1);
  const start = values.golfOnArrival === false ? 1 : 0;
  const days = Math.max(0, dayCount - start - (values.golfOnDeparture === false ? 1 : 0));
  const counts = values.roundsPerDay as Record<string, number> | undefined;
  const keys: string[] = [];
  for (let day = 0; day < days; day++) {
    const playDate = datePlus(arrival, day + start);
    const source = basis.rounds.filter((round) => round.playDate === playDate);
    for (let slot = 0; slot < (counts?.[day] ?? source.length); slot++) keys.push(`${day}-${slot}`);
  }
  return keys;
}

/** The course + tees Trip Settings has for a round, or null when no course with a search handle was picked. */
export function roundCoursePick(basis: SetupBasis, values: SetupValues, roundNumber: number): { ref: string; name: string; tees: RoundTeeChoice | null } | null {
  const key = roundSlotKeys(basis, values)[roundNumber - 1];
  const picked = key ? (values.pickedCourses as Record<string, { ref?: unknown; name?: unknown; settings?: { tees?: unknown } }> | undefined)?.[key] : undefined;
  if (!picked || typeof picked.ref !== "string" || !picked.ref || typeof picked.name !== "string") return null;
  const saved = (values.roundTees as Record<string, RoundTeeChoice> | undefined)?.[key];
  const settingsTee = typeof picked.settings?.tees === "string" ? picked.settings.tees : null;
  const tees: RoundTeeChoice | null = saved ? { tee: saved.tee ?? settingsTee, perHole: saved.perHole === true, holeTees: saved.holeTees ?? {} }
    : settingsTee ? { tee: settingsTee, perHole: false, holeTees: {} } : null;
  return { ref: picked.ref, name: picked.name, tees };
}

/** The organizer's pars form → 18 pars, or why not. Blank or out-of-range holes are named, never filled in. */
export function parsFromForm(values: (string | number | null)[]): { ok: true; pars: number[] } | { ok: false; error: string } {
  if (values.length !== HOLES) return { ok: false, error: "Enter the par for all 18 holes." };
  const pars = values.map((v) => (typeof v === "number" ? v : v === null || v.trim() === "" ? NaN : Number(v)));
  const bad = pars.map((p, i) => (Number.isInteger(p) && p >= 3 && p <= 6 ? 0 : i + 1)).filter(Boolean);
  return bad.length ? { ok: false, error: `Enter a par of 3–6 for hole${bad.length > 1 ? "s" : ""} ${bad.join(", ")}.` } : { ok: true, pars };
}

/** Group start holes for detection and the scoring order: group id → start hole (1 is left out: the normal start). */
export function startHolesOf(groups: { id: string; startHole?: number }[]): Record<string, number> {
  return Object.fromEntries(groups.filter((g) => g.startHole && g.startHole !== 1).map((g) => [g.id, g.startHole as number]));
}
