/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { pushRoute } from "./pushRoutes.ts";

test("notification links open the matching app screen", () => {
  assert.deepEqual(pushRoute("/golf-trips/abc-123#golf"), { pathname: "/trips/[id]", params: { id: "abc-123" } });
  assert.deepEqual(pushRoute("/golf-trips/abc/settings"), { pathname: "/trips/[id]", params: { id: "abc" } });
  assert.deepEqual(pushRoute("/golf-trips"), { pathname: "/golf-trips" });
  assert.deepEqual(pushRoute("/profile/friends"), { pathname: "/profile/search", params: { tab: "search" } });
  assert.deepEqual(pushRoute("/profile"), { pathname: "/profile" });
  assert.deepEqual(pushRoute("/leagues/L1"), { pathname: "/leagues/[id]", params: { id: "L1" } });
  assert.deepEqual(pushRoute("/leagues/join?code=ABC123"), { pathname: "/leagues" });
  assert.deepEqual(pushRoute("/tournaments/x"), { pathname: "/tourneys" });
});

test("anything else opens Play", () => {
  for (const link of ["https://evil.example", "//evil.example", "", null, 7, "/nowhere", "/"]) assert.deepEqual(pushRoute(link), { pathname: "/" });
});
