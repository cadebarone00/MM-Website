import test from "node:test";
import assert from "node:assert/strict";
import { finishProblem, onboardingRedirect, progressWidth, stepPath, type OnboardingScreen } from "./onboardingRoutes";
import type { OnboardingStep } from "./onboardingApi";

test("each server step has one page; blocked states go to the status page, never Play", () => {
  assert.equal(stepPath("name_username"), "/onboarding/name");
  assert.equal(stepPath("birthday"), "/onboarding/birthday");
  assert.equal(stepPath("terms"), "/onboarding/settings");
  assert.equal(stepPath("settings"), "/onboarding/settings");
  assert.equal(stepPath("play"), "/");
  for (const s of ["ineligible", "restricted", "closed"] as const) assert.equal(stepPath(s), "/account/status");
  assert.equal(stepPath("welcome"), "/start");
});

test("screens are strictly forward and Profile Created needs Active", () => {
  const screens: OnboardingScreen[] = ["name", "birthday", "photo", "settings", "created"];
  const allowed = (step: OnboardingStep) => screens.filter((s) => onboardingRedirect(s, step) === null);
  assert.deepEqual(allowed("name_username"), ["name"]);
  assert.deepEqual(allowed("birthday"), ["birthday"]);
  assert.deepEqual(allowed("terms"), ["photo", "settings"]);
  assert.deepEqual(allowed("settings"), ["photo", "settings"]);
  assert.deepEqual(allowed("play"), ["created"]);
  for (const s of ["ineligible", "restricted", "closed", "welcome", "verification"] as const) assert.deepEqual(allowed(s), []);
  assert.equal(onboardingRedirect("created", "settings"), "/onboarding/settings");
  assert.equal(onboardingRedirect("settings", "play"), "/");
  assert.equal(onboardingRedirect("created", "ineligible"), "/account/status");
});

test("progress bar follows the real order", () => {
  assert.equal(progressWidth("sign-up"), "12.5%");
  assert.equal(progressWidth("verify"), "37.5%");
  assert.equal(progressWidth("created"), "100%");
});

test("Finish problems name the step to fix", () => {
  assert.equal(finishProblem("incomplete", "x", ["birthday"]), "Add your birthday first.");
  assert.equal(finishProblem("incomplete", "x", ["terms_not_configured"]), "Finishing sign-up isn't open yet. Your progress is saved.");
  assert.equal(finishProblem("incomplete", "x", ["privacy_setting"]), "Choose Public or Private, then tap Finish.");
  assert.equal(finishProblem("activation_disabled", "Finishing sign-up isn't open yet. Your progress is saved.", undefined), "Finishing sign-up isn't open yet. Your progress is saved.");
  assert.match(finishProblem(undefined, undefined, undefined), /progress is saved/);
});
