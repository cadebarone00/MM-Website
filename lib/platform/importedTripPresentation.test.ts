import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teamPoints } from "./teamPoints.ts";
import { rankLeaderboard } from "./golfLeaderboardOrder.ts";
import { importedTripView } from "./importedTripPresentation.ts";
import { pastTripTemplate, readPastTripWorkbook, type PastTripKind } from "./pastTripImport.ts";

const trip = (kind: PastTripKind) => {
  const read = readPastTripWorkbook(new Uint8Array(readFileSync(`public${pastTripTemplate(kind)}`)), `${kind}.xlsx`, "2026-11-06");
  assert.ok(read.ok && read.trip);
  return read.trip;
};

test("imported team trip: the trip page's own team-points rule gives Pines 5-3 from the imported matches", () => {
  const view = importedTripView(trip("team"));
  assert.deepEqual(teamPoints(view.previewMatch), { points: [5, 3], available: 8 });
  assert.deepEqual(view.previewMatch.sides.map((s) => [s.name, s.winPct]), [["Pines", 100], ["Palms", 0]]);
  assert.deepEqual(view.competitionType, { individual: null, team: "2 Teams" });
  assert.equal(view.headline.team, "Pines won 5–3");
  assert.equal(view.previewMatch.matches.filter((m) => m.round === 3).length, 4);
  assert.equal(view.roundFormats.round2Format, "Alternate Shot");
});

test("imported team + individual trip: leaderboard totals to par through each round, shared-ball rounds show the last own-ball standings", () => {
  const view = importedTripView(trip("both"));
  const final = rankLeaderboard(view.previewMatch.leaderboard, { net: true });
  // Alex: 80 + 82 gross on two par-72 rounds = +18; net 150 - 144 = +6, the best net.
  assert.equal(final[0].golfer.name, "Alex Brooks");
  assert.deepEqual([final[0].total, final[0].netTotal, final[0].position], ["+18", "+6", "1"]);
  const alt = view.previewMatch.roundStandings!.find((r) => r.round === 2)!;
  assert.equal(alt.standingsRound, 1);
  assert.equal(view.headline.champion, "Alex Brooks");
  assert.equal(view.headline.team, "Pines won 5–3");
});

test("imported individual trip: hole-by-hole cards and Stableford points come through", () => {
  const view = importedTripView(trip("individual"));
  const r1 = view.previewMatch.roundStandings!.find((r) => r.round === 1)!.leaderboard.find((e) => e.golfer.name === "Alex Brooks")!;
  assert.equal(r1.holes.filter((h) => h !== null).length, 18);
  assert.equal(r1.today, "+12");
  const r2 = view.previewMatch.roundStandings!.find((r) => r.round === 2)!.leaderboard.find((e) => e.golfer.name === "Riley Foster")!;
  assert.deepEqual([r2.pointsToday, r2.pointsTotal], [36, 36]);
  assert.equal(view.headline.champion, "Riley Foster");
  assert.equal(view.headline.team, null);
});

test("imported stats: the Stats section uses the live trip's stats code on the imported cards", async () => {
  const { checkDraft, emptyDraft } = await import("./pastTripModel.ts");
  const d = emptyDraft();
  Object.assign(d, { kind: "individual", name: "Stats Trip", place: "Kohler, WI", startDate: "2025-06-06", endDate: "2025-06-06", method: "Lowest gross total" });
  d.players = [{ id: "a", name: "Ann", handicap: 5, team: null }, { id: "b", name: "Ben", handicap: 9, team: null }];
  const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  d.rounds = [{ number: 1, date: "2025-06-06", course: "Straits", format: "Stroke Play", par: 72, holePars: pars }];
  d.scores = [
    { round: 1, player: "a", total: null, holes: pars.map((p) => p + 1), putts: pars.map(() => 2), fairway: pars.map((p) => p === 3 ? null : "center"), green: pars.map(() => "right") },
    { round: 1, player: "b", total: 80, holes: null },  // a total-only round: on the leaderboard, not in hole stats
  ];
  const view = importedTripView(checkDraft(d, "2026-11-09").trip!);
  const stats = view.tripStats!;
  assert.equal(stats.players.length, 1);
  assert.deepEqual({ ...stats.players[0], profileId: undefined }, { profileId: undefined, name: "Ann", rounds: 1, scoringAvg: 90, puttsAvg: 36, fairwayPct: 100, greenPct: 0 });
  assert.equal(stats.rounds![0].holes.length, 18);
  // The round's scorecard shows the pars, and Ann's card carries her putts and shot details.
  const r1 = view.previewMatch.roundStandings!.find((r) => r.round === 1)!;
  assert.deepEqual(r1.par, pars);
  const ann = r1.leaderboard.find((e) => e.golfer.name === "Ann")!;
  assert.equal(ann.putts!.length, 18);
  assert.equal(ann.holeDetails![0].fairway, "center");
  assert.equal(importedTripView(trip("team")).tripStats, null); // no hole-by-hole cards: no stats yet
});
