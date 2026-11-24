/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl, parseJsonReply } from "./jsonReply.ts";
import { NETWORK_ERROR } from "./apiReply.ts";

test("an ok reply passes its fields through", () => {
  assert.deepEqual(parseJsonReply(200, JSON.stringify({ ok: true, id: "r1" })), { ok: true, body: { ok: true, id: "r1" } });
});

test("a code maps to the screen's own message, then the server's message, then a fallback", () => {
  assert.deepEqual(parseJsonReply(503, JSON.stringify({ ok: false, code: "not_installed" }), { not_installed: "Needs the database update." }),
    { ok: false, error: "Needs the database update.", code: "not_installed" });
  assert.deepEqual(parseJsonReply(400, JSON.stringify({ ok: false, message: "Round is full." })), { ok: false, error: "Round is full.", code: null });
  assert.deepEqual(parseJsonReply(401, JSON.stringify({ ok: false, code: "signed_out" })), { ok: false, error: "You're signed out. Sign in again.", code: "signed_out" });
  assert.deepEqual(parseJsonReply(500, JSON.stringify({ ok: false })), { ok: false, error: NETWORK_ERROR, code: null });
});

test("not JSON, or ok with an error status, is an error", () => {
  assert.deepEqual(parseJsonReply(200, "<html>"), { ok: false, error: NETWORK_ERROR, code: null });
  assert.equal(parseJsonReply(500, JSON.stringify({ ok: true })).ok, false);
});

test("website paths become full links; full links pass through", () => {
  assert.equal(absoluteUrl("https://www.themaroon.site/", "/schedule/a.webp"), "https://www.themaroon.site/schedule/a.webp");
  assert.equal(absoluteUrl("https://www.themaroon.site", "b.png"), "https://www.themaroon.site/b.png");
  assert.equal(absoluteUrl("https://www.themaroon.site", "https://cdn.x/c.jpg"), "https://cdn.x/c.jpg");
});

test("a route that says why in its error field (Golf Trips) shows that text", () => {
  assert.deepEqual(parseJsonReply(409, JSON.stringify({ ok: false, error: "Someone else already accepted this invitation." })),
    { ok: false, error: "Someone else already accepted this invitation.", code: null });
});
