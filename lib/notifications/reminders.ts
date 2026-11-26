/**
 * Timed phone notifications (project_specs.md "Expo app Step 6", part 6c). Pure and unit-tested: what is due right now
 * for one trip. The 5-minute timer (app/api/internal/push-reminders) calls these and sends each one once.
 * Every time here is TRIP-LOCAL ("2027-04-22T08:10", no zone), read in the trip's time zone (golf_trips.time_zone).
 */
import { defaultRoundComp, matchesPerTeeTime, type RoundCompSettings } from "@/lib/platform/roundCompetition";
import type { SetupBasis } from "@/lib/platform/savedTripSetup";
import { tripSchedule } from "@/lib/platform/tripScheduleView";
import { minutesUntil, teeClock } from "./format.ts";

export const DEFAULT_TRIP_TIME_ZONE = "America/Chicago";
/** Tee time: sent when it's 20–35 minutes away ("Tee time in 30 minutes"); the timer runs every 5 minutes. */
export const TEE_WINDOW: [number, number] = [20, 35];
/** Draft: sent when it's 8–20 minutes away ("The draft starts in 15 minutes"). */
export const DRAFT_WINDOW: [number, number] = [8, 20];

/** A real IANA time zone this server knows. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}

/** The wall clock in a time zone, as "YYYY-MM-DDTHH:mm". */
export function localNow(timeZone: string, now: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Strictly in the future and inside the window (minutesUntil never goes below 0, so check the order of the times too). */
const inWindow = (at: string, nowLocal: string, [low, high]: [number, number]) => at > nowLocal && minutesUntil(at, nowLocal) > low && minutesUntil(at, nowLocal) <= high;

export type TeeReminder = { key: string; players: string[]; round: number; course: string; time: string };

/**
 * Tee times due now. Each round slot's groups (setup `teeTimes[slot][group]` "HH:MM") go to that group's players: the
 * players placed in it (`teePlayers`) and the players of the matches it holds (`teeMatches`: match m plays in tee time
 * ⌊m ÷ matches per tee time⌋). Player numbers are places in `memberIds` (the trip's members in join order, the order the
 * setup editors use); a place with no account (null) is skipped.
 */
export function dueTeeTimes(tripId: string, values: Record<string, unknown>, basis: SetupBasis, memberIds: (string | null)[], nowLocal: string): TeeReminder[] {
  const teePlayers = values.teePlayers as Record<string, Record<string, number[]>> | undefined;
  const teeMatches = values.teeMatches as Record<string, Record<string, { a: number[]; b: number[] }>> | undefined;
  const formats = values.compFormats as Record<string, RoundCompSettings> | undefined;
  const out: TeeReminder[] = [];
  for (const slot of tripSchedule(values, basis).slots) {
    const perGroup = matchesPerTeeTime((formats?.[slot.key] ?? defaultRoundComp(0)).format);
    slot.teeTimes.forEach((time, group) => {
      if (!time) return;
      const at = `${slot.date}T${time}`;
      if (!inWindow(at, nowLocal, TEE_WINDOW)) return;
      const places = new Set<number>(teePlayers?.[slot.key]?.[group] ?? []);
      for (const [match, sides] of Object.entries(teeMatches?.[slot.key] ?? {})) {
        if (Math.floor(Number(match) / perGroup) === group) [...(sides?.a ?? []), ...(sides?.b ?? [])].forEach((p) => places.add(p));
      }
      const players = [...places].flatMap((p) => (Number.isInteger(p) && memberIds[p] ? [memberIds[p] as string] : []));
      if (players.length) out.push({ key: `tee:${tripId}:${slot.key}:${group}:${at}`, players: [...new Set(players)], round: slot.number, course: slot.course, time: teeClock(at) });
    });
  }
  return out;
}

/** The draft, when one is scheduled (`draftDate` + `draftTime`) and it's due now. */
export function dueDraft(tripId: string, values: Record<string, unknown>, nowLocal: string): { key: string; time: string } | null {
  const date = values.draftDate, time = values.draftTime;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (values.teamSelection !== undefined && values.teamSelection !== "Draft") return null;
  const at = `${date}T${time}`;
  return inWindow(at, nowLocal, DRAFT_WINDOW) ? { key: `draft:${tripId}:${at}`, time: teeClock(at) } : null;
}
