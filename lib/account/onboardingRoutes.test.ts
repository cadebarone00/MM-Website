import test from "node:test";
import assert from "node:assert/strict";
import { afterLogInPath, finishProblem, onboardingRedirect, progressWidth, stepPath, type OnboardingScreen } from "./onboardingRoutes";
import type { OnboardingStep } from "./onboardingApi";

test("each server step has one page; blocked states go to the status page, never Play", () => {
  assert.equal(stepPath("name_username"), "/onboarding/name");
  assert.equal(stepPath("birthday"), "/onboarding/birthday");
  assert.equal(stepPath("terms"), "/onboarding/settings");
  assert.equal(stepPath("settings"), "/onboarding/settings");
  assert.equal(stepPath("play"), "/");
  for (const s of ["ineligible", "restricted", "closed"] as const) assert.equal(stepPath(s), "/account/status");
  assert.equal(stepPath("welcome"), "/start");
  assert.equal(stepPath("password"), "/start/password");
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

test("progress bar follows the real order (code before password 2026-11-20, birthday after Name 2026-11-02)", () => {
  assert.equal(progressWidth("sign-up"), "12.5%");
  assert.equal(progressWidth("verify"), "25%");
  assert.equal(progressWidth("password"), "37.5%");
  assert.equal(progressWidth("name"), "50%");
  assert.equal(progressWidth("birthday"), "62.5%");
  assert.equal(progressWidth("photo"), "75%");
  assert.equal(progressWidth("created"), "100%");
});

test("Finish problems name the step to fix", () => {
  assert.equal(finishProblem("incomplete", "x", ["birthday"]), "Add your birthday first.");
  assert.equal(finishProblem("incomplete", "x", ["terms_not_configured"]), "Finishing sign-up isn't open yet. Your progress is saved.");
  assert.equal(finishProblem("incomplete", "x", ["privacy_setting"]), "Choose Public or Private, then tap Finish.");
  assert.equal(finishProblem("activation_disabled", "Finishing sign-up isn't open yet. Your progress is saved.", undefined), "Finishing sign-up isn't open yet. Your progress is saved.");
  assert.match(finishProblem(undefined, undefined, undefined), /progress is saved/);
});

test("after Log in only an Active account uses the return page; Pending resumes and blocked never reaches Play", () => {
  assert.equal(afterLogInPath("play", null), "/");
  assert.equal(afterLogInPath("play", "/dashboard"), "/dashboard");
  assert.equal(afterLogInPath("play", "https://evil.example"), "/");
  assert.equal(afterLogInPath("name_username", "/dashboard"), "/onboarding/name");
  assert.equal(afterLogInPath("birthday", "/dashboard"), "/onboarding/birthday");
  assert.equal(afterLogInPath("settings", "/tap-in"), "/onboarding/settings");
  for (const s of ["ineligible", "restricted", "closed"] as const) assert.equal(afterLogInPath(s, "/dashboard"), "/account/status");
});

test("an unfinished signed-in account is sent back to its sign-up step from anywhere in the app, never from sign-up itself", async () => {
  const { unfinishedRedirect, ONBOARDING, START } = await import("./onboardingRoutes.ts");
  assert.equal(unfinishedRedirect("name_username", "/golf-trips/new/"), ONBOARDING.name, "Create a trip → finish the name step");
  assert.equal(unfinishedRedirect("birthday", "/profile"), ONBOARDING.birthday);
  assert.equal(unfinishedRedirect("password", "/"), START.password);
  assert.equal(unfinishedRedirect("settings", "/rounds/new"), ONBOARDING.settings);
  for (const path of ["/onboarding/name/", "/start/password", "/account/status", "/login"]) assert.equal(unfinishedRedirect("name_username", path), null, path);
  for (const next of ["play", null, undefined, "closed", "verification"] as const) assert.equal(unfinishedRedirect(next, "/golf-trips/new"), null, String(next));
});
