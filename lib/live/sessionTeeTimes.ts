import type { MatchFormat } from "./types.ts";

const PACIFIC_TZ = "America/Los_Angeles";

/**
 * Which of a Session's 3 match-tee-time slots a given match number uses.
 * Fourball/Foursome have 3 matches, one slot each. Singles has 6 matches,
 * two sharing each slot (1&2, 3&4, 5&6) since two singles matches
 * conventionally go off the same tee time.
 */
export function teeTimeSlotForMatch(format: MatchFormat, matchNumber: number): number {
  if (format === "Singles") return Math.floor((matchNumber - 1) / 2);
  return matchNumber - 1;
}

function pacificOffsetMinutes(utcGuess: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC_TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utcGuess)
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - utcGuess.getTime()) / 60000;
}

/**
 * Combines a Session's date ("YYYY-MM-DD") with one of its "HH:MM" tee
 * times, interpreted as Pacific Time (PST/PDT, handled automatically), into
 * the absolute instant a match's teeTime should be. Null if either input is
 * missing — callers must show a "TBD" fallback rather than format an
 * invalid date.
 */
export function deriveMatchTeeTime(date: string | null, timeOfDay: string | null): Date | null {
  if (!date || !timeOfDay) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = timeOfDay.split(":").map(Number);
  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) return null;
  // First guess: treat the wall-clock time as if it were already UTC, then
  // measure Pacific's real offset at that instant and correct for it. One
  // correction is enough for a same-day tee time (never near midnight UTC,
  // the only place a single-pass guess could straddle a DST boundary).
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = pacificOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
}

/** "7:30 AM PT" — for displaying an already-absolute tee time back in Pacific. */
export function formatPacificTeeTime(date: Date): string {
  return `${date.toLocaleTimeString("en-US", { timeZone: PACIFIC_TZ, hour: "numeric", minute: "2-digit" })} PT`;
}
