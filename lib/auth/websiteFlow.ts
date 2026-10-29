import { authReturnPath } from "./returnTo";

/** Phase 6 onboarding screens (/start, /onboarding) ask for these with next: "/onboarding" (sign-up) or "/start" (reset). */
const ONBOARDING_VERIFICATION = "onboarding-verification";
const ONBOARDING_RECOVERY = "onboarding-recovery";

export function websiteVerificationOptions(requestUrl: string, next: unknown) {
  if (next === "/onboarding") return { options: { emailRedirectTo: `${new URL(requestUrl).origin}/auth/callback?flow=${ONBOARDING_VERIFICATION}` } };
  return next === "/dashboard" ? { options: { emailRedirectTo: `${new URL(requestUrl).origin}/auth/callback?flow=website-verification` } } : {};
}

export function recoveryRedirect(requestUrl: string, next: unknown): string {
  const url = new URL("/auth/callback", requestUrl);
  url.searchParams.set("next", "/reset-password");
  if (next === "/start") url.searchParams.set("flow", ONBOARDING_RECOVERY);
  if (next === "/dashboard") url.searchParams.set("returnTo", "/dashboard");
  return url.toString();
}

/** Recovery/invite stays on the password form. Verification has a fixed, same-origin completion page. The onboarding
 *  flows land on their own fixed screens: the link is the fallback for the emailed code (Email Confirmed / Reset Password). */
export function authCallbackPath(params: URLSearchParams): string {
  if (params.get("flow") === "website-verification") return "/auth/website-complete";
  if (params.get("flow") === ONBOARDING_VERIFICATION) return "/start/confirmed";
  if (params.get("flow") === ONBOARDING_RECOVERY) return "/start/reset-password";
  return authReturnPath(params.get("returnTo")) === "/dashboard" ? "/reset-password?next=%2Fdashboard" : "/reset-password";
}
