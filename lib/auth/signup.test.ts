import { test } from "node:test";
import assert from "node:assert/strict";
import { signupInputFromBody, signupReply } from "./signup.ts";

test("signup input: email + password only; player codes, names and usernames are ignored", () => {
  assert.deepEqual(signupInputFromBody({ email: " a@b.co ", password: "a long passphrase", username: "MMCADBAR", name: "Cade" }), { ok: true, input: { email: "a@b.co", password: "a long passphrase" } });
  assert.equal(signupInputFromBody(null).ok, false);
  assert.equal(signupInputFromBody({ email: "nope", password: "a long passphrase" }).ok, false);
  assert.equal(signupInputFromBody({ email: "a@b.co", password: "elevenchars" }).ok, false, "under 12 characters");
  assert.equal(signupInputFromBody({ email: "a@b.co", password: "ab".repeat(37) }).ok, false, "over 72 bytes");
});

test("an existing account (verified or not) or a throttled retry answers exactly like a new signup", () => {
  const fresh = signupReply(null);
  assert.deepEqual(fresh, { status: 200, body: { ok: true } });
  for (const error of [
    { code: "user_already_exists", status: 422, message: "User already registered" },
    { message: "User already registered" },
    { code: "email_exists", status: 422, message: "Email address already exists" },
    { code: "over_email_send_rate_limit", status: 429, message: "For security purposes, you can only request this after 42 seconds." },
  ]) assert.deepEqual(signupReply(error), fresh, JSON.stringify(error));
});

test("real problems are reported without revealing anything about other accounts", () => {
  assert.equal(signupReply({ code: "weak_password", message: "Password is too weak" }).status, 400);
  assert.equal(signupReply({ code: "email_address_invalid", message: "x" }).status, 400);
  assert.equal(signupReply({ code: "signup_disabled", message: "x" }).status, 403);
  assert.equal(signupReply({ status: 429, message: "slow down" }).status, 429);
  assert.deepEqual(signupReply({ message: "{}" }), { status: 503, body: { ok: false, error: "Couldn't create your account. Try again." } });
});
