/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { addRecent, readRecentList, removeRecent, RECENT_MAX } from "./recentList.ts";

const isItem = (value: unknown): value is { id: string } => typeof (value as { id?: unknown } | null)?.id === "string";

test("adding moves an item to the top without duplicates, capped at 8", () => {
  let list: { id: string }[] = [];
  for (let i = 0; i < 10; i++) list = addRecent(list, { id: `c${i}` });
  assert.equal(list.length, RECENT_MAX);
  assert.equal(list[0].id, "c9");
  list = addRecent(list, { id: "c5" });
  assert.equal(list[0].id, "c5");
  assert.equal(list.filter((entry) => entry.id === "c5").length, 1);
});

test("remove one, or clear all", () => {
  const list = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(removeRecent(list, "a"), [{ id: "b" }]);
  assert.deepEqual(removeRecent(list, null), []);
});

test("bad saved data reads as an empty list", () => {
  assert.deepEqual(readRecentList("not json", isItem), []);
  assert.deepEqual(readRecentList(null, isItem), []);
  assert.deepEqual(readRecentList(JSON.stringify([{ id: "a" }, { nope: 1 }]), isItem), [{ id: "a" }]);
});
