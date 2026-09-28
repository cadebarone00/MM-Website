import { test } from "node:test";
import assert from "node:assert/strict";
import { countdownParts, parseWatchCountdown } from "./countdown";

test("countdowns use exact elapsed days across month and leap-day boundaries", () => {
  assert.deepEqual(countdownParts("2028-03-01T01:02:03Z", Date.parse("2028-01-01T00:00:00Z")), { days: 60, hours: 1, minutes: 2, seconds: 3 });
});

test("missing targets are pending and expired targets stop at zero", () => {
  assert.equal(countdownParts(null, Date.now()), null);
  assert.equal(countdownParts("invalid", Date.now()), null);
  assert.deepEqual(countdownParts("2020-01-01", Date.now()), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});

test("broadcast target uses its selected time zone independently of the tournament", () => {
  const draft = { title: " On The Range ", date: "2027-01-05", time: "15:30", timezone: "America/Los_Angeles" };
  assert.equal(parseWatchCountdown(draft)?.targetAt, "2027-01-05T23:30:00.000Z");
  assert.equal(parseWatchCountdown(draft)?.title, "On The Range");
  assert.equal(parseWatchCountdown({ ...draft, timezone: "America/New_York" })?.targetAt, "2027-01-05T20:30:00.000Z");
});

test("broadcast target rejects invalid dates, time zones, names and skipped daylight-saving times", () => {
  const draft = { title: "Range", date: "2027-01-05", time: "15:30", timezone: "America/Los_Angeles" };
  for (const patch of [{ date: "2027-02-30" }, { time: "25:00" }, { timezone: "unknown" }, { title: " " }, { title: "x".repeat(121) }, { date: "2027-03-14", time: "02:30" }]) {
    assert.equal(parseWatchCountdown({ ...draft, ...patch }), null);
  }
});
