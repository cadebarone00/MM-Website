/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPARE_DEFAULT, COMPARE_METRICS } from "@/lib/profile/compareMetrics";
import { friendLabel, friendsCountLabel, matchesFriend } from "./friendsUi.ts";

test("friend button words match the website", () => {
  assert.equal(friendLabel("friends", false), "Friends");
  assert.equal(friendLabel("friends", true), "Friends · Trip");
  assert.equal(friendLabel("requested", false), "Requested");
  assert.equal(friendLabel("incoming", false), "Accept");
  assert.equal(friendLabel("none", false), "Add friend");
  assert.equal(friendsCountLabel(1), "1 friend");
  assert.equal(friendsCountLabel(4), "4 friends");
});

test("friends filter: name or @username, any case", () => {
  const cam = { name: "Cam Smith", username: "camsmith" };
  assert.equal(matchesFriend(cam, ""), true);
  assert.equal(matchesFriend(cam, "SMITH"), true);
  assert.equal(matchesFriend(cam, "@cams"), true);
  assert.equal(matchesFriend(cam, "rob"), false);
});

test("compare metrics are shared, lower-is-better marked", () => {
  assert.deepEqual(COMPARE_DEFAULT, ["fairways", "gir", "birdie", "scrambling"]);
  assert.equal(COMPARE_METRICS.find((m) => m.key === "threePutt")?.lowerIsBetter, true);
  assert.equal(COMPARE_METRICS.length, 8);
});
