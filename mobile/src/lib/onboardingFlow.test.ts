/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { birthdayValue, cleanCode, isEmail, passwordCheck, screenForStep, statusWords, stepFromReply } from "./onboardingFlow.ts";

test("stepFromReply reads the server's next step, anything else is an error", () => {
  assert.equal(stepFromReply({ ok: true, next: "name_username" }), "name_username");
  assert.equal(stepFromReply({ ok: true, next: "play" }), "play");
  assert.equal(stepFromReply({ ok: false, next: null }), "error");
  assert.equal(stepFromReply({ next: "somewhere" }), "error");
  assert.equal(stepFromReply(null), "error");
});

test("screenForStep follows the website's order", () => {
  assert.equal(screenForStep("play"), "play");
  assert.equal(screenForStep("password"), "/onboarding/password");
  assert.equal(screenForStep("name_username"), "/onboarding/name");
  assert.equal(screenForStep("birthday"), "/onboarding/birthday");
  assert.equal(screenForStep("terms"), "/onboarding/settings");
  assert.equal(screenForStep("settings"), "/onboarding/settings");
  for (const step of ["ineligible", "restricted", "closed", "error", "welcome", "verification"] as const) assert.equal(screenForStep(step), "/onboarding/status");
});

test("codes keep digits only, six at most", () => {
  assert.equal(cleanCode("12 34-56"), "123456");
  assert.equal(cleanCode("12345678"), "123456");
  assert.equal(cleanCode("ab"), "");
});

test("emails", () => {
  assert.equal(isEmail(" a@b.co "), true);
  assert.equal(isEmail("a@b"), false);
  assert.equal(isEmail(""), false);
});

test("password check matches the website's messages", () => {
  assert.deepEqual(passwordCheck("", ""), { problem: null, ready: false });
  assert.deepEqual(passwordCheck("short", ""), { problem: "At least 8 characters.", ready: false });
  assert.deepEqual(passwordCheck("long enough pw", ""), { problem: null, ready: false });
  assert.deepEqual(passwordCheck("long enough pw", "long enough"), { problem: "Passwords don't match.", ready: false });
  assert.deepEqual(passwordCheck("long enough pw", "long enough pw"), { problem: null, ready: true });
});

test("birthday is the picked calendar day", () => {
  assert.equal(birthdayValue(new Date(2001, 0, 5)), "2001-01-05");
  assert.equal(birthdayValue(new Date(1999, 11, 31)), "1999-12-31");
});

test("status words", () => {
  assert.match(statusWords("ineligible").body, /13 and older/);
  assert.match(statusWords("error").title, /couldn't check/);
});
