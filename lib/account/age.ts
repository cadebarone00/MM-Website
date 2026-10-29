/**
 * Age and the 13+ rule (project_specs.md "Pending accounts, onboarding activation & 13+ eligibility" §4). Pure, exact
 * calendar arithmetic on YYYY-MM-DD dates — never "days ÷ 365.25" — and the SAME rule as the database's
 * account_age_years() (Postgres age()): a year is complete when the month/day is reached, so someone born on 29 February
 * turns a year older on 1 March in non-leap years.
 *
 * "Today" is the UTC calendar date by default, matching the database's current_date (the database decides
 * eligibility; this mirrors it for server checks and tests). Nothing here stores, logs or returns a birthdate to anyone.
 */

export const MINIMUM_AGE = 13;
export const EARLIEST_BIRTHDATE = "1900-01-01";

export type CalendarDate = { year: number; month: number; day: number };

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const daysInMonth = (year: number, month: number) => [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

/** Strict "YYYY-MM-DD" → a real calendar date, or null (no 2023-02-29, no month 13, no extra text). */
export function parseCalendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

const compare = (a: CalendarDate, b: CalendarDate) => a.year - b.year || a.month - b.month || a.day - b.day;

/** Today's calendar date in UTC (the database's current_date). */
export function todayUtc(now: Date = new Date()): CalendarDate {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

/** Whole years from `birth` to `on`. Born 29 Feb: still the old age on 28 Feb of a non-leap year, a year older on 1 Mar. */
export function ageInYears(birth: CalendarDate, on: CalendarDate): number {
  const beforeBirthdayThisYear = on.month < birth.month || (on.month === birth.month && on.day < birth.day);
  return on.year - birth.year - (beforeBirthdayThisYear ? 1 : 0);
}

export type BirthdateCheck =
  | { ok: true; eligible: boolean }
  | { ok: false; error: "invalid" | "future" | "too_early" };

/**
 * Is this a birthdate the server should accept, and is the person 13+ on `today`? Answers only eligible yes/no — the
 * caller never needs the age itself, and must not send the birthdate or age to anyone else.
 */
export function checkBirthdate(value: unknown, today: CalendarDate = todayUtc()): BirthdateCheck {
  const birth = parseCalendarDate(value);
  if (!birth) return { ok: false, error: "invalid" };
  if (compare(birth, parseCalendarDate(EARLIEST_BIRTHDATE)!) < 0) return { ok: false, error: "too_early" };
  if (compare(birth, today) > 0) return { ok: false, error: "future" };
  return { ok: true, eligible: ageInYears(birth, today) >= MINIMUM_AGE };
}

/** The 13+ rule on its own, for already-validated dates. */
export const isOldEnough = (birth: CalendarDate, today: CalendarDate = todayUtc()) => ageInYears(birth, today) >= MINIMUM_AGE;
