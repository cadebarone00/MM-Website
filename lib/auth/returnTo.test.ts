import assert from "node:assert/strict";
import test from "node:test";
import { inviteReturnPath, withReturnTo } from "./returnTo";

test("after login / signup you can only be sent back to an invite page", () => {
  assert.equal(inviteReturnPath("/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345_-"), "/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345_-");
  for (const value of [null, "", "/profile", "https://evil.example/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF0123",
    "//evil.example/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF0123", "/golf-trips/invite/short", "/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF0123/../../admin",
    "/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF0123?x=1"]) assert.equal(inviteReturnPath(value), null, String(value));
});

test("login / signup links carry the invite page along", () => {
  const back = "/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345";
  assert.equal(withReturnTo("/login/email", back), `/login/email?next=${encodeURIComponent(back)}`);
  assert.equal(withReturnTo("/signup", null), "/signup");
});
