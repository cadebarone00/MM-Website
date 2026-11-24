/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { createChunkedStorage, type KeyValueStore } from "./chunkedStorage.ts";

function memoryStore(): KeyValueStore & { keys: () => string[] } {
  const data = new Map<string, string>();
  return {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => { data.set(key, value); },
    deleteItemAsync: async (key) => { data.delete(key); },
    keys: () => [...data.keys()],
  };
}

test("a value bigger than one chunk round-trips", async () => {
  const store = memoryStore();
  const storage = createChunkedStorage(store, 2000);
  const value = "x".repeat(4000) + "y".repeat(1000);
  await storage.setItem("session", value);
  assert.equal(await storage.getItem("session"), value);
  assert.equal(store.keys().filter((k) => /^session\.\d+$/.test(k)).length, 3);
});

test("writing a shorter value removes the old extra chunks", async () => {
  const store = memoryStore();
  const storage = createChunkedStorage(store, 2000);
  await storage.setItem("session", "a".repeat(5000));
  await storage.setItem("session", "short");
  assert.equal(await storage.getItem("session"), "short");
  assert.deepEqual(store.keys().filter((k) => k.startsWith("session.")).sort(), ["session.0", "session.count"]);
});

test("removeItem clears every chunk", async () => {
  const store = memoryStore();
  const storage = createChunkedStorage(store, 2000);
  await storage.setItem("session", "b".repeat(5000));
  await storage.removeItem("session");
  assert.equal(await storage.getItem("session"), null);
  assert.deepEqual(store.keys(), []);
});

test("a key that was never saved reads as null", async () => {
  assert.equal(await createChunkedStorage(memoryStore()).getItem("nothing"), null);
});

test("a missing chunk reads as null instead of a broken value", async () => {
  const store = memoryStore();
  const storage = createChunkedStorage(store, 2000);
  await storage.setItem("session", "c".repeat(5000));
  await store.deleteItemAsync("session.1");
  assert.equal(await storage.getItem("session"), null);
});
