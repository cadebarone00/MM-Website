import { test } from "node:test";
import assert from "node:assert/strict";
import { lastSignInSeconds, signedInRecently } from "./reauth.ts";

const token = (payload: unknown) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

test("recent sign-in comes from the newest amr timestamp", () => {
  assert.equal(lastSignInSeconds(token({ amr: [{ method: "password", timestamp: 100 }, { method: "password", timestamp: 250 }] })), 250);
  assert.equal(lastSignInSeconds(token({ amr: [{ method: "password", timestamp: 100 }, { method: "otp", timestamp: 250 }] })), 100, "an email code isn't a real sign-in");
  assert.equal(signedInRecently(token({ amr: [{ method: "password", timestamp: 1000 }] }), 1300), true);
  assert.equal(signedInRecently(token({ amr: [{ method: "password", timestamp: 1000 }] }), 1000 + 601), false, "older than 10 minutes");
  assert.equal(signedInRecently(token({ amr: [{ method: "password", timestamp: 5000 }] }), 1000), false, "a timestamp from the future is not trusted");
});

test("no amr, malformed tokens and junk never count as a recent sign-in", () => {
  for (const bad of ["", "not-a-jwt", token({}), token({ amr: "x" }), token({ amr: [{ timestamp: "1000" }] })]) {
    assert.equal(signedInRecently(bad, 1000), false, bad);
  }
});

test("email-link sessions (reset, invite, magic link) never count as signing in again; they can be checked separately", async () => {
  const { LINK_METHODS } = await import("./reauth.ts");
  const recovery = token({ amr: [{ method: "recovery", timestamp: 1000 }] });
  assert.equal(signedInRecently(recovery, 1100), false, "a reset link can't confirm account deletion");
  assert.equal(signedInRecently(recovery, 1100, 600, LINK_METHODS), true, "but it can set a new password on the reset page");
  assert.equal(signedInRecently(token({ amr: [{ method: "password", timestamp: 1000 }] }), 1100, 600, LINK_METHODS), false, "a normal session isn't a reset session");
  assert.equal(signedInRecently(token({ amr: [{ method: "oauth", timestamp: 1000 }] }), 1100), true, "Sign in with Apple will count");
});

