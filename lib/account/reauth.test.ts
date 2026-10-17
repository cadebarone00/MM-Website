import { test } from "node:test";
import assert from "node:assert/strict";
import { lastSignInSeconds, signedInRecently } from "./reauth.ts";

const token = (payload: unknown) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

test("recent sign-in comes from the newest amr timestamp", () => {
  assert.equal(lastSignInSeconds(token({ amr: [{ method: "password", timestamp: 100 }, { method: "otp", timestamp: 250 }] })), 250);
  assert.equal(signedInRecently(token({ amr: [{ method: "password", timestamp: 1000 }] }), 1300), true);
  assert.equal(signedInRecently(token({ amr: [{ method: "password", timestamp: 1000 }] }), 1000 + 601), false, "older than 10 minutes");
  assert.equal(signedInRecently(token({ amr: [{ method: "password", timestamp: 5000 }] }), 1000), false, "a timestamp from the future is not trusted");
});

test("no amr, malformed tokens and junk never count as a recent sign-in", () => {
  for (const bad of ["", "not-a-jwt", token({}), token({ amr: "x" }), token({ amr: [{ timestamp: "1000" }] })]) {
    assert.equal(signedInRecently(bad, 1000), false, bad);
  }
});
