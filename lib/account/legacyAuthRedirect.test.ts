import test from "node:test";
import assert from "node:assert/strict";
import { legacyAuthRedirect, type LegacyAuthRoute } from "./legacyAuthRedirect";

const INVITE = "/golf-trips/invite/abcdefghijklmnopqrstuvwxyz012345";
const ALL: LegacyAuthRoute[] = ["/signup", "/login", "/login/email", "/forgot-password", "/reset-password"];

test("never points back at a legacy page, so there is no redirect loop", () => {
  for (const route of ALL) for (const signedIn of [true, false]) for (const query of [{}, { error: "invalid_link" }, { next: "/dashboard" }]) {
    const to = legacyAuthRedirect(route, query, { signedIn });
    assert.ok(to === null || to.startsWith("/start/"), `${route} -> ${to}`);
  }
});

test("sign up and log in go to the V2 screens", () => {
  assert.equal(legacyAuthRedirect("/signup", {}, { signedIn: false }), "/start/sign-up");
  assert.equal(legacyAuthRedirect("/login", {}, { signedIn: false }), "/start/log-in");
  assert.equal(legacyAuthRedirect("/login/email", {}, { signedIn: false }), "/start/log-in");
  assert.equal(legacyAuthRedirect("/forgot-password", {}, { signedIn: false }), "/start/forgot");
});

test("log in keeps an allow-listed return page and Google / Apple error code, and drops anything else", () => {
  assert.equal(legacyAuthRedirect("/login/email", { next: "/dashboard" }, { signedIn: false }), "/start/log-in?next=%2Fdashboard");
  assert.equal(legacyAuthRedirect("/login", { next: INVITE }, { signedIn: false }), `/start/log-in?next=${encodeURIComponent(INVITE)}`);
  assert.equal(legacyAuthRedirect("/login", { error: "cancelled", next: "/tap-in" }, { signedIn: false }), "/start/log-in?next=%2Ftap-in&error=cancelled");
  assert.equal(legacyAuthRedirect("/login", { next: "https://evil.example", error: "<script>" }, { signedIn: false }), "/start/log-in");
  assert.equal(legacyAuthRedirect("/login", { next: "//evil.example" }, { signedIn: false }), "/start/log-in");
  assert.equal(legacyAuthRedirect("/login", { next: ["/dashboard", "/tap-in"] }, { signedIn: false }), "/start/log-in");
  assert.equal(legacyAuthRedirect("/login", { next: "/tournaments/code/new" }, { signedIn: false }), "/start/log-in");
});

test("the old sign-up player code is not carried (V2 sign-up has no player-code claim)", () => {
  assert.equal(legacyAuthRedirect("/signup", { code: "MM123", next: "/dashboard" }, { signedIn: false }), "/start/sign-up");
});

test("reset password: a bad link goes to Forgot; a recovery session goes to Set a new password", () => {
  assert.equal(legacyAuthRedirect("/reset-password", { error: "invalid_link" }, { signedIn: false }), "/start/forgot");
  assert.equal(legacyAuthRedirect("/reset-password", { error: "invalid_link" }, { signedIn: true }), "/start/forgot");
  assert.equal(legacyAuthRedirect("/reset-password", {}, { signedIn: true }), "/start/reset-password");
  assert.equal(legacyAuthRedirect("/reset-password", { next: "/dashboard" }, { signedIn: true }), "/start/reset-password?next=%2Fdashboard");
  assert.equal(legacyAuthRedirect("/reset-password", { next: "https://evil.example" }, { signedIn: true }), "/start/reset-password");
});

test("reset password with no session stays put: Admin invite links carry their tokens in the #fragment the server can't see", () => {
  assert.equal(legacyAuthRedirect("/reset-password", {}, { signedIn: false }), null);
  assert.equal(legacyAuthRedirect("/reset-password", { next: "/dashboard" }, { signedIn: false }), null);
});
