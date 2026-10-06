import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLF_MATCH_PREVIEW_SINGLES as match } from "@/lib/platform/golfTripPreviewFixture";
import { liveCardFromSheet } from "@/lib/platform/liveCards";
import { devRoundMeta, devRoundsReducer, devTripRound, parseDevRounds, seedDevRounds, type DevLiveCard } from "./devPlayerRounds";

const par = match.par;
const live = (attestDiff = false): DevLiveCard => ({ ...liveCardFromSheet("g1", "dev-jake", {
  strokes: par.map((p) => p), putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center")), greens: par.map(() => "center"),
  penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par.map((p, i) => (attestDiff && i === 4 ? p + 1 : p)),
}), meta: devRoundMeta(match) });
const card = { strokes: par, putts: par.map(() => 2), fairways: par.map(() => null), greens: par.map(() => null) };

test("saving the identical live card twice returns the same state (no render loop)", () => {
  const once = devRoundsReducer(seedDevRounds(), { type: "saveLiveCard", card: live() });
  assert.equal(devRoundsReducer(once, { type: "saveLiveCard", card: live() }), once);
  assert.equal(once.liveCards.length, 1);
});

test("submitting a round clears that player's live card", () => {
  const withLive = devRoundsReducer(seedDevRounds(), { type: "saveLiveCard", card: live() });
  const saved = devRoundsReducer(withLive, { type: "saveRound", round: devTripRound(match, "dev-jake", card, { groupId: "g1" }) });
  assert.equal(saved.liveCards.length, 0);
});

test("push-through needs the organizer setting, saves one round with the log, and never twice", () => {
  const stuck = devRoundsReducer(seedDevRounds(), { type: "saveLiveCard", card: live(true) });
  const action = { type: "pushThrough" as const, groupId: "g1", profileId: "dev-jake", choices: { 5: "attester" as const }, byProfileId: "dev-cade", at: "t", reason: "Agreed" };
  assert.throws(() => devRoundsReducer(stuck, action), /push-through is off/);
  const allowed = devRoundsReducer(stuck, { type: "setAllowPushThrough", on: true });
  const pushed = devRoundsReducer(allowed, action);
  const round = pushed.rounds.find((r) => r.profileId === "dev-jake" && r.source === "trip")!;
  assert.equal(round.holes[4].strokes, par[4] + 1);
  assert.equal(round.edits?.[0].kind, "pushThrough");
  assert.equal(round.groupId, "g1");
  assert.equal(pushed.liveCards.length, 0);
  assert.throws(() => devRoundsReducer(pushed, action), /No card to push through/);
});

test("override goes through the pure rule; removing is owner-only and keeps the round for the trip", () => {
  const saved = devRoundsReducer(seedDevRounds(), { type: "saveRound", round: devTripRound(match, "dev-jake", card) });
  const id = saved.rounds.at(-1)!.id;
  const edited = devRoundsReducer(saved, { type: "overrideHole", roundId: id, input: { hole: 1, field: "strokes", to: par[0] + 2, byProfileId: "dev-cade", at: "t", reason: "OB" } });
  assert.equal(edited.rounds.find((r) => r.id === id)!.edits?.length, 1);
  assert.throws(() => devRoundsReducer(edited, { type: "removeFromProfile", roundId: id, profileId: "dev-cade" }), /Only the player/);
  const removed = devRoundsReducer(edited, { type: "removeFromProfile", roundId: id, profileId: "dev-jake" });
  assert.equal(removed.rounds.find((r) => r.id === id)!.removedFromProfile, true);
});

test("Start / End round and attester swaps are stored", () => {
  const started = devRoundsReducer(seedDevRounds(), { type: "setTripRound", tripRoundId: "round-1", state: "open", at: "t1" });
  assert.deepEqual(started.tripRounds["round-1"], { state: "open", openedAt: "t1" });
  const ended = devRoundsReducer(started, { type: "setTripRound", tripRoundId: "round-1", state: "closed", at: "t2" });
  assert.deepEqual(ended.tripRounds["round-1"], { state: "closed", openedAt: "t1", closedAt: "t2" });
  const swapped = devRoundsReducer(ended, { type: "swapAttester", groupId: "g1", profileId: "a", attesterProfileId: "b" });
  assert.equal(swapped.attesters["g1|a"], "b");
});

test("a tab saved before this add-on keeps its rounds and gets empty new parts", () => {
  const old = { rounds: seedDevRounds().rounds, visibility: {}, linkRequests: [] };
  const parsed = parseDevRounds(JSON.stringify(old));
  assert.equal(parsed.rounds.length, old.rounds.length);
  assert.deepEqual([parsed.liveCards, parsed.groups, parsed.tripRounds, parsed.allowPushThrough, parsed.attesters], [[], [], {}, false, {}]);
});
