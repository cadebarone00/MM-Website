import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_DRAFT_PRESET_IDS, mockChecks, mockInstruction, mockPick, mockRead, mockStart, mockTurn, mockViewerId, newMockDraft, validMockViewer, type MockDraftStore } from "./mockDraft.ts";
import { draftBoardFor } from "../platform/teamDraftPicks.ts";

const available = (store: MockDraftStore) => draftBoardFor(store.members, store.captains, store.settings, store.draft.picks).available;

/** The full test run the panel's "Run to the end" does: wrong moves first, then the right person picks every time. */
function runToEnd(store: MockDraftStore): MockDraftStore {
  store = mockPick(store, "organizer", available(store)[0], 1, "probe").store;                 // too early
  const started = mockStart(store, "organizer");
  store = started.store;
  if (started.error) return mockStart(store, "organizer", "probe").store;
  store = mockPick(store, mockTurn(store).wrong!, available(store)[0], 1, "probe").store;       // wrong person
  for (let guard = 0; guard < 64 && mockTurn(store).onClock; guard++) {
    const before = store.draft.picks.length;
    store = mockPick(store, mockTurn(store).onClock!, available(store)[0], before + 1).store;
    if (before === 0) store = mockPick(store, mockTurn(store).onClock ?? "organizer", store.draft.picks[0].profileId, 2, "probe").store; // already drafted
  }
  return store;
}

test("every mock setup runs start → finish and every check passes", () => {
  for (const id of MOCK_DRAFT_PRESET_IDS) {
    const end = runToEnd(newMockDraft(id));
    const checks = mockChecks(end);
    assert.deepEqual(checks.filter(check => check.state !== "pass").map(check => check.label), [], id);
    if (!["no-captain", "2t-7", "pairs-7", "3ball-10", "4ball-10"].includes(id)) assert.ok(end.draft.completedAt && end.submittedTeams, `${id} finished and saved teams`);
  }
});

test("the wrong number of players can't start (every type); a missing captain blocks the start", () => {
  for (const id of ["2t-7", "pairs-7", "3ball-10", "4ball-10"] as const) {
    const refused = mockStart(newMockDraft(id), "organizer");
    assert.match(refused.error ?? "", /multiples of|even number/, id);
    assert.equal(refused.store.draft.startedAt, null);
  }
  assert.equal(available(runToEnd(newMockDraft("pairs-8"))).length, 0, "everyone ends up on a team");
  const noCaptain = newMockDraft("no-captain");
  assert.equal(mockStart(noCaptain, "organizer").error, "Every team needs a captain first (Settings → Players).");
});

test("the phone sees what the controller should: viewer identity, organizer / captain flags", () => {
  const store = newMockDraft("2t-8-snake");
  assert.equal(mockRead(store, "organizer").viewer.isOrganizer, true);
  assert.equal(mockRead(store, "captain-1").viewer.captainOf, 1);
  const player = mockRead(store, "player").viewer;
  assert.equal(player.isOrganizer || player.captainOf !== null, false);
  assert.notEqual(mockViewerId(store, "player"), store.organizer);
});

test("instructions follow the run; wrong moves are refused and logged", () => {
  let store = newMockDraft("2t-8-snake");
  assert.match(mockInstruction(store, "captain-0"), /Waiting for the organizer/);
  assert.match(mockInstruction(store, "organizer"), /Tap Start team draft/);
  store = mockStart(store, "organizer").store;
  assert.match(mockInstruction(store, "captain-0"), /You're on the clock \(Team A\)/);
  assert.match(mockInstruction(store, "player"), /shouldn't see any Draft buttons/);
  const refused = mockPick(store, "captain-1", available(store)[0], 1);
  assert.equal(refused.error, "It's not your pick.");
  assert.equal(refused.store.log.at(-1)!.ok, false);
  assert.equal(validMockViewer("captain-3"), true);
  assert.equal(validMockViewer("captain-x"), false);
});
