/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseApiReply, NETWORK_ERROR } from "./apiReply.ts";

test("a 200 with ok:true gives the data", () => {
  assert.deepEqual(parseApiReply(200, JSON.stringify({ ok: true, data: { a: 1 } })), { ok: true, data: { a: 1 } });
});

test("a server error passes its plain message through", () => {
  assert.deepEqual(parseApiReply(503, JSON.stringify({ ok: false, error: "Couldn't load your profile. Try again." })),
    { ok: false, error: "Couldn't load your profile. Try again." });
});

test("a page that isn't JSON (e.g. a login wall) is a network error", () => {
  assert.deepEqual(parseApiReply(200, "<html>Sign in</html>"), { ok: false, error: NETWORK_ERROR });
});

test("ok:true without data, or a 500 with ok:true, is not trusted", () => {
  assert.deepEqual(parseApiReply(200, JSON.stringify({ ok: true })), { ok: false, error: NETWORK_ERROR });
  assert.deepEqual(parseApiReply(500, JSON.stringify({ ok: true, data: 1 })), { ok: false, error: NETWORK_ERROR });
});

test("an error reply with no message gets the plain fallback", () => {
  assert.deepEqual(parseApiReply(401, JSON.stringify({ ok: false })), { ok: false, error: NETWORK_ERROR });
});
