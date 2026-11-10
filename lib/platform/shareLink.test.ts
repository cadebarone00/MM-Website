import { test } from "node:test";
import assert from "node:assert/strict";
import { shareLink } from "./shareLink.ts";

const input = { title: "Bandon 2027", text: "Join Bandon 2027 on The Maroon", url: "https://maroon.app/golf-trips/join/abc" };
const fail = () => { throw new Error("should not be called"); };

test("native share sheet first when on the phone app", async () => {
  let got: unknown = null;
  assert.equal(await shareLink(input, { native: async (i) => { got = i; }, webShare: fail, copy: fail }), "shared");
  assert.deepEqual(got, input);
});

test("web share when there is no native sheet", async () => {
  assert.equal(await shareLink(input, { native: null, webShare: async () => {}, copy: fail }), "shared");
});

test("a cancelled share is just cancelled — no copy fallback", async () => {
  const abort = Object.assign(new Error("Share canceled"), { name: "AbortError" });
  assert.equal(await shareLink(input, { native: null, webShare: async () => { throw abort; }, copy: fail }), "cancelled");
  assert.equal(await shareLink(input, { native: async () => { throw new Error("Share canceled"); }, webShare: fail, copy: fail }), "cancelled");
});

test("no share sheet at all → copies the link", async () => {
  let copied = "";
  assert.equal(await shareLink(input, { native: null, webShare: null, copy: async (t) => { copied = t; } }), "copied");
  assert.equal(copied, input.url);
});

test("a broken share sheet falls back to copy; copy failing too is failed", async () => {
  assert.equal(await shareLink(input, { native: null, webShare: async () => { throw new Error("NotAllowedError"); }, copy: async () => {} }), "copied");
  assert.equal(await shareLink(input, { native: null, webShare: null, copy: async () => { throw new Error("blocked"); } }), "failed");
  assert.equal(await shareLink(input, { native: null, webShare: null, copy: null }), "failed");
});
