import { test } from "node:test";
import assert from "node:assert/strict";
import { liveEventDetail, liveEventsFrom, liveSection, type LiveEvent } from "./liveDirectory.ts";

const event = (over: Partial<LiveEvent> = {}): LiveEvent => ({ kind: "trip", name: "Pinehurst", href: "/tap-in/W4K9PZ", firstDate: "2026-11-20", lastDate: "2026-11-23", ended: false, course: "Pinehurst No. 2", playerCount: 8, ...over });

test("rows become events with a working live link; broken rows are dropped", () => {
  const rows = [
    { kind: "trip", name: "Pinehurst", code: "w4k9pz", firstDate: "2026-11-20", lastDate: "2026-11-23T00:00:00", ended: false, course: " Pinehurst No. 2 ", playerCount: 8 },
    { kind: "tournament", name: "Open", code: "WABCDE", firstDate: null, lastDate: null, ended: true, course: "", playerCount: "3" },
    { kind: "trip", name: "No code", code: null }, { kind: "club", name: "Later", code: "WZZZZZ" }, null, "junk",
  ];
  assert.deepEqual(liveEventsFrom(rows), [
    event(),
    { kind: "tournament", name: "Open", href: "/tap-in/WABCDE", firstDate: null, lastDate: null, ended: true, course: null, playerCount: 3 },
  ]);
  assert.deepEqual(liveEventsFrom({ not: "a list" }), []);
});

test("Live during its dates, Upcoming before (or with no dates), Past after or once ended", () => {
  assert.equal(liveSection(event(), "2026-11-21"), "Live");
  assert.equal(liveSection(event(), "2026-11-20"), "Live");
  assert.equal(liveSection(event(), "2026-11-19"), "Upcoming");
  assert.equal(liveSection(event({ firstDate: null, lastDate: null }), "2026-11-21"), "Upcoming");
  assert.equal(liveSection(event(), "2026-11-24"), "Past");
  assert.equal(liveSection(event({ ended: true }), "2026-11-21"), "Past");
});

test("the line under the name: kind · dates · course · players", () => {
  assert.equal(liveEventDetail(event()), "Golf trip · Nov 20 – Nov 23 · Pinehurst No. 2 · 8 players");
  assert.equal(liveEventDetail(event({ kind: "tournament", lastDate: "2026-11-20", course: null, playerCount: 1 })), "Tournament · Nov 20 · 1 player");
  assert.equal(liveEventDetail(event({ kind: "league", lastDate: "2026-11-20", playerCount: 12 })), "League · Nov 20 · Pinehurst No. 2 · 12 players");
});
