import { test } from "node:test";
import assert from "node:assert/strict";
import { authCallbackPath, recoveryRedirect, websiteVerificationOptions } from "./websiteFlow";

test("only website signup/verification opts into its fixed completion path", () => {
  assert.deepEqual(websiteVerificationOptions("https://themaroon.site/api/auth/signup", "/dashboard"), { options: { emailRedirectTo: "https://themaroon.site/auth/callback?flow=website-verification" } });
  for (const next of [null, undefined, "//evil.test", "/dashboard?evil=1", "/profile"]) assert.deepEqual(websiteVerificationOptions("https://themaroon.site/api/auth/signup", next), {});
  assert.equal(authCallbackPath(new URLSearchParams("flow=website-verification&next=https://evil.test")), "/auth/website-complete");
});

test("recovery and legacy callbacks retain the password form; website return never bypasses it", () => {
  assert.equal(recoveryRedirect("https://themaroon.site/api/auth/forgot-password", "/dashboard"), "https://themaroon.site/auth/callback?next=%2Freset-password&returnTo=%2Fdashboard");
  assert.equal(authCallbackPath(new URLSearchParams("next=/reset-password&returnTo=/dashboard")), "/reset-password?next=%2Fdashboard");
  assert.equal(authCallbackPath(new URLSearchParams("next=https://evil.test&returnTo=//evil.test")), "/reset-password");
  assert.equal(authCallbackPath(new URLSearchParams()), "/reset-password");
  assert.equal(recoveryRedirect("https://themaroon.site/api/auth/forgot-password", "https://evil.test"), "https://themaroon.site/auth/callback?next=%2Freset-password");
});

test("Phase 6 onboarding: the email link lands on the fixed onboarding screens only", () => {
  assert.deepEqual(websiteVerificationOptions("https://themaroon.site/api/auth/signup", "/onboarding"), { options: { emailRedirectTo: "https://themaroon.site/auth/callback?flow=onboarding-verification" } });
  assert.equal(authCallbackPath(new URLSearchParams("flow=onboarding-verification&next=https://evil.test")), "/start/confirmed");
  assert.equal(recoveryRedirect("https://themaroon.site/api/auth/forgot-password", "/start"), "https://themaroon.site/auth/callback?next=%2Freset-password&flow=onboarding-recovery");
  assert.equal(authCallbackPath(new URLSearchParams("next=/reset-password&flow=onboarding-recovery&returnTo=//evil.test")), "/start/reset-password");
  for (const next of ["/onboarding/x", "/start/", "https://evil.test/onboarding"]) assert.deepEqual(websiteVerificationOptions("https://themaroon.site/api/auth/signup", next), {});
});
