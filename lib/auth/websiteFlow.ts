import { authReturnPath } from "./returnTo";

export function websiteVerificationOptions(requestUrl: string, next: unknown) {
  return next === "/dashboard" ? { options: { emailRedirectTo: `${new URL(requestUrl).origin}/auth/callback?flow=website-verification` } } : {};
}

export function recoveryRedirect(requestUrl: string, next: unknown): string {
  const url = new URL("/auth/callback", requestUrl);
  url.searchParams.set("next", "/reset-password");
  if (next === "/dashboard") url.searchParams.set("returnTo", "/dashboard");
  return url.toString();
}

/** Recovery/invite stays on the password form. Verification has a fixed, same-origin completion page. */
export function authCallbackPath(params: URLSearchParams): string {
  if (params.get("flow") === "website-verification") return "/auth/website-complete";
  return authReturnPath(params.get("returnTo")) === "/dashboard" ? "/reset-password?next=%2Fdashboard" : "/reset-password";
}
