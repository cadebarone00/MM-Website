import assert from "node:assert/strict";
import test from "node:test";
import { addPastRound, addPastTrip, pastChampion, pastLeaderboard, removePastPlayer, setPastScore, sortPastTrips, type PastTrip } from "./golfTripHistory";

const trip = (extra: Partial<PastTrip> = {}): PastTrip => ({
  id: "t1", arrival: "2025-04-10", departure: "2025-04-13", name: "Scottsdale", place: "Scottsdale, AZ", players: ["Ann", "Ben", "Cal"], championOverride: null,
  rounds: [
    { id: "r1", number: 1, date: null, course: { ref: null, name: "Desert Pines", place: "", par: 72 }, scores: { Ann: 80, Ben: 75, Cal: 90 } },
    { id: "r2", number: 2, date: null, course: { ref: null, name: "Saguaro", place: "", par: 70 }, scores: { Ann: 78, Ben: 85, Cal: 88 } },
  ],
  ...extra,
});

test("leaderboard: lowest total first, to-par from each round's par, T for ties", () => {
  const rows = pastLeaderboard(trip({ rounds: trip().rounds.map((r) => r.id === "r2" ? { ...r, scores: { ...r.scores, Ann: 80 } } : r) }));
  assert.deepEqual(rows.map((r) => [r.place, r.player, r.total, r.toPar]), [["T1", "Ann", 160, 18], ["T1", "Ben", 160, 18], ["3", "Cal", 178, 36]]);
});

test("leaderboard: players missing a round rank after complete players and get no place", () => {
  const t = trip({ rounds: trip().rounds.map((r) => r.id === "r2" ? { ...r, scores: { Ann: 78, Ben: 85 } } : r) });
  const rows = pastLeaderboard(t);
  assert.deepEqual(rows.map((r) => [r.place, r.player, r.roundsPlayed]), [["1", "Ann", 2], ["2", "Ben", 2], ["—", "Cal", 1]]);
});

test("leaderboard: unknown par gives no to-par; no scores at all gives an empty board", () => {
  const rows = pastLeaderboard(trip({ rounds: trip().rounds.map((r) => ({ ...r, course: { ...r.course, par: null } })) }));
  assert.equal(rows[0].toPar, null);
  assert.deepEqual(pastLeaderboard(trip({ rounds: [] })), []);
});

test("champion: the outright leader, the organizer's pick, or nobody while tied", () => {
  assert.equal(pastChampion(trip()), "Ann");
  assert.equal(pastChampion(trip({ championOverride: "Cal" })), "Cal");
  const tied = trip({ rounds: trip().rounds.map((r) => r.id === "r2" ? { ...r, scores: { ...r.scores, Ann: 80 } } : r) });
  assert.equal(pastChampion(tied), null);
  assert.equal(pastChampion(trip({ rounds: [] })), null);
  // An override for someone no longer on the trip is ignored.
  assert.equal(pastChampion(trip({ championOverride: "Zed" })), "Ann");
});

test("editing: add trip / round, set and clear a score, remove a player with their scores", () => {
  const trips = addPastTrip([], { arrival: "2024-05-01", departure: "2024-05-04", name: " Bandon ", place: "Bandon, OR", players: ["Ann", " ", "Ann", "Ben"] });
  assert.equal(trips[0].name, "Bandon");
  assert.deepEqual(trips[0].players, ["Ann", "Ben"]);
  let t = addPastRound(trips[0], { ref: "og-1", name: "Pacific Dunes", place: "Bandon, OR", par: 71 });
  assert.equal(t.rounds[0].number, 1);
  assert.equal(t.rounds[0].course.ref, "og-1");
  t = setPastScore(t, t.rounds[0].id, "Ann", 79);
  assert.equal(t.rounds[0].scores.Ann, 79);
  t = setPastScore(t, t.rounds[0].id, "Ann", null);
  assert.equal("Ann" in t.rounds[0].scores, false);
  t = setPastScore(setPastScore(t, t.rounds[0].id, "Ben", 82), t.rounds[0].id, "Ben", 500);
  assert.equal(t.rounds[0].scores.Ben, 82, "out-of-range scores are ignored");
  t = removePastPlayer({ ...t, championOverride: "Ben" }, "Ben");
  assert.deepEqual(t.players, ["Ann"]);
  assert.equal("Ben" in t.rounds[0].scores, false);
  assert.equal(t.championOverride, null);
});

test("addPastTrip refuses a missing name, missing / future dates, or departure before arrival", () => {
  const ok = { arrival: "2024-05-01", departure: "2024-05-04", name: "Bandon", place: "", players: [] };
  assert.throws(() => addPastTrip([], { ...ok, name: "  " }), /name/);
  assert.throws(() => addPastTrip([], { ...ok, departure: "" }), /arrival and departure/);
  assert.throws(() => addPastTrip([], { ...ok, arrival: "2026-12-01", departure: "2026-12-03" }, "2026-10-06"), /past/);
  assert.throws(() => addPastTrip([], { ...ok, departure: "2024-04-30" }), /before arrival/);
  assert.equal(addPastTrip([], { ...ok, departure: ok.arrival })[0].departure, "2024-05-01", "a one-day trip is fine");
});

test("trips sort newest arrival first", () => {
  const sorted = sortPastTrips([trip(), trip({ id: "t2", arrival: "2026-03-01", departure: "2026-03-04" })]);
  assert.deepEqual(sorted.map((t) => t.id), ["t2", "t1"]);
});
