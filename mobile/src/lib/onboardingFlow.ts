/**
 * Sign up + onboarding on the phone (pure, unit-tested; project_specs.md "Expo app Step 4 — Sign up + onboarding").
 * The server decides the step (GET /api/account/onboarding, lib/account/onboardingApi.ts); this only maps it to a screen.
 */
import type { OnboardingStep } from "@/lib/account/onboardingApi";
import { PASSWORD_MIN_CHARS, checkNewPassword } from "@/lib/auth/passwordPolicy";

export type { OnboardingStep };
/** What the app knows about the signed-in account: the server's step, or that asking failed. */
export type AccountStep = OnboardingStep | "error";

export const EMAIL = /^\S+@\S+\.\S+$/;
export const CODE_LENGTH = 6; // the same as lib/auth/verifyCode.ts (server only)
export const isEmail = (email: string) => EMAIL.test(email.trim());

/** Only digits, at most 6 (a pasted "123 456" works). */
export const cleanCode = (typed: string) => typed.replace(/\D/g, "").slice(0, CODE_LENGTH);

/** The step from GET /api/account/onboarding's reply ({ ok, next }); anything odd = "error" (the retry screen). */
const STEPS: readonly OnboardingStep[] = ["welcome", "verification", "password", "name_username", "birthday", "terms", "settings", "play", "ineligible", "restricted", "closed"];
export function stepFromReply(body: unknown): AccountStep {
  const next = body && typeof body === "object" ? (body as { next?: unknown }).next : null;
  return typeof next === "string" && (STEPS as readonly string[]).includes(next) ? next as OnboardingStep : "error";
}

/** The onboarding screen for a signed-in account's step (website stepPath). "play" = the tabs. */
export type OnboardingScreen = "/onboarding/password" | "/onboarding/name" | "/onboarding/birthday" | "/onboarding/settings" | "/onboarding/status";
export function screenForStep(step: AccountStep): OnboardingScreen | "play" {
  switch (step) {
    case "play": return "play";
    case "password": return "/onboarding/password";
    case "name_username": return "/onboarding/name";
    case "birthday": return "/onboarding/birthday";
    case "terms": case "settings": return "/onboarding/settings";
    // welcome / verification can't really happen signed in (Supabase gives unverified logins no session): the status
    // screen offers Sign out. ineligible / restricted / closed / error: their messages.
    default: return "/onboarding/status";
  }
}

/** Create / Set a new password: the message under the boxes (website PasswordScreen), and whether Continue works. */
export function passwordCheck(password: string, confirm: string): { problem: string | null; ready: boolean } {
  const rules = checkNewPassword(password);
  const tooShort = password.length > 0 && [...password].length < PASSWORD_MIN_CHARS;
  const problem = tooShort ? `At least ${PASSWORD_MIN_CHARS} characters.`
    : !confirm ? null : !rules.ok ? rules.error : confirm !== password ? "Passwords don't match." : null;
  return { problem, ready: rules.ok && confirm === password };
}

/** A picked birthday as the server wants it (YYYY-MM-DD, the phone's own calendar day). */
export function birthdayValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The blocked / problem screens' words (website AccountStatusView). */
export function statusWords(step: AccountStep): { title: string; body: string } {
  switch (step) {
    case "ineligible": return { title: "This account can't use Balata", body: "Balata is for people 13 and older." };
    case "restricted": return { title: "Your account is being reviewed", body: "We'll be in touch." };
    case "closed": return { title: "This account is closed", body: "Sign out to log in with another account." };
    case "welcome": case "verification": return { title: "Log in again", body: "Sign out, then log in to keep going." };
    default: return { title: "We couldn't check your account", body: "Something went wrong on our side, or the connection dropped. Try again in a moment." };
  }
}
