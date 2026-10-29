import { test } from "node:test";
import assert from "node:assert/strict";
import { ageInYears, checkBirthdate, isOldEnough, MINIMUM_AGE, parseCalendarDate, todayUtc, type CalendarDate } from "./age.ts";

const d = (value: string) => parseCalendarDate(value)!;

test("parses only real YYYY-MM-DD calendar dates", () => {
  assert.deepEqual(parseCalendarDate("2000-02-29"), { year: 2000, month: 2, day: 29 }, "2000 is a leap year (divisible by 400)");
  for (const bad of ["2023-02-29", "1900-02-29", "2024-13-01", "2024-00-10", "2024-04-31", "2024-4-1", "24-04-01", "2024-04-01T00:00", " 2024-04-01", "", null, 20240401, undefined]) {
    assert.equal(parseCalendarDate(bad), null, String(bad));
  }
});

test("age is exact: the year counts only once the birthday is reached", () => {
  assert.equal(ageInYears(d("2011-06-15"), d("2024-06-14")), 12, "day before 13th birthday");
  assert.equal(ageInYears(d("2011-06-15"), d("2024-06-15")), 13, "13th birthday");
  assert.equal(ageInYears(d("2011-06-15"), d("2024-06-16")), 13);
  assert.equal(ageInYears(d("2011-12-31"), d("2024-12-30")), 12);
  assert.equal(ageInYears(d("2011-12-31"), d("2024-12-31")), 13);
  assert.equal(ageInYears(d("2012-01-01"), d("2024-12-31")), 12, "end of year, born start of next year");
  // A 365.25-day approximation gets this wrong (13 years minus a day is 4747 days ≈ 12.997 years, but around leap years
  // the approximation can round either way); exact arithmetic never does.
  assert.equal(ageInYears(d("2000-03-01"), d("2013-02-28")), 12);
  assert.equal(ageInYears(d("2000-03-01"), d("2013-03-01")), 13);
});

test("29 February birthdays turn over on 1 March in non-leap years (same rule as the database)", () => {
  const leapling = d("2012-02-29");
  assert.equal(ageInYears(leapling, d("2025-02-28")), 12);
  assert.equal(ageInYears(leapling, d("2025-03-01")), 13);
  assert.equal(ageInYears(leapling, d("2024-02-28")), 11);
  assert.equal(ageInYears(leapling, d("2024-02-29")), 12, "in a leap year the birthday itself counts");
  assert.equal(ageInYears(d("2008-02-29"), d("2021-02-28")), 12);
  assert.equal(ageInYears(d("2008-02-29"), d("2021-03-01")), 13);
});

test("the 13+ rule at its exact boundary", () => {
  assert.equal(MINIMUM_AGE, 13);
  assert.equal(isOldEnough(d("2011-06-15"), d("2024-06-15")), true, "13 today");
  assert.equal(isOldEnough(d("2011-06-16"), d("2024-06-15")), false, "13 tomorrow");
  assert.equal(isOldEnough(d("1950-01-01"), d("2024-06-15")), true);
  assert.equal(isOldEnough(d("2024-06-15"), d("2024-06-15")), false, "born today");
});

test("checkBirthdate validates and answers only eligible yes/no", () => {
  const today: CalendarDate = d("2026-10-28");
  assert.deepEqual(checkBirthdate("2013-10-28", today), { ok: true, eligible: true });
  assert.deepEqual(checkBirthdate("2013-10-29", today), { ok: true, eligible: false });
  assert.deepEqual(checkBirthdate("1990-05-05", today), { ok: true, eligible: true });
  assert.deepEqual(checkBirthdate("2026-10-29", today), { ok: false, error: "future" });
  assert.deepEqual(checkBirthdate("2026-10-28", today), { ok: true, eligible: false }, "born today: valid but not eligible");
  assert.deepEqual(checkBirthdate("1899-12-31", today), { ok: false, error: "too_early" });
  assert.deepEqual(checkBirthdate("1900-01-01", today), { ok: true, eligible: true });
  assert.deepEqual(checkBirthdate("2013-02-30", today), { ok: false, error: "invalid" });
  assert.deepEqual(checkBirthdate({ year: 2000 }, today), { ok: false, error: "invalid" });
  for (const result of [checkBirthdate("2000-01-01", today), checkBirthdate("2020-01-01", today)]) {
    assert.deepEqual(Object.keys(result).sort(), ["eligible", "ok"], "never echoes the date or the age");
  }
});

test("today is the UTC calendar date (the database's current_date)", () => {
  assert.deepEqual(todayUtc(new Date("2026-03-01T03:00:00-08:00")), { year: 2026, month: 3, day: 1 }, "11:00 UTC on 1 March");
  assert.deepEqual(todayUtc(new Date("2026-02-28T20:00:00-08:00")), { year: 2026, month: 3, day: 1 }, "04:00 UTC on 1 March");
  assert.deepEqual(todayUtc(new Date("2026-02-28T15:00:00-08:00")), { year: 2026, month: 2, day: 28 });
});
