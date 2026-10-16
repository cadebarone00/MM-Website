import { test } from "node:test";
import assert from "node:assert/strict";
import { apnsPayload, BODY_LIMIT, formatToPar, liveActivityContent, newestFirst, safeAppLink, thruLabel, timeAgo, TITLE_LIMIT, unreadCount } from "./format.ts";
import type { AppNotification, LiveRoundActivity } from "./types.ts";

const note = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1", kind: "highlight", title: "Heating Up!", body: "3 birdies in a row for Cade", link: "/golf-trips/abc#momentum",
  groupId: "trip-1", groupName: "Desert Classic", createdAt: "2026-10-16T15:00:00.000Z", read: false, ...over,
});
const live = (over: Partial<LiveRoundActivity> = {}): LiveRoundActivity => ({
  groupId: "trip-1", groupName: "Desert Classic", round: 2, course: "PGA West", playerName: "Cade", toPar: -2, thru: 12, holes: 18,
  position: "T2", match: { status: "2 UP", opponent: "Jake" }, state: "live", updatedAt: "2026-10-16T15:00:00.000Z", ...over,
});

test("score to par", () => {
  assert.equal(formatToPar(0), "E");
  assert.equal(formatToPar(-2), "-2");
  assert.equal(formatToPar(3), "+3");
});

test("thru label: starting, mid-round, finished", () => {
  assert.equal(thruLabel(live({ thru: 0 })), "Starting");
  assert.equal(thruLabel(live({ thru: 12 })), "Thru 12");
  assert.equal(thruLabel(live({ thru: 18 })), "F");
  assert.equal(thruLabel(live({ thru: 9, holes: 9 })), "F");
  assert.equal(thruLabel(live({ thru: 14, state: "final" })), "F");
});

test("time ago like the iPhone", () => {
  const now = new Date("2026-10-16T15:00:00.000Z");
  assert.equal(timeAgo("2026-10-16T15:00:00.000Z", now), "now");
  assert.equal(timeAgo("2026-10-16T15:00:30.000Z", now), "now"); // a slightly-ahead clock never shows "-1m"
  assert.equal(timeAgo("2026-10-16T14:55:00.000Z", now), "5m ago");
  assert.equal(timeAgo("2026-10-16T13:00:00.000Z", now), "2h ago");
  assert.equal(timeAgo("2026-10-15T12:00:00.000Z", now), "Yesterday");
  assert.equal(timeAgo("2026-10-03T12:00:00.000Z", now), "Oct 3");
  assert.equal(timeAgo("not a date", now), "now");
});

test("unread count and newest first", () => {
  const list = [note({ id: "a", createdAt: "2026-10-16T10:00:00.000Z", read: true }), note({ id: "b", createdAt: "2026-10-16T12:00:00.000Z" }), note({ id: "c", createdAt: "2026-10-16T11:00:00.000Z" })];
  assert.equal(unreadCount(list), 2);
  assert.equal(unreadCount([]), 0);
  assert.deepEqual(newestFirst(list).map(item => item.id), ["b", "c", "a"]);
  assert.deepEqual(list.map(item => item.id), ["a", "b", "c"]); // input not changed
});

test("only same-app links open from a notification", () => {
  assert.equal(safeAppLink("/golf-trips/abc#momentum"), "/golf-trips/abc#momentum");
  assert.equal(safeAppLink("https://evil.example"), "/");
  assert.equal(safeAppLink("//evil.example"), "/");
  assert.equal(safeAppLink("javascript:alert(1)"), "/");
  assert.equal(safeAppLink(""), "/");
});

test("Apple payload: group stacking, clipped text, safe link, whole badge", () => {
  const payload = apnsPayload(note({ title: "x".repeat(200), body: "y".repeat(400), link: "https://evil.example" }), 3.7);
  assert.equal(payload.aps["thread-id"], "trip-1");
  assert.equal(payload.aps.alert.title.length, TITLE_LIMIT);
  assert.equal(payload.aps.alert.body.length, BODY_LIMIT);
  assert.ok(payload.aps.alert.body.endsWith("…"));
  assert.equal(payload.link, "/");
  assert.equal(payload.aps.badge, 3);
  assert.equal(apnsPayload(note(), -1).aps.badge, 0);
  assert.equal(apnsPayload(note(), 1).aps.alert.title, "Heating Up!");
});

test("Live Activity content for the Swift widget", () => {
  assert.deepEqual(liveActivityContent(live()), { toPar: "-2", thru: "Thru 12", progress: 12 / 18, position: "T2", matchStatus: "2 UP", opponent: "Jake", final: false });
  const done = liveActivityContent(live({ thru: 18, toPar: 0, position: null, match: null }));
  assert.deepEqual(done, { toPar: "E", thru: "F", progress: 1, position: "", matchStatus: "", opponent: "", final: true });
  assert.equal(liveActivityContent(live({ thru: 30 })).progress, 1);
});
