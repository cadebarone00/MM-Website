import { test } from "node:test";
import assert from "node:assert/strict";
import { groupScheduleByDay } from "./roundSchedule.ts";
import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";

test("groupScheduleByDay numbers distinct dates in chronological order", () => {
  const schedule: UpcomingRoundScheduleItem[] = [
    { session: 1, date: "2027-01-06", courseName: "Course A", format: "Fourball" },
    { session: 3, date: "2027-01-07", courseName: "Course A", format: "Singles" },
    { session: 2, date: "2027-01-07", courseName: "Course A", format: "Alt Shot" },
  ];
  const days = groupScheduleByDay(schedule);
  assert.deepEqual(
    days.map((d) => ({ day: d.day, date: d.date })),
    [
      { day: 1, date: "2027-01-06" },
      { day: 2, date: "2027-01-07" },
    ]
  );
});

test("groupScheduleByDay keeps every round slated for a day, sorted by round number", () => {
  const schedule: UpcomingRoundScheduleItem[] = [
    { session: 3, date: "2027-01-07", courseName: null, format: "Singles" },
    { session: 2, date: "2027-01-07", courseName: null, format: "Alt Shot" },
  ];
  const days = groupScheduleByDay(schedule);
  assert.equal(days.length, 1);
  assert.deepEqual(
    days[0].rounds.map((r) => r.session),
    [2, 3]
  );
});

test("groupScheduleByDay drops rounds with no date yet", () => {
  const schedule: UpcomingRoundScheduleItem[] = [
    { session: 1, date: "2027-01-06", courseName: null, format: null },
    { session: 2, date: null, courseName: null, format: null },
  ];
  const days = groupScheduleByDay(schedule);
  assert.equal(days.length, 1);
  assert.equal(days[0].rounds.length, 1);
});

test("groupScheduleByDay returns nothing for an empty schedule", () => {
  assert.deepEqual(groupScheduleByDay([]), []);
});
