/**
 * The "Mom" section on the trip's Home: simple, friendly notifications shown live in the app, and a countdown when there are none.
 *
 * Owner rules: every line here is written in code and approved by the owner — nothing is generated at runtime. Each kind of
 * notification has a bucket of approved lines and the app picks one; links only go to the approved official sites below.
 * Approved wording and rules live in project_specs.md ("the Mom section"). Add a line or a notification only after approval.
 */
import type { TripTravel } from "./tripTravel.ts";

/** Airlines' official check-in pages (approved list). Matched by name or by the flight number's airline code. */
export const APPROVED_CHECK_IN_LINKS: { airline: string; names: string[]; code: string; url: string }[] = [
  { airline: "American", names: ["american", "american airlines"], code: "AA", url: "https://www.aa.com/reservation/view/find-your-trip" },
  { airline: "Delta", names: ["delta", "delta air lines", "delta airlines"], code: "DL", url: "https://www.delta.com/mytrips/" },
  { airline: "United", names: ["united", "united airlines"], code: "UA", url: "https://www.united.com/checkin" },
  { airline: "Southwest", names: ["southwest", "southwest airlines"], code: "WN", url: "https://www.southwest.com/air/check-in/" },
];

export function checkInLink(airline?: string, flightNumber?: string): string | null {
  const name = airline?.trim().toLowerCase() ?? "";
  const code = flightNumber?.trim().toUpperCase().slice(0, 2) ?? "";
  return APPROVED_CHECK_IN_LINKS.find(entry => entry.names.includes(name) || (code && entry.code === code))?.url ?? null;
}

export type MomNote = {
  id: string;
  /** Approved lines for this notification (its bucket); one is shown. */
  lines: string[];
  action?: { label: string; url: string };
};

const HOUR = 3600000;
/** "YYYY-MM-DDTHH:mm" (trip-local wall time) → milliseconds, compared only with other trip-local times. */
const wall = (local: string) => Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
const clock = (local: string) => {
  const [hours, minutes] = local.slice(11, 16).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

/**
 * Notifications that apply right now to me (`travel.meId`), soonest first.
 * 1. Flight check-in — from 24 hours before one of my flights departs until it departs.
 */
export function momNotes(travel: TripTravel, now: string): MomNote[] {
  const mine = new Set(travel.participants.filter(p => p.memberId === travel.meId && p.status === "going").map(p => p.itemId));
  const at = wall(now);
  return travel.items
    .filter(item => item.kind === "flight" && mine.has(item.id))
    .filter(item => at >= wall(item.startsAt) - 24 * HOUR && at < wall(item.startsAt))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(item => {
      const { airline, flightNumber, to } = item.details;
      const flight = [airline, flightNumber].filter(Boolean).join(" ");
      const lines = [`Don't forget to check in for your flight to ${to || "your destination"}.`];
      if (flight) lines.push(`Time to check in for ${flight}. It leaves at ${clock(item.startsAt)}.`);
      const url = checkInLink(airline, flightNumber);
      return { id: `check-in:${item.id}`, lines, ...(url ? { action: { label: "Check in", url } } : {}) };
    });
}

/** Picks a line from a note's bucket; `turn` (e.g. how many times it has shown) changes the pick. */
export function pickLine(note: MomNote, turn: number): string {
  let hash = turn;
  for (const char of note.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return note.lines[hash % note.lines.length];
}

/**
 * What the countdown counts to: the first plan on arrival day, or 7:00 AM on arrival day when it has none yet.
 * `arrivalDay` is "YYYY-MM-DD"; returns null with no arrival day.
 */
export function countdownTarget(arrivalDay: string | undefined, plans: { startsAt: string }[]): string | null {
  if (!arrivalDay || !/^\d{4}-\d{2}-\d{2}$/.test(arrivalDay)) return null;
  const first = plans.map(plan => plan.startsAt).filter(start => start.startsWith(arrivalDay)).sort()[0];
  return first ?? `${arrivalDay}T07:00`;
}

/** Days / hours / minutes / seconds from `now` ("YYYY-MM-DDTHH:mm:ss") until `target`; null once it's reached. */
export function countdownParts(target: string, now: string): { days: number; hours: number; minutes: number; seconds: number } | null {
  const left = Math.floor((wall(target) - wall(now)) / 1000);
  if (!(left > 0)) return null;
  return { days: Math.floor(left / 86400), hours: Math.floor(left / 3600) % 24, minutes: Math.floor(left / 60) % 60, seconds: left % 60 };
}
