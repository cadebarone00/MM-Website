import assert from "node:assert/strict";
import test from "node:test";
import { authReturnPath, inviteReturnPath, withReturnTo } from "./returnTo";

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

test("tournament invite pages are allowed too", () => {
  assert.equal(inviteReturnPath("/tournaments/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345"), "/tournaments/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345");
  assert.equal(inviteReturnPath("/tournaments/texas-cup/2027"), null);
});

test("website auth accepts only the exact dashboard path, retaining invite destinations", () => {
  assert.equal(authReturnPath("/dashboard"), "/dashboard");
  assert.equal(inviteReturnPath("/dashboard"), null);
  assert.equal(authReturnPath("/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345"), "/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345");
  for (const value of [undefined, null, [], ["/dashboard"], "/dashboard/", "/dashboard?x=1", "/dashboard#x", "/dashboard/../admin", "//evil.example", "https://evil.example", "/%64ashboard", "\\dashboard", "/dashboard\n", "/dashboard%0a"]) {
    assert.equal(authReturnPath(value), null, String(value));
  }
  assert.equal(withReturnTo("/login/email", "https://evil.example"), "/login/email");
  assert.equal(withReturnTo("/login/email", "/dashboard"), "/login/email?next=%2Fdashboard");
});


test("Tap In allows only its exact authenticated return destination", () => {
  assert.equal(authReturnPath("/tap-in"), "/tap-in");
  assert.equal(withReturnTo("/login/email", "/tap-in"), "/login/email?next=%2Ftap-in");
  for (const value of ["/tap-in/", "/tap-in?next=//evil.test", "/tap-in#x", "/tap-in/../admin", "//evil.test/tap-in", "/%74ap-in", "/tap-in\n"]) assert.equal(authReturnPath(value), null);
});
