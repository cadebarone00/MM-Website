import assert from "node:assert/strict";
import test from "node:test";
import { holesDone, pairingStatus, parColor, parLabel, roundDay, sideScore, teeMinutes, teeSheet } from "./golfTab";

test("to-par labels and colors", () => {
  assert.equal(parLabel("3"), "+3");
  assert.equal(parLabel("0"), "E");
  assert.equal(parLabel("E"), "E");
  assert.equal(parLabel("-2"), "-2");
  assert.equal(parLabel("—"), "—");
  assert.equal(parLabel(""), "");
  assert.deepEqual(["E", "-1", "+2", "—"].map(parColor), ["even", "under", "over", undefined]);
});

test("tee times sort earliest first, unknown last; tee sheet groups players and leaves out those sitting out", () => {
  assert.ok(teeMinutes("7:40 AM") < teeMinutes("12:10 PM"));
  assert.equal(teeMinutes("12:00 AM"), 0);
  assert.equal(teeMinutes("Tee time TBD"), Number.MAX_SAFE_INTEGER);
  const golfer = (name: string, teeTime: string) => ({ golfer: { name, hcp: 5, thru: "", score: "", teeTime, course: "" } });
  const match = { leaderboard: [golfer("A", "8:10 AM"), golfer("B", ""), golfer("C", "7:50 AM"), golfer("D", "8:10 AM")] } as never;
  assert.deepEqual(teeSheet(match).map(([time, players]) => [time, players.map((p) => p.name)]), [["7:50 AM", ["C"]], ["8:10 AM", ["A", "D"]], ["Tee time TBD", ["B"]]]);
  assert.deepEqual(teeSheet(match, new Set(["A"])).find(([time]) => time === "8:10 AM")?.[1].map((p) => p.name), ["D"]);
});

test("round day label", () => {
  assert.equal(roundDay("2026-04-22"), "Wed, Apr 22");
});

test("match status: tee time before play, THRU the hole both sides have finished, clinched final, and side scores", () => {
  assert.equal(holesDone("F"), 18);
  assert.equal(holesDone("Thru 7"), 7);
  assert.equal(holesDone(""), 0);
  const side = (thru: string) => ({ golfers: [{ name: "x", hcp: 0, thru, score: "", teeTime: "8:00 AM", course: "" }] });
  assert.deepEqual(pairingStatus(side(""), side(""), null, undefined, false), { kind: "tee", time: "8:00 AM" });
  const thru = pairingStatus(side("Thru 9"), side("Thru 8"), { leader: "left", up: 2 }, undefined, false);
  assert.deepEqual(thru, { kind: "thru", holes: 8 });
  assert.equal(sideScore(thru, { leader: "left", up: 2 }, "left"), "2 UP");
  assert.equal(sideScore(thru, { leader: "left", up: 2 }, "right"), "");
  assert.equal(sideScore(thru, { leader: null, up: 0 }, "right"), "AS");
  const clinched = pairingStatus(side("Thru 15"), side("Thru 15"), { leader: "right", up: 4 }, undefined, true);
  assert.deepEqual(clinched, { kind: "final", text: "4&3" });
  assert.equal(sideScore(clinched, { leader: "right", up: 4 }, "right"), "4&3");
});

test("points by player: finished match = 1 to each winner, ½ each when halved, unfinished = 0; best first", async () => {
  const { playerPoints } = await import("./golfTab");
  const g = (name: string) => ({ name, hcp: 0, thru: "F", score: "", teeTime: "", course: "" });
  const match = { scoring: "Gross", matches: [
    { left: { golfers: [g("Al"), g("Bo")] }, right: { golfers: [g("Cy"), g("Di")] }, gross: { leader: "left", up: 2 }, net: null, result: "2 UP" },
    { left: { golfers: [g("Al")] }, right: { golfers: [g("Cy")] }, gross: { leader: null, up: 0 }, net: null, result: "AS" },
  ] } as never;
  assert.deepEqual(playerPoints(match).map((r) => [r.name, r.points]), [["Al", 1.5], ["Bo", 1], ["Cy", 0.5], ["Di", 0]]);
});
