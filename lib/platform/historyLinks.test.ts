import assert from "node:assert/strict";
import test from "node:test";
import type { PastTrip } from "./golfTripHistory";
import { answerHistoryLink, historyLinkInput, linkStatus, requestHistoryLink } from "./historyLinks";

const trip: PastTrip = {
  id: "h1", arrival: "2026-04-16", departure: "2026-04-19", name: "Desert Classic", place: "Scottsdale, AZ", players: ["J. Parker", "M. Chen"], championOverride: null,
  rounds: [
    { id: "r1", number: 1, date: "2026-04-17", course: { ref: null, name: "Desert Pines GC", place: "", par: 72 }, scores: { "J. Parker": 84, "M. Chen": 90 } },
    { id: "r2", number: 2, date: null, course: { ref: "og-9", name: "Saguaro Links", place: "", par: 71 }, scores: { "M. Chen": 88 } },
  ],
};

test("a request snapshots only that player's scored rounds", () => {
  const input = historyLinkInput(trip, "J. Parker", "dev-jake");
  assert.equal(input.rounds.length, 1);
  assert.deepEqual(input.rounds[0], { roundId: "r1", datePlayed: "2026-04-17", course: { ref: null, name: "Desert Pines GC", place: "" }, total: 84 });
  assert.throws(() => requestHistoryLink([], { ...input, rounds: [] }), /no scores/);
});

test("request → pending; a second request for the same name is refused until declined", () => {
  const requests = requestHistoryLink([], historyLinkInput(trip, "J. Parker", "dev-jake"));
  assert.equal(requests[0].status, "pending");
  assert.equal(linkStatus(requests, "h1", "J. Parker")?.profileId, "dev-jake");
  assert.throws(() => requestHistoryLink(requests, historyLinkInput(trip, "J. Parker", "dev-mike")), /waiting/);
  const declined = answerHistoryLink(requests, [], requests[0].id, false);
  assert.equal(declined.requests[0].status, "declined");
  assert.equal(declined.rounds.length, 0);
  assert.equal(linkStatus(declined.requests, "h1", "J. Parker"), null);
  assert.equal(requestHistoryLink(declined.requests, historyLinkInput(trip, "J. Parker", "dev-mike")).length, 2, "can ask again after a decline");
});

test("accept adds organizer-entered rounds that don't count; answering again changes nothing", () => {
  const requests = requestHistoryLink([], historyLinkInput(trip, "M. Chen", "dev-mike"));
  const accepted = answerHistoryLink(requests, [], requests[0].id, true);
  assert.equal(accepted.requests[0].status, "accepted");
  assert.deepEqual(accepted.rounds.map((r) => [r.source, r.enteredBy, r.total, r.countsForHandicap, r.datePlayed]),
    [["history", "organizer", 90, false, "2026-04-17"], ["history", "organizer", 88, false, "2026-04-16"]]);
  const again = answerHistoryLink(accepted.requests, accepted.rounds, requests[0].id, true);
  assert.equal(again.rounds.length, 2);
  assert.throws(() => requestHistoryLink(accepted.requests, historyLinkInput(trip, "M. Chen", "dev-cade")), /already linked/);
});
