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
