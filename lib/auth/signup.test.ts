import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_EXISTS, isExistingAccount, passwordPending, signupInputFromBody, signupReply } from "./signup.ts";

test("signup input: email only (2026-11-20); passwords, player codes, names and usernames are ignored", () => {
  assert.deepEqual(signupInputFromBody({ email: " a@b.co ", password: "a long passphrase", username: "MMCADBAR", name: "Cade" }), { ok: true, input: { email: "a@b.co" } });
  assert.deepEqual(signupInputFromBody({ email: "a@b.co" }), { ok: true, input: { email: "a@b.co" } });
  assert.equal(signupInputFromBody(null).ok, false);
  assert.equal(signupInputFromBody({}).ok, false);
  assert.equal(signupInputFromBody({ email: "nope" }).ok, false);
  assert.equal(signupInputFromBody({ email: 5 }).ok, false);
});

test("an already-verified email is spotted from Supabase's stand-in user (no identities)", () => {
  assert.equal(isExistingAccount({ identities: [] }), true);
  assert.equal(isExistingAccount({ identities: [{ provider: "email" }] }), false, "new or still unverified: send the code");
  assert.equal(isExistingAccount({}), false);
  assert.equal(isExistingAccount(null), false);
});

test("password_pending flag: only an explicit true counts", () => {
  assert.equal(passwordPending({ app_metadata: { password_pending: true } }), true);
  for (const meta of [{}, { password_pending: false }, { password_pending: null }, { password_pending: "true" }, null])
    assert.equal(passwordPending({ app_metadata: meta }), false, JSON.stringify(meta));
  assert.equal(passwordPending(null), false);
});

test("an existing account is told to log in; a throttled retry goes on to the code screen", () => {
  const fresh = signupReply(null);
  assert.deepEqual(fresh, { status: 200, body: { ok: true } });
  for (const error of [
    { code: "user_already_exists", status: 422, message: "User already registered" },
    { message: "User already registered" },
    { code: "email_exists", status: 422, message: "Email address already exists" },
  ]) assert.deepEqual(signupReply(error), { status: 409, body: { ok: false, code: "account_exists", error: ACCOUNT_EXISTS } }, JSON.stringify(error));
  assert.deepEqual(signupReply({ code: "over_email_send_rate_limit", status: 429, message: "For security purposes, you can only request this after 42 seconds." }), fresh);
});

test("real problems are reported without revealing anything about other accounts", () => {
  assert.equal(signupReply({ code: "weak_password", message: "Password is too weak" }).status, 400);
  assert.equal(signupReply({ code: "email_address_invalid", message: "x" }).status, 400);
  assert.equal(signupReply({ code: "signup_disabled", message: "x" }).status, 403);
  assert.equal(signupReply({ status: 429, message: "slow down" }).status, 429);
  assert.deepEqual(signupReply({ message: "{}" }), { status: 503, body: { ok: false, error: "Couldn't create your account. Try again." } });
});
