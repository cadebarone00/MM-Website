/**
 * Pending accounts Phase 6 — where each real sign-up / onboarding screen lives, and which one a signed-in account may
 * see (pure, unit tested). The screens are the approved /dev/auth designs; the server decides the step
 * (GET /api/account/onboarding, lib/account/onboardingApi.ts resumeReply) and these rules only map it to a page.
 */
import type { OnboardingStep } from "./onboardingApi";
import { authReturnPath } from "@/lib/auth/returnTo";

export const START = {
  welcome: "/start", birthday: "/start/birthday", signUp: "/start/sign-up", password: "/start/password", verify: "/start/verify", confirmed: "/start/confirmed",
  logIn: "/start/log-in", forgot: "/start/forgot", resetCode: "/start/reset-code", resetPassword: "/start/reset-password",
} as const;
export const ONBOARDING = {
  resume: "/onboarding", name: "/onboarding/name", birthday: "/onboarding/birthday", photo: "/onboarding/photo",
  settings: "/onboarding/settings", created: "/onboarding/created",
} as const;
export const PLAY = "/";
export const STATUS = "/account/status";

export type StartScreen = "birthday" | "sign-up" | "password" | "verify" | "confirmed" | "log-in" | "forgot" | "reset-code" | "reset-password";
export const START_SCREENS: StartScreen[] = ["birthday", "sign-up", "password", "verify", "confirmed", "log-in", "forgot", "reset-code", "reset-password"];
export type OnboardingScreen = "name" | "birthday" | "photo" | "settings" | "created";
export const ONBOARDING_SCREENS: OnboardingScreen[] = ["name", "birthday", "photo", "settings", "created"];

/** The page for a step from the server. */
export function stepPath(step: OnboardingStep): string {
  switch (step) {
    case "welcome": return START.welcome;
    case "verification": return START.logIn; // only reachable signed out: Supabase gives unverified email logins no session
    case "password": return START.password; // verified, password not chosen yet (owner decision 2026-11-20)
    case "name_username": return ONBOARDING.name;
    case "birthday": return ONBOARDING.birthday;
    case "terms": case "settings": return ONBOARDING.settings;
    case "play": return PLAY;
    case "ineligible": case "restricted": case "closed": return STATUS;
  }
}

/** After Log in: only an Active account (step "play") may go to the allow-listed return page it came with (a legacy
 *  /login?next=…); every other step goes where the server says, so Pending resumes and blocked never reaches Play. */
export function afterLogInPath(step: OnboardingStep, returnTo: string | null): string {
  const safe = authReturnPath(returnTo);
  return step === "play" && safe ? safe : stepPath(step);
}

/** Null = this account may see `screen` now; otherwise where to send it instead. Strictly forward: name and birthday are
 *  saved once (the birthday is write-once), so going back to them bounces to the current step. Profile Created only
 *  ever shows to an account the server already confirms Active. */
export function onboardingRedirect(screen: OnboardingScreen, step: OnboardingStep): string | null {
  const allowed =
    screen === "name" ? step === "name_username"
    : screen === "birthday" ? step === "birthday"
    : screen === "photo" || screen === "settings" ? step === "terms" || step === "settings"
    : step === "play";
  return allowed ? null : stepPath(step);
}

/** Steps of sign-up an account can be stuck on while signed in (owner request 2026-11-22: an unfinished account never
 *  reaches the app — not even Create a trip — it goes back to the step it stopped at). */
const UNFINISHED: OnboardingStep[] = ["password", "name_username", "birthday", "terms", "settings"];
/** Screens that are part of signing up / account status, where an unfinished account may already be. */
const isSignUpPath = (path: string) => path === "/start" || path.startsWith("/start/") || path === "/onboarding" || path.startsWith("/onboarding/")
  || path === STATUS || path === "/login" || path.startsWith("/login/") || path === "/signup" || path === "/new-user" || path.startsWith("/dev");

/** Where an unfinished signed-in account must go instead of `pathname`, or null when it can stay (finished, or already
 *  in sign-up). `next` is GET /api/account/onboarding's step. */
export function unfinishedRedirect(next: OnboardingStep | null | undefined, pathname: string): string | null {
  const path = pathname.replace(/(.)\/+$/, "$1");
  if (!next || !UNFINISHED.includes(next) || isSignUpPath(path)) return null;
  return stepPath(next);
}

/** Progress bar on the email sign-up screens, in the order they really come. The password comes AFTER the code (owner
 *  decision 2026-11-20, replacing decision D1); Birthday after Name (owner decision 2026-11-02). */
const PROGRESS = ["sign-up", "verify", "password", "name", "birthday", "photo", "settings", "created"] as const;
export type ProgressScreen = (typeof PROGRESS)[number];
export const progressWidth = (screen: ProgressScreen) => `${((PROGRESS.indexOf(screen) + 1) / PROGRESS.length) * 100}%`;

/** Finish's "missing" list → which screen to fix, in plain words. */
export function finishProblem(code: string | undefined, error: string | undefined, missing: string[] | undefined): string {
  if (code === "incomplete" && missing?.length) {
    if (missing.includes("name") || missing.includes("username")) return "Add your name and username first.";
    if (missing.includes("birthday")) return "Add your birthday first.";
    if (missing.some((m) => m.endsWith("_not_configured"))) return "Finishing sign-up isn't open yet. Your progress is saved.";
    if (missing.includes("terms") || missing.includes("privacy")) return "Accept the Terms of Service and Privacy Policy to finish.";
    if (missing.includes("privacy_setting")) return "Choose Public or Private, then tap Finish.";
    if (missing.includes("verification")) return "Verify your email first.";
  }
  return error || "We couldn't finish that. Your progress is saved — try again.";
}
