import assert from "node:assert/strict";
import test from "node:test";
import { lastName, rankLeaderboard } from "./golfLeaderboardOrder";
import type { GolfLeaderboardEntry } from "./golfTripPreviewFixture";

const row = (name: string, total: string, extra: Partial<GolfLeaderboardEntry> = {}): GolfLeaderboardEntry => ({
  position: "?", total, thru: "F", today: total, netTotal: extra.netTotal ?? total, netToday: total, holes: [],
  golfer: { name, hcp: 0, thru: "F", score: total, teeTime: "", course: "" }, ...extra,
});
const order = (rows: GolfLeaderboardEntry[]) => rows.map((r) => `${r.position} ${r.golfer.name}`);

test("best score first, worst last, with T for ties (and ties A–Z by last name)", () => {
  const ranked = rankLeaderboard([row("Cam Latto", "+4"), row("Nate Wojciechowski", "-2"), row("Drew Weisser", "E"), row("Collin Ross", "-2"), row("Hugo Moebel", "+12")]);
  assert.deepEqual(order(ranked), ["T1 Collin Ross", "T1 Nate Wojciechowski", "3 Drew Weisser", "4 Cam Latto", "5 Hugo Moebel"]);
});

test("pre-tournament (nobody has a score): alphabetical by last name, no places", () => {
  const ranked = rankLeaderboard([row("Nate Wojciechowski", "—"), row("Cam Latto", "—"), row("Pete Peabody", "—"), row("Cade Barone", "—")]);
  assert.deepEqual(order(ranked), ["— Cade Barone", "— Cam Latto", "— Pete Peabody", "— Nate Wojciechowski"]);
});

test("players without a score yet go to the bottom (A–Z), never counted as even par", () => {
  const ranked = rankLeaderboard([row("Zed Adams", "—"), row("Amy Young", "+1"), row("Bo Brown", "")]);
  assert.deepEqual(order(ranked), ["1 Amy Young", "— Zed Adams", "— Bo Brown"]);
});

test("net uses the net totals; Stableford ranks the most points first", () => {
  const net = rankLeaderboard([row("A Low", "-3", { netTotal: "+1" }), row("B High", "+5", { netTotal: "-4" })], { net: true });
  assert.deepEqual(order(net), ["1 B High", "2 A Low"]);
  const points = rankLeaderboard([row("A One", "", { pointsTotal: 30 }), row("B Two", "", { pointsTotal: 36 }), row("C Three", "", { pointsTotal: 30 })], { stableford: true });
  assert.deepEqual(order(points), ["1 B Two", "T2 A One", "T2 C Three"]);
});

test("last names: last word of the first golfer, numbers sort naturally", () => {
  assert.equal(lastName("Nate Wojciechowski"), "Wojciechowski");
  assert.equal(lastName("A. Organizer"), "Organizer");
  assert.equal(lastName("Cam Latto & Drew Weisser"), "Latto");
  const guests = rankLeaderboard([row("Guest Golfer 10", "—"), row("Guest Golfer 2", "—")]);
  assert.deepEqual(order(guests), ["— Guest Golfer 2", "— Guest Golfer 10"]);
});

test("no competition: ranked by the day's score, not the trip total", () => {
  const day = (name: string, total: string, today: string) => ({ ...row(name, total), today });
  const ranked = rankLeaderboard([day("Cam Latto", "-6", "+4"), day("Drew Weisser", "+9", "-1"), day("Hugo Moebel", "E", "E")], { today: true });
  assert.deepEqual(ranked.map(({ golfer, position }) => `${position} ${golfer.name}`), ["1 Drew Weisser", "2 Hugo Moebel", "3 Cam Latto"]);
});
