import { authReturnPath } from "./returnTo";

/**
 * Sign in with Google / Apple on the website (project_specs.md "Sign in with Google and Sign in with Apple").
 * POST /api/auth/oauth starts it, Google / Apple send the person back to /auth/callback?flow=oauth, and the callback
 * finishes it. These helpers are pure so the redirects and error words can be tested without a browser.
 */
export const OAUTH_PROVIDERS = ["google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export const isOAuthProvider = (value: unknown): value is OAuthProvider => OAUTH_PROVIDERS.includes(value as OAuthProvider);

export const OAUTH_FLOW = "oauth";

/** Where Google / Apple send the person back: our callback, carrying only an allow-listed return page, and
 *  `onboarding=1` when the sign-in started on the Phase 6 screens (/start/*), so a cancel or failure returns there. */
export function oauthCallbackUrl(origin: string, next: unknown, onboarding = false): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("flow", OAUTH_FLOW);
  const safe = authReturnPath(next);
  if (safe) url.searchParams.set("returnTo", safe);
  if (onboarding) url.searchParams.set("onboarding", "1");
  return url.toString();
}

/** Same place as email + password login: the return page, else /profile (which shows profile setup if it isn't done).
 *  With the Phase 6 onboarding screens switched on (`onboarding`), else /onboarding instead: the server sends each account
 *  on by its lifecycle — Pending → next step, Active → Play, birthday missing → Birthday, blocked → /account/status. */
export const oauthDestination = (returnTo: unknown, onboarding = false): string => authReturnPath(returnTo) ?? (onboarding ? "/onboarding" : "/profile");

const MESSAGES = {
  cancelled: "Sign-in was cancelled.",
  unavailable: "That sign-in option isn't available yet. Use your email instead.",
  failed: "Sign-in didn't finish. Please try again.",
} as const;
export type OAuthError = keyof typeof MESSAGES;

// Google sends access_denied when the person backs out; Apple sends user_cancelled_authorize.
const CANCELLED = new Set(["access_denied", "user_cancelled_authorize", "user_cancelled_login"]);

/** Error params Supabase passes back from Google / Apple, as one of our codes (null = no error). */
export function oauthErrorFromParams(params: URLSearchParams): OAuthError | null {
  const code = params.get("error") ?? params.get("error_code");
  if (!code) return null;
  return CANCELLED.has(code) ? "cancelled" : "failed";
}

/** The words for /login?error=… (anything else in the URL is ignored, so the page can't be made to show other text). */
export const oauthErrorMessage = (value: unknown): string | null =>
  typeof value === "string" && Object.hasOwn(MESSAGES, value) ? MESSAGES[value as OAuthError] : null;

/** Back to the login screen with an error, keeping an allow-listed return page. */
export function loginErrorUrl(origin: string, error: OAuthError, next: unknown, onboarding = false): URL {
  const url = new URL(onboarding ? "/start/log-in" : "/login", origin);
  url.searchParams.set("error", error);
  const safe = authReturnPath(next);
  if (safe) url.searchParams.set("next", safe);
  return url;
}
