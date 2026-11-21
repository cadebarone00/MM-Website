import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWidgetSnapshot, pickWidgetItem, whenLabel, widgetTimeline, type WidgetItem } from "./widget.ts";
import { safeAppLink } from "./format.ts";
import type { LiveRoundActivity } from "./types.ts";

const live = (over: Partial<LiveRoundActivity> = {}): LiveRoundActivity => ({
  groupId: "trip-1", groupName: "Desert Classic", round: 2, course: "PGA West", playerName: "Cade", toPar: 3, thru: 12, holes: 18,
  position: "T2", match: { status: "2 UP", opponents: ["White"] }, state: "live", teeTime: null, result: null, updatedAt: "2026-11-21T15:00:00.000Z", ...over,
});
const item = (over: Partial<WidgetItem> = {}): WidgetItem => ({
  id: "r1", source: "trip", groupName: "Desert Classic", course: "PGA West", teeTime: "2026-11-25T09:00", link: "/golf-trips/abc", live: null, ...over,
});
const NOW = "2026-11-21T10:00";

test("nothing: empty list → No rounds yet, links to /rounds/new", () => {
  const snap = buildWidgetSnapshot([], NOW);
  assert.equal(snap.state, "nothing");
  assert.equal(snap.title, "No rounds yet");
  assert.equal(snap.line1, "Tap to start one");
  assert.equal(snap.link, "/rounds/new");
  assert.deepEqual(snap.lock, { circle: "", rect: ["The Maroon", "No rounds yet"], inline: "" });
});

test("next: soonest tee time wins", () => {
  const snap = buildWidgetSnapshot([
    item({ id: "late", course: "Pinehurst No. 2", teeTime: "2026-11-28T08:40" }),
    item({ id: "soon", course: "Tobacco Road", teeTime: "2026-11-25T09:00" }),
  ], NOW);
  assert.equal(snap.state, "next");
  assert.equal(snap.title, "Tobacco Road");
  assert.equal(snap.eyebrow, "NEXT · TEE TIME");
  assert.equal(snap.line1, "Wed 9:00");
  assert.equal(snap.line2, "In 4 days");
  assert.equal(snap.upcoming.length, 1);
  assert.deepEqual(snap.upcoming[0], { title: "Pinehurst No. 2", when: "Sat 8:40", link: "/golf-trips/abc" });
  assert.deepEqual(snap.lock, { circle: "9:00", rect: ["Tobacco Road", "Wed 9:00"], inline: "Tobacco Road 9:00" });
});

test("live beats an earlier tee time", () => {
  const picked = pickWidgetItem([item({ id: "soon", teeTime: "2026-11-21T11:00" }), item({ id: "now", teeTime: null, live: live() })], NOW);
  assert.equal(picked?.item.id, "now");
  assert.equal(picked?.state, "live");
});

test("two live rounds → newest updatedAt", () => {
  const picked = pickWidgetItem([
    item({ id: "stale", live: live({ updatedAt: "2026-11-01T15:00:00.000Z" }) }),
    item({ id: "fresh", live: live({ updatedAt: "2026-11-21T15:00:00.000Z" }) }),
  ], NOW);
  assert.equal(picked?.item.id, "fresh");
});

test("live text", () => {
  const snap = buildWidgetSnapshot([item({ live: live(), link: "/golf-trips/abc/score", group: [{ name: "Cade", toPar: 3, thru: 12 }, { name: "Jake", toPar: -1, thru: 12 }], holes: [{ hole: 9, par: 4, strokes: 5 }, { hole: 10, par: 5, strokes: 5 }, { hole: 11, par: 3, strokes: 2 }, { hole: 12, par: 4, strokes: 4 }] })], NOW);
  assert.equal(snap.state, "live");
  assert.equal(snap.eyebrow, "LIVE · PGA WEST");
  assert.equal(snap.title, "PGA West");
  assert.equal(snap.line1, "+3 · Thru 12");
  assert.equal(snap.line2, "2 UP vs White");
  assert.equal(snap.link, "/golf-trips/abc/score");
  assert.deepEqual(snap.group, [{ name: "Cade", score: "+3", thru: "12" }, { name: "Jake", score: "-1", thru: "12" }]);
  assert.deepEqual(snap.holes.map(hole => hole.hole), [10, 11, 12]);
  assert.deepEqual(snap.lock, { circle: "+3", rect: ["PGA West", "+3 · Thru 12"], inline: "+3 thru 12" });
});

test("live without a match shows the group name", () => {
  assert.equal(buildWidgetSnapshot([item({ live: live({ match: null }) })], NOW).line2, "Desert Classic");
});

test("whenLabel", () => {
  assert.equal(whenLabel("2026-11-21T15:00", NOW), "Today");
  assert.equal(whenLabel("2026-11-22T08:00", NOW), "Tomorrow");
  assert.equal(whenLabel("2026-11-24T08:00", NOW), "In 3 days");
  assert.equal(whenLabel("2026-11-21T09:00", NOW), "Now");
  assert.equal(whenLabel("2027-01-01T08:00", "2026-12-31T23:30"), "Tomorrow");
});

test("past tee time stays Now for 60 min, then drops", () => {
  const items = [item({ teeTime: "2026-11-21T08:40" })];
  assert.equal(buildWidgetSnapshot(items, "2026-11-21T09:30").line2, "Now");
  assert.equal(buildWidgetSnapshot(items, "2026-11-21T09:41").state, "nothing");
});

test("no tee time is never next or upcoming", () => {
  const snap = buildWidgetSnapshot([item({ id: "a", teeTime: null }), item({ id: "b", teeTime: "2026-11-23T08:00" })], NOW);
  assert.equal(snap.state, "next");
  assert.equal(snap.upcoming.length, 0);
  assert.equal(buildWidgetSnapshot([item({ teeTime: null })], NOW).state, "nothing");
});

test("timeline: midnight + tee + after", () => {
  const entries = widgetTimeline([item({ teeTime: "2026-11-22T08:40" })], "2026-11-21T20:00");
  assert.deepEqual(entries.map(entry => entry.at), ["2026-11-21T20:00", "2026-11-22T00:00", "2026-11-22T08:40", "2026-11-22T09:40"]);
  assert.deepEqual(entries.slice(0, 3).map(entry => entry.line2), ["Tomorrow", "Today", "Now"]);
  assert.equal(entries[3].state, "nothing");
});

test("timeline: live returns one entry", () => {
  assert.equal(widgetTimeline([item({ live: live() })], NOW).length, 1);
});

test("timeline: at most 8 entries", () => {
  assert.ok(widgetTimeline([1, 2, 3, 4, 5].map(day => item({ id: `d${day}`, teeTime: `2026-11-2${day}T08:00` })), "2026-11-20T23:00").length <= 8);
});

test("links pass through safeAppLink", () => {
  const snap = buildWidgetSnapshot([item({ link: "https://evil.example" })], NOW);
  assert.equal(snap.link, safeAppLink("https://evil.example"));
});
