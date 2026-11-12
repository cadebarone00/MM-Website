import { test } from "node:test";
import assert from "node:assert/strict";
import { bigBoardScore, halves, upcomingSlides } from "./bigBoard";
import { GOLF_MATCH_PREVIEW } from "./golfTripPreviewFixture";
import type { ItineraryItem } from "./golfTripItinerary";

const item = (id: string, startsAt: string, endsAt?: string): ItineraryItem => ({ id, kind: "other", title: id, startsAt, endsAt });

test("upcoming slides: what's on now first, then NEXT, then every later plan as UPCOMING (not cut at two)", () => {
  const items = [item("dinner", "2027-04-22T19:00"), item("lunch", "2027-04-22T12:00", "2027-04-22T13:30"), item("ride", "2027-04-23T07:00"), item("breakfast", "2027-04-22T08:00")];
  const slides = upcomingSlides(items, "2027-04-22T12:30");
  assert.deepEqual(slides.map(s => `${s.status}:${s.item.id}`), ["NOW:lunch", "NEXT:dinner", "UPCOMING:ride"]);
  assert.deepEqual(upcomingSlides(items, "2027-04-22T06:00").map(s => s.status), ["NEXT", "UPCOMING", "UPCOMING", "UPCOMING"]);
  assert.deepEqual(upcomingSlides(items, "2027-04-24T06:00"), []);
});

test("upcoming slides: a live golf round shows first as LIVE", () => {
  const round = item("round", "2027-04-22T08:30");
  const slides = upcomingSlides([round, item("dinner", "2027-04-22T19:00")], "2027-04-22T10:00", round);
  assert.deepEqual(slides.map(s => `${s.status}:${s.item.id}`), ["LIVE:round", "NEXT:dinner"]);
});

test("big board score: nothing before play starts or without a match; otherwise team points or the leader", () => {
  assert.equal(bigBoardScore(undefined, true), null);
  assert.equal(bigBoardScore(GOLF_MATCH_PREVIEW, false), null);
  const score = bigBoardScore(GOLF_MATCH_PREVIEW, true);
  assert.ok(score);
  assert.match(score.line, /^Round \d+/);
  if (score.kind === "team") {
    assert.equal(score.left.name, GOLF_MATCH_PREVIEW.sides[0].name);
    assert.ok(score.toWin > 0);
  }
  const solo = bigBoardScore({ ...GOLF_MATCH_PREVIEW, matches: [] }, true);
  if (solo) assert.equal(solo.kind, "individual");
  const split = bigBoardScore(GOLF_MATCH_PREVIEW, true, true);
  if (split && GOLF_MATCH_PREVIEW.leaderboard.some(row => row.holes.some(h => h !== null))) {
    assert.equal(split.kind, "both");
    if (split.kind === "both") {
      assert.ok(split.top.length > 0 && split.top.length <= 4);
      assert.equal(split.top[0].name, GOLF_MATCH_PREVIEW.leaderboard.find(row => row.holes.some(h => h !== null))!.golfer.name);
    }
  }
  assert.equal(halves(2.5), "2½");
  assert.equal(halves(0.5), "½");
  assert.equal(halves(3), "3");
});

test("split board keeps top four or top three plus viewer with actual position", () => {
  const leaderboard = Array.from({length: 8}, (_, i) => ({ ...GOLF_MATCH_PREVIEW.leaderboard[0], position: String(i + 1), golfer: { ...GOLF_MATCH_PREVIEW.leaderboard[0].golfer, name: "Player " + (i + 1) }, holes: [4], total: String(i) }));
  const match = { ...GOLF_MATCH_PREVIEW, leaderboard: [...leaderboard].reverse() };
  const outside = bigBoardScore(match, true, true, "Player 8");
  assert.equal(outside?.kind, "both");
  if (outside?.kind === "both") assert.deepEqual(outside.top.map(p => p.position), ["1", "2", "3", "8"]);
  const inside = bigBoardScore(match, true, true, "Player 2");
  if (inside?.kind === "both") assert.deepEqual(inside.top.map(p => p.position), ["1", "2", "3", "4"]);
  const unknown = bigBoardScore(match, true, true, "Unknown");
  if (unknown?.kind === "both") assert.deepEqual(unknown.top.map(p => p.position), ["1", "2", "3", "4"]);
});
