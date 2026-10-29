import test from "node:test";
import assert from "node:assert/strict";
import { attemptKey, verifyCodeFailure, verifyCodeInputFromBody, WRONG_CODE } from "./verifyCode";

test("verify-code input: email, 6 digits, signup | recovery, optional app client", () => {
  assert.deepEqual(verifyCodeInputFromBody({ email: " A@B.co ", code: "012345", type: "signup" }),
    { ok: true, input: { email: "a@b.co", code: "012345", kind: "signup", app: false } });
  assert.deepEqual(verifyCodeInputFromBody({ email: "a@b.co", code: "123456", type: "recovery", client: "app" }),
    { ok: true, input: { email: "a@b.co", code: "123456", kind: "recovery", app: true } });
  for (const body of [null, {}, { email: "nope", code: "123456", type: "signup" }, { email: "a@b.co", code: "12345", type: "signup" },
    { email: "a@b.co", code: "1234567", type: "signup" }, { email: "a@b.co", code: "12a456", type: "signup" },
    { email: "a@b.co", code: "123456", type: "magiclink" }, { email: "a@b.co", code: 123456, type: "signup" }]) {
    assert.equal(verifyCodeInputFromBody(body).ok, false, JSON.stringify(body));
  }
});

test("attempt key: case/space-insensitive hash, never the address", () => {
  assert.equal(attemptKey(" A@B.co"), attemptKey("a@b.co"));
  assert.match(attemptKey("a@b.co"), /^[0-9a-f]{64}$/);
  assert.notEqual(attemptKey("a@b.co"), attemptKey("c@b.co"));
});

test("verify-code failures: one answer for wrong / expired / unknown; throttling and outages told apart", () => {
  for (const e of [{ code: "otp_expired", status: 403, message: "Token has expired or is invalid" }, { status: 400, message: "x" }, { message: "User not found" }]) {
    assert.deepEqual(verifyCodeFailure(e), { status: 400, body: { ok: false, code: "invalid_code", error: WRONG_CODE } });
  }
  assert.equal(verifyCodeFailure({ status: 429, code: "over_request_rate_limit" }).status, 429);
  assert.equal(verifyCodeFailure({ status: 502 }).body.code, "unavailable");
});
