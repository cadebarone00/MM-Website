import test from "node:test";
import assert from "node:assert/strict";
import { activationIsFresh, markerMatches } from "./activationMarker";

const at = "2026-10-29T15:00:00.123456+00:00";
const t = Date.parse(at);

test("fresh: within 10 minutes of activation (small clock skew allowed)", () => {
  assert.equal(activationIsFresh(at, t), true);
  assert.equal(activationIsFresh(at, t + 9 * 60_000), true);
  assert.equal(activationIsFresh(at, t + 10 * 60_000 + 1), false);
  assert.equal(activationIsFresh(at, t - 2_000), true);
  assert.equal(activationIsFresh(at, t - 60_000), false);
  assert.equal(activationIsFresh(null, t), false);
  assert.equal(activationIsFresh("not a date", t), false);
});

test("marker must equal the account's own activation time, and be fresh", () => {
  assert.equal(markerMatches(at, at, t + 1000), true);
  assert.equal(markerMatches(undefined, at, t), false); // returning Active user: no marker
  assert.equal(markerMatches("", at, t), false);
  assert.equal(markerMatches("2026-10-29T15:00:00.123457+00:00", at, t), false); // another activation's value
  assert.equal(markerMatches(at, null, t), false); // not activated
  assert.equal(markerMatches(at, at, t + 11 * 60_000), false); // expired
});
