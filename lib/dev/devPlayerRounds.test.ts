import assert from "node:assert/strict";
import test from "node:test";
import { GOLF_MATCH_PREVIEW_SINGLES } from "@/lib/platform/golfTripPreviewFixture";
import { DEV_TRIP_ID, devRoundsReducer, devTripRound, parseDevRounds, seedDevRounds, visibilityOf } from "./devPlayerRounds";

const match = GOLF_MATCH_PREVIEW_SINGLES;
const card = { strokes: match.par.map((p) => p + 1), putts: match.par.map(() => 2), fairways: match.par.map(() => "center" as const), greens: match.par.map(() => "center" as const) };

test("submitting a trip round saves one round for that account; submitting again changes nothing", () => {
  const round = devTripRound(match, "dev-cade", card);
  assert.equal(round.tripId, DEV_TRIP_ID);
  assert.equal(round.total, match.par.reduce((a, b) => a + b, 0) + 18);
  const once = devRoundsReducer(seedDevRounds(), { type: "saveRound", round });
  const twice = devRoundsReducer(once, { type: "saveRound", round: { ...round, total: 60 } });
  assert.equal(twice.rounds.filter((r) => r.id === round.id).length, 1);
  assert.equal(twice.rounds.find((r) => r.id === round.id)?.total, round.total, "locked after submit");
});

test("privacy defaults to private and can be switched", () => {
  const seed = seedDevRounds();
  assert.equal(visibilityOf(seed, "dev-cade"), "private");
  assert.equal(visibilityOf(devRoundsReducer(seed, { type: "setVisibility", profileId: "dev-cade", visibility: "public" }), "dev-cade"), "public");
});

test("seed gives Cade 2 counting rounds and Jake 3, so one trip round gives Cade an index", () => {
  const seed = seedDevRounds();
  assert.equal(seed.rounds.filter((r) => r.profileId === "dev-cade" && r.countsForHandicap).length, 2);
  assert.equal(seed.rounds.filter((r) => r.profileId === "dev-jake" && r.countsForHandicap).length, 3);
});

test("empty, corrupt or wrong-shaped saved data falls back to the seed", () => {
  assert.deepEqual(parseDevRounds(null), seedDevRounds());
  assert.deepEqual(parseDevRounds("{not json"), seedDevRounds());
  assert.deepEqual(parseDevRounds(JSON.stringify({ rounds: "x" })), seedDevRounds());
  const saved = devRoundsReducer(seedDevRounds(), { type: "setVisibility", profileId: "dev-jake", visibility: "public" });
  assert.deepEqual(parseDevRounds(JSON.stringify(saved)), saved);
});

test("saved data with malformed entries falls back to the seed instead of crashing later", () => {
  assert.deepEqual(parseDevRounds(JSON.stringify({ rounds: [null, { id: "x" }], linkRequests: [{}], visibility: [] })), seedDevRounds());
  const good = seedDevRounds();
  assert.deepEqual(parseDevRounds(JSON.stringify({ ...good, linkRequests: [{ id: "l1" }] })), seedDevRounds());
  assert.deepEqual(parseDevRounds(JSON.stringify({ ...good, visibility: { "dev-cade": "everyone" } })), seedDevRounds());
});
