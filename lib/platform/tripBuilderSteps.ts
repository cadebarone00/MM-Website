import { plannedRounds, tripDates, type GolfTripDraft } from "./golfTripDraft.ts";

/**
 * Trip Builder's question screens, in order (docs/superpowers/specs/2026-11-03-trip-builder-design.md).
 * Teams and Format only show when the group is competing; Courses is skipped when the golf step was skipped.
 */
export const TRIP_BUILDER_STEPS = ["basics", "dates", "players", "teams", "golf", "courses", "format", "lodging"] as const;
export type TripBuilderStep = (typeof TRIP_BUILDER_STEPS)[number];

export const TRIP_BUILDER_START = "/tournaments/create/golf-trip";

export const stepPath = (step: TripBuilderStep) => step === "basics" ? "/golf-trips/new" : `/golf-trips/new/${step}`;

function shows(step: TripBuilderStep, draft: GolfTripDraft): boolean {
  if (step === "teams" || step === "format") return draft.competing === "yes";
  if (step === "courses") return draft.golfSkipped !== "1";
  return true;
}

export function nextStep(step: TripBuilderStep, draft: GolfTripDraft): TripBuilderStep | "create" {
  for (let i = TRIP_BUILDER_STEPS.indexOf(step) + 1; i < TRIP_BUILDER_STEPS.length; i++) {
    if (shows(TRIP_BUILDER_STEPS[i], draft)) return TRIP_BUILDER_STEPS[i];
  }
  return "create";
}

export function previousStep(step: TripBuilderStep, draft: GolfTripDraft): TripBuilderStep | "start" {
  for (let i = TRIP_BUILDER_STEPS.indexOf(step) - 1; i >= 0; i--) {
    if (shows(TRIP_BUILDER_STEPS[i], draft)) return TRIP_BUILDER_STEPS[i];
  }
  return "start";
}

/** The first required screen that isn't answered yet (name + destination, then dates), or null when both are done. */
export function firstMissingStep(draft: GolfTripDraft): TripBuilderStep | null {
  if (!draft.tripName?.trim() || !draft.destination?.trim()) return "basics";
  if (!tripDates(draft.startDate, draft.endDate).length) return "dates";
  return null;
}

/** Drops golf days (and their rounds' courses) that no longer fall inside the trip's dates, e.g. after the trip got shorter. */
export function clampRoundsToDates(draft: GolfTripDraft): GolfTripDraft {
  const dates = tripDates(draft.startDate, draft.endDate);
  const golfDays = Math.trunc(Number(draft.golfDays)) || 0;
  if (!dates.length || golfDays <= 0) return draft;
  let keepDays = 0;
  while (keepDays < golfDays && keepDays < dates.length) {
    const date = draft[`day${keepDays + 1}Date`];
    if (date && !dates.includes(date)) break;
    keepDays++;
  }
  if (keepDays === golfDays) return draft;
  const out: GolfTripDraft = { ...draft, golfDays: String(keepDays) };
  for (let day = keepDays + 1; day <= golfDays; day++) { delete out[`day${day}Date`]; delete out[`day${day}Rounds`]; }
  const keptRounds = plannedRounds(out).length;
  for (const key of Object.keys(out)) {
    const match = key.match(/^round(\d+)(Course|Format)$/);
    if (match && Number(match[1]) > keptRounds) delete out[key];
  }
  return out;
}
