/**
 * Golf Trip questionnaire draft: each step's answers, kept in this browser tab (sessionStorage) so a later
 * step can use an earlier one (Golf reads Trip Basics' dates; Review reads everything). Nothing is saved to the database yet.
 */
export type GolfTripDraft = Record<string, string>;

const KEY = "golfTripDraft";
/** Longest trip the date list will spell out. */
const MAX_TRIP_DAYS = 31;

export function readGolfTripDraft(): GolfTripDraft {
  return parseGolfTripDraft(golfTripDraftSnapshot());
}

/** The draft as stored (a stable string, for useSyncExternalStore). Empty if there is none or storage is blocked. */
export function golfTripDraftSnapshot(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function parseGolfTripDraft(raw: string): GolfTripDraft {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed as GolfTripDraft : {};
  } catch {
    return {};
  }
}

export function saveGolfTripDraft(values: GolfTripDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...readGolfTripDraft(), ...values }));
  } catch {
    // Storage blocked (private mode): the questionnaire still works, later steps just don't see earlier answers.
  }
}

/** Every date from start to end ("YYYY-MM-DD", inclusive). Empty if either is missing or end is before start. */
export function tripDates(start: string | undefined, end: string | undefined): string[] {
  const from = parseDay(start);
  const to = parseDay(end);
  if (from === null || to === null || to < from) return [];
  const dates: string[] = [];
  for (let day = from; day <= to && dates.length < MAX_TRIP_DAYS; day += 86_400_000) {
    dates.push(new Date(day).toISOString().slice(0, 10));
  }
  return dates;
}

export interface PlannedRound {
  /** 1, 2, 3… across the whole trip. */
  number: number;
  dayNumber: number;
  /** "YYYY-MM-DD", or "" when the trip has no dates. */
  date: string;
}

/** The rounds the Golf step planned: each golf day gives 1 or 2, in order. */
export function plannedRounds(draft: GolfTripDraft): PlannedRound[] {
  const golfDays = Math.min(Math.max(Math.trunc(Number(draft.golfDays)) || 0, 0), MAX_TRIP_DAYS);
  const rounds: PlannedRound[] = [];
  for (let dayNumber = 1; dayNumber <= golfDays; dayNumber++) {
    const count = draft[`day${dayNumber}Rounds`] === "2" ? 2 : 1;
    for (let i = 0; i < count; i++) rounds.push({ number: rounds.length + 1, dayNumber, date: draft[`day${dayNumber}Date`] ?? "" });
  }
  return rounds;
}

export interface ReviewRow { label: string; value: string }

const NOT_SET = "Not set";
const ANSWERS: Record<string, string> = { yes: "Yes", no: "No", undecided: "Not sure yet" };

/** Everything the questionnaire covered, top to bottom, one label / value row each, for the Review page. */
export function reviewRows(draft: GolfTripDraft): ReviewRow[] {
  const text = (value: string | undefined) => value?.trim() || NOT_SET;
  const day = (date: string | undefined) => parseDay(date) === null ? "" : shortTripDate(date as string);
  const start = day(draft.startDate);
  const end = day(draft.endDate);
  const rounds = plannedRounds(draft);

  return [
    { label: "Trip Name", value: text(draft.tripName) },
    { label: "Destination", value: text(draft.destination) },
    { label: "Dates", value: start && end ? (start === end ? start : `${start} – ${end}`) : NOT_SET },
    { label: "Players", value: text(draft.playerCount) },
    { label: "Your Name", value: text(draft.yourName) },
    { label: "Your Email", value: text(draft.yourEmail) },
    { label: "Golf Days", value: rounds.length ? String(rounds[rounds.length - 1].dayNumber) : NOT_SET },
    { label: "Rounds", value: rounds.length ? String(rounds.length) : NOT_SET },
    ...rounds.map((round) => ({
      label: `Round ${round.number}`,
      value: `${day(round.date) || `Day ${round.dayNumber}`} · ${draft[`round${round.number}Course`]?.trim() || "Course not set"}`,
    })),
    { label: "Tournament", value: ANSWERS[draft.includesTournament] ?? NOT_SET },
    { label: "Lodging", value: ANSWERS[draft.knowsLodging] ?? NOT_SET },
    { label: "Flights", value: ANSWERS[draft.knowsFlights] ?? NOT_SET },
    { label: "Transportation", value: ANSWERS[draft.knowsTransportation] ?? NOT_SET },
  ];
}

/** "2027-04-22" → "Thu, Apr 22". */
export function shortTripDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function parseDay(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}
