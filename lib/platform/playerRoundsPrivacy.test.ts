import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ROUNDS_VISIBILITY, profileAccess, roundsVisibilityFromBody } from "./playerRoundsPrivacy";

test("new accounts are private", () => assert.equal(DEFAULT_ROUNDS_VISIBILITY, "private"));

test("owner sees everything; public shows everything to any signed-in account", () => {
  assert.deepEqual(profileAccess({ viewerId: "a", ownerId: "a", visibility: "private", playTogether: false }), { rounds: true, handicapIndex: true });
  assert.deepEqual(profileAccess({ viewerId: "b", ownerId: "a", visibility: "public", playTogether: false }), { rounds: true, handicapIndex: true });
});

test("private: trip-mates see only the handicap index; strangers see nothing", () => {
  assert.deepEqual(profileAccess({ viewerId: "b", ownerId: "a", visibility: "private", playTogether: true }), { rounds: false, handicapIndex: true });
  assert.deepEqual(profileAccess({ viewerId: "c", ownerId: "a", visibility: "private", playTogether: false }), { rounds: false, handicapIndex: false });
});

test("the Privacy request only accepts public or private", () => {
  assert.equal(roundsVisibilityFromBody({ visibility: "public" }), "public");
  assert.equal(roundsVisibilityFromBody({ visibility: "private" }), "private");
  for (const body of [null, "public", {}, { visibility: "everyone" }, { visibility: ["public"] }]) assert.equal(roundsVisibilityFromBody(body), null);
});
