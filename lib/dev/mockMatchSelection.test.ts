import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_MATCH_PRESET_IDS, MOCK_MATCH_PRESETS, jumpMockClock, mockMatchAct, mockMatchChecks, mockMatchInstruction, mockMatchNext, mockMatchRead, mockMatchWrongMove, newMockMatch, type MatchSelStore, type MockMatchPresetId } from "./mockMatchSelection.ts";

/** What the panel's "Run to the end" does: wrong moves along the way, the right person every step, the clock on timeouts. */
function runToEnd(id: MockMatchPresetId): MatchSelStore {
  let store = newMockMatch(id);
  const preset = MOCK_MATCH_PRESETS.find(item => item.id === id)!;
  const wrong = () => { const move = mockMatchWrongMove(store); store = mockMatchAct(store, "1-0", move.viewer, move.input, { probe: true }).store; };
  wrong();
  for (let step = 0; step < 80; step++) {
    const next = mockMatchNext(store);
    if (!next) break;
    const result = mockMatchAct(store, "1-0", next.viewer, next.input, { random: () => 0.42 });
    store = result.store;
    if (result.error) break; // e.g. teams too small: refused, as expected
    if (step === 1 || step === 2 || step === 5) wrong();
    if ("timeout" in preset && preset.timeout && step === 1) store = jumpMockClock(store);
  }
  if ("timeout" in preset && preset.timeout) for (let i = 0; i < 10 && !Object.values(store.rounds)[0].state?.completedAt; i++) store = jumpMockClock(store);
  return store;
}

test("every Mock match selection setup runs and every check passes", () => {
  for (const id of MOCK_MATCH_PRESET_IDS) {
    const end = runToEnd(id);
    assert.deepEqual(mockMatchChecks(end, id).filter(check => check.state !== "pass").map(check => check.label), [], id);
  }
});

test("each controller sees what they should; instructions follow the run", () => {
  let store = newMockMatch("ranks-singles");
  assert.match(mockMatchInstruction(store, "ranks-singles", "captain-0"), /until the organizer starts/);
  store = mockMatchAct(store, "1-0", "organizer", { action: "start" }).store;
  store = mockMatchAct(store, "1-0", "captain-0", { action: "place", match: 0, team: 0, slot: 0, player: store.rosters[0][1] }).store;
  const asB = mockMatchRead(store, "1-0", "captain-1");
  assert.ok(asB.ok && asB.body.spots.every(spot => spot.hidden), "Team B can't see Team A's ranks");
  const asA = mockMatchRead(store, "1-0", "captain-0");
  assert.ok(asA.ok && asA.body.spots[0].profileId === store.rosters[0][1]);
  assert.match(mockMatchInstruction(store, "ranks-singles", "captain-0"), /Lock in ranks/);
});
