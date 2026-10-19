import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNewPassword, PASSWORD_MAX_BYTES } from "./passwordPolicy.ts";
import { passwordErrorMessage } from "./passwordErrors.ts";

test("12 characters minimum; passphrases with spaces welcome; no forced character classes", () => {
  assert.equal(checkNewPassword("short pass").ok, false);
  assert.equal(checkNewPassword("elevenchars").ok, false);
  assert.equal(checkNewPassword("twelvechars!").ok, true);
  assert.equal(checkNewPassword("correct horse battery staple").ok, true);
  assert.equal(checkNewPassword("ünïcödé pässwörd").ok, true, "counted in characters, not bytes");
});

test("72-byte ceiling (Supabase Auth's limit), counted in UTF-8 bytes", () => {
  assert.equal(checkNewPassword("ab".repeat(PASSWORD_MAX_BYTES / 2)).ok, true);
  assert.equal(checkNewPassword("ab".repeat(PASSWORD_MAX_BYTES / 2) + "c").ok, false);
  assert.equal(checkNewPassword("é".repeat(37)).ok, false, "37 accented letters = 74 bytes");
});

test("junk is refused", () => {
  for (const bad of [undefined, null, 12345678901234, "", "             ", "aaaaaaaaaaaaaaaa"]) assert.equal(checkNewPassword(bad).ok, false, String(bad));
});

test("Supabase errors become plain messages", () => {
  assert.match(passwordErrorMessage({ code: "weak_password", message: "Password is known to be weak and easy to guess (pwned)" }), /data breach/);
  assert.match(passwordErrorMessage({ code: "validation_failed", message: "Password cannot be longer than 72 characters" }), /too long/);
  assert.match(passwordErrorMessage({ code: "same_password", message: "New password should be different from the old password." }), /different/);
  assert.match(passwordErrorMessage({ message: "boom" }), /couldn't change/);
});
