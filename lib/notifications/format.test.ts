import { test } from "node:test";
import assert from "node:assert/strict";
import { apnsPayload, BODY_LIMIT, formatPoints, formatToPar, liveLeaderboard, matchMark, minutesUntil, pillStatus, readableOnBlack, teeClock, textOnFill, liveActivityContent, newestFirst, safeAppLink, thruLabel, timeAgo, TITLE_LIMIT, unreadCount } from "./format.ts";
import type { AppNotification, LiveRoundActivity } from "./types.ts";

const note = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1", kind: "highlight", title: "Heating Up!", body: "3 birdies in a row for Cade", link: "/golf-trips/abc#momentum",
  groupId: "trip-1", groupName: "Desert Classic", createdAt: "2026-10-16T15:00:00.000Z", read: false, ...over,
});
const live = (over: Partial<LiveRoundActivity> = {}): LiveRoundActivity => ({
  groupId: "trip-1", groupName: "Desert Classic", round: 2, course: "PGA West", playerName: "Cade", toPar: -2, thru: 12, holes: 18,
  position: "T2", match: { status: "2 UP", opponent: "Jake" }, state: "live", teeTime: null, result: null, updatedAt: "2026-10-16T15:00:00.000Z", ...over,
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

test("team points with halves", () => {
  assert.equal(formatPoints(3.5), "3½");
  assert.equal(formatPoints(1.5), "1½");
  assert.equal(formatPoints(4), "4");
  assert.equal(formatPoints(0.5), "½");
  assert.equal(formatPoints(0), "0");
});

test("match status arrow", () => {
  assert.deepEqual(matchMark("3 UP"), { direction: "up", holes: 3 });
  assert.deepEqual(matchMark("2 dn"), { direction: "down", holes: 2 });
  assert.deepEqual(matchMark("AS"), { direction: "even", holes: 0 });
  assert.equal(matchMark("Won 3&2"), null);
  assert.equal(matchMark(""), null);
});

test("tee time clock and countdown (trip-local)", () => {
  assert.equal(teeClock("2026-10-16T14:24"), "2:24");
  assert.equal(teeClock("2026-10-16T08:05"), "8:05");
  assert.equal(teeClock("2026-10-16T00:30"), "12:30");
  assert.equal(minutesUntil("2026-10-16T14:24", "2026-10-16T14:11"), 13);
  assert.equal(minutesUntil("2026-10-16T14:24", "2026-10-16T13:24"), 60);
  assert.equal(minutesUntil("2026-10-16T14:24", "2026-10-16T14:30"), 0); // organizer starting late never goes negative
  assert.equal(minutesUntil("bad", "2026-10-16T14:30"), 0);
});

test("pill status follows the Live Activity lifecycle", () => {
  // Popped up: owner's example, 2:24 tee time at 2:11.
  assert.deepEqual(pillStatus(live({ state: "pre", teeTime: "2026-10-16T14:24" }), "2026-10-16T14:11"), { kind: "countdown", minutes: "13m", clock: "2:24", tiny: "13m" });
  // Live: round score, match arrow, thru.
  assert.deepEqual(pillStatus(live({ toPar: 2, thru: 15, match: { status: "3 UP", opponent: "Collin" } }), "x"), { kind: "live", toPar: "+2", mark: { direction: "up", holes: 3 }, thru: 15, tiny: "▲3" });
  assert.equal(pillStatus(live({ match: { status: "1 DN", opponent: "C" } }), "x").tiny, "▼1");
  assert.equal(pillStatus(live({ match: { status: "AS", opponent: "C" } }), "x").tiny, "AS");
  assert.equal(pillStatus(live({ match: null, toPar: -3 }), "x").tiny, "-3");
  // Round over, next round coming: next tee time.
  assert.deepEqual(pillStatus(live({ state: "over", teeTime: "2026-10-16T14:00", result: "W 3&2" }), "x"), { kind: "next", clock: "2:00", tiny: "2:00" });
  // Round over with no next round, and after the last round: the result.
  assert.deepEqual(pillStatus(live({ state: "over", result: "W 3&2" }), "x"), { kind: "result", result: "W 3&2", tiny: "W" });
  assert.equal(pillStatus(live({ state: "final", result: "L 2&1" }), "x").tiny, "L");
  // Popped up but no tee time set: falls back to the live layout.
  assert.equal(pillStatus(live({ state: "pre" }), "x").kind, "live");
});

test("leaderboard rows: top 3 with me in place, or top 2 + a line + me", () => {
  const board = ["Cam Latto", "Collin Ross", "Jake Parker", "Mike Chen", "Pete Peabody", "Cade Barone", "Alex Rivera"]
    .map((name, index) => ({ position: String(index + 1), name, toPar: index - 4, me: false }));
  const as = (name: string) => board.map(row => ({ ...row, me: row.name === name }));
  // Owner's example: Cade in 6th → 1 Cam, 2 Collin, line, 6 Cade.
  const sixth = liveLeaderboard(as("Cade Barone"));
  assert.deepEqual(sixth.rows.map(row => row.position + " " + row.name), ["1 Cam Latto", "2 Collin Ross", "6 Cade Barone"]);
  assert.equal(sixth.split, true);
  // In 2nd → Cam, Cade, Collin (in place, no line).
  const second = liveLeaderboard(as("Collin Ross"));
  assert.deepEqual(second.rows.map(row => row.name), ["Cam Latto", "Collin Ross", "Jake Parker"]);
  assert.equal(second.split, false);
  assert.equal(liveLeaderboard(as("Jake Parker")).split, false); // 3rd works the same
  assert.equal(liveLeaderboard(as("Cam Latto")).rows[0].me, true);
  assert.equal(liveLeaderboard(as("Mike Chen")).split, true); // 4th is the first spot with a line
  // Not playing / no leaderboard / tiny trip.
  assert.deepEqual(liveLeaderboard(as("Nobody")).rows.map(row => row.name), ["Cam Latto", "Collin Ross", "Jake Parker"]);
  assert.deepEqual(liveLeaderboard([]), { rows: [], split: false });
  assert.equal(liveLeaderboard(as("Cam Latto").slice(0, 2)).rows.length, 2);
  // Ties come straight from the leaderboard.
  const tied = as("Cade Barone").map(row => row.name === "Collin Ross" || row.name === "Jake Parker" ? { ...row, position: "T2" } : row);
  assert.deepEqual(liveLeaderboard(tied).rows.map(row => row.position), ["1", "T2", "6"]);
});

test("team colors stay readable", () => {
  assert.equal(readableOnBlack("#ffffff"), "#ffffff");
  assert.notEqual(readableOnBlack("#6b161a"), "#6b161a"); // dark maroon is lightened on black
  assert.equal(readableOnBlack("not a color"), "#ffffff");
  assert.equal(textOnFill("#fbf8f1"), "dark");
  assert.equal(textOnFill("#6b161a"), "light");
});
