/**
 * "Did this person sign in recently?" for sensitive actions such as deleting the account (Accounts V2, Step 3).
 * Supabase puts the sign-in methods and times in the access token's `amr` claim. The token must already have been
 * verified with Supabase (auth.getUser); this only reads the time, it proves nothing by itself.
 */
export const REAUTH_WINDOW_SECONDS = 10 * 60;

/**
 * Methods that prove the person themselves just signed in: their password, or (later) Sign in with Apple ("oauth").
 * Email-link sessions (reset / invite / magic link / OTP) do NOT count: a reset link lets you set a new password, not
 * delete the account or pass other "confirm it's you" checks.
 */
export const REAUTH_METHODS = new Set(["password", "oauth"]);
/** Email-link methods that may set a new password on the reset / invite page. */
export const LINK_METHODS = new Set(["recovery", "invite", "otp", "magiclink"]);

type AmrEntry = { method?: unknown; timestamp?: unknown };
function amr(accessToken: string): AmrEntry[] {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { amr?: unknown };
    return (Array.isArray(payload.amr) ? payload.amr : []).filter((e): e is AmrEntry => !!e && typeof e === "object");
  } catch {
    return [];
  }
}

/** Newest sign-in time among the given methods (default: real sign-ins only). */
export function lastSignInSeconds(accessToken: string, methods: Set<string> = REAUTH_METHODS): number | null {
  try {
    const times = amr(accessToken)
      .filter((entry) => typeof entry.method === "string" && methods.has(entry.method))
      .map((entry) => entry.timestamp)
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
    return times.length ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

export function signedInRecently(accessToken: string, nowSeconds: number, windowSeconds = REAUTH_WINDOW_SECONDS, methods: Set<string> = REAUTH_METHODS): boolean {
  const last = lastSignInSeconds(accessToken, methods);
  return last !== null && last <= nowSeconds + 60 && nowSeconds - last <= windowSeconds;
}
