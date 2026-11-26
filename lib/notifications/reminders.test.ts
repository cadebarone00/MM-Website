import { test } from "node:test";
import assert from "node:assert/strict";
import { dueDraft, dueTeeTimes, isTimeZone, localNow } from "./reminders.ts";

const basis = { startDate: "2027-04-22", endDate: "2027-04-24", rounds: [
  { roundNumber: 1, dayNumber: 1, playDate: "2027-04-22", courseName: "Pinehurst No. 2" },
] } as never;
const members = ["p0", "p1", null, "p3", "p4"];

test("time zones and the trip's wall clock", () => {
  assert.equal(isTimeZone("America/Phoenix"), true);
  assert.equal(isTimeZone("Mars/Base"), false);
  assert.equal(isTimeZone("drop table"), false);
  // 2027-04-22 15:00 UTC = 08:00 in Phoenix (no daylight saving), 10:00 in Chicago (daylight saving).
  const at = new Date(Date.UTC(2027, 3, 22, 15, 0));
  assert.equal(localNow("America/Phoenix", at), "2027-04-22T08:00");
  assert.equal(localNow("America/Chicago", at), "2027-04-22T10:00");
});

test("a tee time 30 minutes out goes to its group's players (placed + in its matches), skipping no-account places", () => {
  const values = { dayCount: 3, teeTimes: { "0-0": ["08:30", "08:40"] }, teePlayers: { "0-0": { 0: [0, 2], 1: [4] } }, teeMatches: { "0-0": { 0: { a: [1], b: [null] } } } };
  const due = dueTeeTimes("t1", values, basis, members, "2027-04-22T08:00");
  assert.deepEqual(due, [{ key: "t1:0-0:0", players: ["p0", "p1"], round: 1, course: "Pinehurst No. 2", time: "8:30" }].map((d) => ({ ...d, key: `tee:${d.key}:2027-04-22T08:30` })));
});

test("tee times outside the window, or already past, aren't due", () => {
  const values = { dayCount: 3, teeTimes: { "0-0": ["08:30"] }, teePlayers: { "0-0": { 0: [0] } } };
  assert.deepEqual(dueTeeTimes("t1", values, basis, members, "2027-04-22T07:30"), [], "an hour out");
  assert.deepEqual(dueTeeTimes("t1", values, basis, members, "2027-04-22T08:15"), [], "15 minutes out");
  assert.deepEqual(dueTeeTimes("t1", values, basis, members, "2027-04-22T09:00"), [], "past");
  assert.equal(dueTeeTimes("t1", values, basis, members, "2027-04-22T07:56").length, 1, "34 minutes out");
});

test("the draft 15 minutes out", () => {
  const values = { teamSelection: "Draft", draftDate: "2027-04-21", draftTime: "19:00" };
  assert.deepEqual(dueDraft("t1", values, "2027-04-21T18:45"), { key: "draft:t1:2027-04-21T19:00", time: "7:00" });
  assert.equal(dueDraft("t1", values, "2027-04-21T18:30"), null, "30 minutes out");
  assert.equal(dueDraft("t1", values, "2027-04-21T19:05"), null, "started");
  assert.equal(dueDraft("t1", { ...values, teamSelection: "Random" }, "2027-04-21T18:45"), null, "no draft");
  assert.equal(dueDraft("t1", { draftDate: "2027-04-21" }, "2027-04-21T18:45"), null, "no time");
});
