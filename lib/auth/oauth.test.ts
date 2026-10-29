import assert from "node:assert/strict";
import test from "node:test";
import { isOAuthProvider, loginErrorUrl, oauthCallbackUrl, oauthDestination, oauthErrorFromParams, oauthErrorMessage } from "./oauth";

const INVITE = "/golf-trips/invite/abcdefghijklmnopqrstuvwxyzABCDEF012345";
const ORIGIN = "https://themaroon.example";

test("only Google and Apple can be started", () => {
  assert.equal(isOAuthProvider("google"), true);
  assert.equal(isOAuthProvider("apple"), true);
  for (const value of ["github", "Google", "", null, undefined, 1]) assert.equal(isOAuthProvider(value), false, String(value));
});

test("Google / Apple always come back to our own callback, carrying only an allowed return page", () => {
  assert.equal(oauthCallbackUrl(ORIGIN, null), `${ORIGIN}/auth/callback?flow=oauth`);
  assert.equal(oauthCallbackUrl(ORIGIN, INVITE), `${ORIGIN}/auth/callback?flow=oauth&returnTo=${encodeURIComponent(INVITE)}`);
  for (const bad of ["https://evil.example", "//evil.example", "/admin", "/profile"]) {
    assert.equal(oauthCallbackUrl(ORIGIN, bad), `${ORIGIN}/auth/callback?flow=oauth`, bad);
  }
});

test("onboarding routing: after Google / Apple you land where password login lands", () => {
  // /profile shows profile setup for a new or unfinished account and the normal profile for a finished one.
  assert.equal(oauthDestination(null), "/profile");
  assert.equal(oauthDestination(INVITE), INVITE);
  assert.equal(oauthDestination("/dashboard"), "/dashboard");
  assert.equal(oauthDestination("https://evil.example"), "/profile");
});

test("cancel is told apart from other failures", () => {
  assert.equal(oauthErrorFromParams(new URLSearchParams("")), null);
  assert.equal(oauthErrorFromParams(new URLSearchParams("code=abc")), null);
  assert.equal(oauthErrorFromParams(new URLSearchParams("error=access_denied&error_description=x")), "cancelled");
  assert.equal(oauthErrorFromParams(new URLSearchParams("error=user_cancelled_authorize")), "cancelled");
  assert.equal(oauthErrorFromParams(new URLSearchParams("error=server_error")), "failed");
  assert.equal(oauthErrorFromParams(new URLSearchParams("error_code=bad_oauth_state")), "failed");
});

test("the login screen only shows our own fixed words for an error", () => {
  assert.equal(oauthErrorMessage("cancelled"), "Sign-in was cancelled.");
  assert.match(oauthErrorMessage("unavailable") ?? "", /isn't available yet/);
  assert.match(oauthErrorMessage("failed") ?? "", /didn't finish/);
  for (const value of ["<script>", "toString", "constructor", "", undefined, ["failed"]]) assert.equal(oauthErrorMessage(value), null, String(value));
});

test("errors go back to /login with the error and a safe return page", () => {
  assert.equal(loginErrorUrl(ORIGIN, "cancelled", null).toString(), `${ORIGIN}/login?error=cancelled`);
  assert.equal(loginErrorUrl(ORIGIN, "failed", INVITE).toString(), `${ORIGIN}/login?error=failed&next=${encodeURIComponent(INVITE)}`);
  assert.equal(loginErrorUrl(ORIGIN, "failed", "https://evil.example").toString(), `${ORIGIN}/login?error=failed`);
});

test("Phase 7C: onboarding screens get their own return and error pages", () => {
  assert.equal(oauthCallbackUrl(ORIGIN, null, true), `${ORIGIN}/auth/callback?flow=oauth&onboarding=1`);
  assert.equal(oauthCallbackUrl(ORIGIN, INVITE, true), `${ORIGIN}/auth/callback?flow=oauth&returnTo=${encodeURIComponent(INVITE)}&onboarding=1`);
  assert.equal(oauthDestination(null, true), "/onboarding");
  assert.equal(oauthDestination(INVITE, true), INVITE);
  assert.equal(oauthDestination("https://evil.example", true), "/onboarding");
  assert.equal(loginErrorUrl(ORIGIN, "cancelled", null, true).toString(), `${ORIGIN}/start/log-in?error=cancelled`);
  assert.equal(loginErrorUrl(ORIGIN, "failed", null).toString(), `${ORIGIN}/login?error=failed`);
});
