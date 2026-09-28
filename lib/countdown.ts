import { deriveMatchTeeTime } from "./live/sessionTeeTimes";
import { TIMEZONE_IDS } from "./data/timezones";

export type CountdownTarget = { title: string; targetAt: string | null; timezone: string };
export type WatchCountdownSettings = CountdownTarget & { date: string; time: string };

export function countdownParts(targetAt: string | null, now: number) {
  const target = targetAt ? Date.parse(targetAt) : NaN;
  if (!Number.isFinite(target)) return null;
  const total = Math.max(0, Math.ceil((target - now) / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor(total % 86400 / 3600), minutes: Math.floor(total % 3600 / 60), seconds: total % 60 };
}

export function parseWatchCountdown(value: unknown): WatchCountdownSettings | null {
  if (!value || typeof value !== "object") return null;
  const { title, date, time, timezone } = value as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120 ||
    typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    typeof timezone !== "string" || !TIMEZONE_IDS.has(timezone)) return null;
  const calendarDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) return null;
  const instant = deriveMatchTeeTime(date, time, timezone);
  if (!instant || !Number.isFinite(instant.getTime())) return null;
  // Reject a clock time skipped by the spring daylight-saving transition.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant).map((part) => [part.type, part.value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== date || `${parts.hour}:${parts.minute}` !== time) return null;
  return { title: title.trim(), date, time, timezone, targetAt: instant.toISOString() };
}
