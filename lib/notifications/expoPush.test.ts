import { test } from "node:test";
import assert from "node:assert/strict";
import { batches, expoMessage, isExpoPushToken, isPushPlatform, ticketOutcomes } from "./expoPush.ts";

const TOKEN = "ExponentPushToken[abcdefghij1234567890]";

test("push tokens and platforms", () => {
  assert.equal(isExpoPushToken(TOKEN), true);
  assert.equal(isExpoPushToken("ExpoPushToken[xxxxxxxxxx_-]"), true);
  assert.equal(isExpoPushToken("ExponentPushToken[short]"), false);
  assert.equal(isExpoPushToken("hello"), false);
  assert.equal(isExpoPushToken(42), false);
  assert.equal(isPushPlatform("ios"), true);
  assert.equal(isPushPlatform("web"), false);
});

test("a message: clipped words, safe link, grouped by trip", () => {
  const m = expoMessage(TOKEN, { title: "x".repeat(200), body: "Tap to accept.", link: "/profile/friends", kind: "friendRequest", groupId: "trip-1" });
  assert.equal(m.to, TOKEN);
  assert.equal(m.title.length, 80);
  assert.ok(m.title.endsWith("…"));
  assert.deepEqual(m.data, { link: "/profile/friends", kind: "friendRequest" });
  assert.equal(m.threadId, "trip-1");
  assert.equal(expoMessage(TOKEN, { title: "t", body: "b", link: "https://evil.example", kind: "chat" }).data.link, "/");
  assert.equal("threadId" in expoMessage(TOKEN, { title: "t", body: "b", link: "/", kind: "chat" }), false);
});

test("batches of 100", () => {
  const items = Array.from({ length: 250 }, (_, i) => i);
  assert.deepEqual(batches(items).map((b) => b.length), [100, 100, 50]);
  assert.deepEqual(batches([]), []);
});

test("tickets: sent, forget a removed phone, anything else failed", () => {
  const messages = [{ to: "a" }, { to: "b" }, { to: "c" }];
  assert.deepEqual(ticketOutcomes(messages, { data: [{ status: "ok", id: "1" }, { status: "error", details: { error: "DeviceNotRegistered" } }, { status: "error", message: "x" }] }), [
    { token: "a", outcome: "sent" }, { token: "b", outcome: "forget" }, { token: "c", outcome: "failed" },
  ]);
  assert.deepEqual(ticketOutcomes([{ to: "a" }], null), [{ token: "a", outcome: "failed" }]);
});
