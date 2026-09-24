import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_DRAFT_PICKS,
  clearDraftPicks,
  draftStateKey,
  hasDraftInProgress,
  isDraftComplete,
  nextEmptySlot,
  readDraftPicks,
  seedDraftPicks,
  writeDraftPick,
} from "./draftState.ts";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
}

test("draftStateKey is namespaced per tournament", () => {
  assert.equal(draftStateKey("2027"), "fantasy-draft:2027");
});

test("readDraftPicks returns all-null when nothing is saved", () => {
  const storage = fakeStorage();
  assert.deepEqual(readDraftPicks(storage, "2027"), EMPTY_DRAFT_PICKS);
});

test("readDraftPicks ignores corrupt JSON", () => {
  const storage = fakeStorage({ "fantasy-draft:2027": "not json" });
  assert.deepEqual(readDraftPicks(storage, "2027"), EMPTY_DRAFT_PICKS);
});

test("hasDraftInProgress is false until something is saved", () => {
  const storage = fakeStorage();
  assert.equal(hasDraftInProgress(storage, "2027"), false);
  seedDraftPicks(storage, "2027", EMPTY_DRAFT_PICKS);
  assert.equal(hasDraftInProgress(storage, "2027"), true);
});

test("writeDraftPick sets one slot and keeps the others", () => {
  const storage = fakeStorage();
  writeDraftPick(storage, "2027", "maroon", "cade-barone");
  const after = writeDraftPick(storage, "2027", "white", "cam-latto");
  assert.deepEqual(after, { maroon: "cade-barone", white: "cam-latto", wildcard: null });
  assert.deepEqual(readDraftPicks(storage, "2027"), after);
});

test("seedDraftPicks overwrites whatever was there (Edit Lineup starting from the saved server picks)", () => {
  const storage = fakeStorage();
  writeDraftPick(storage, "2027", "maroon", "cade-barone");
  seedDraftPicks(storage, "2027", { maroon: "drew-weisser", white: "cam-latto", wildcard: "pete-peabody" });
  assert.deepEqual(readDraftPicks(storage, "2027"), { maroon: "drew-weisser", white: "cam-latto", wildcard: "pete-peabody" });
});

test("clearDraftPicks removes the key entirely", () => {
  const storage = fakeStorage();
  writeDraftPick(storage, "2027", "maroon", "cade-barone");
  clearDraftPicks(storage, "2027");
  assert.equal(storage.getItem(draftStateKey("2027")), null);
  assert.equal(hasDraftInProgress(storage, "2027"), false);
});

test("draft state for one tournament doesn't leak into another", () => {
  const storage = fakeStorage();
  writeDraftPick(storage, "2027", "maroon", "cade-barone");
  assert.deepEqual(readDraftPicks(storage, "2028"), EMPTY_DRAFT_PICKS);
});

test("isDraftComplete is true only once all three slots are filled", () => {
  assert.equal(isDraftComplete(EMPTY_DRAFT_PICKS), false);
  assert.equal(isDraftComplete({ maroon: "a", white: "b", wildcard: null }), false);
  assert.equal(isDraftComplete({ maroon: "a", white: "b", wildcard: "c" }), true);
});

test("nextEmptySlot walks maroon, then white, then wildcard, then null", () => {
  assert.equal(nextEmptySlot(EMPTY_DRAFT_PICKS), "maroon");
  assert.equal(nextEmptySlot({ maroon: "a", white: null, wildcard: null }), "white");
  assert.equal(nextEmptySlot({ maroon: "a", white: "b", wildcard: null }), "wildcard");
  assert.equal(nextEmptySlot({ maroon: "a", white: "b", wildcard: "c" }), null);
});
