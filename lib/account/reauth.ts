/**
 * "Did this person sign in recently?" for sensitive actions such as deleting the account (Accounts V2, Step 3).
 * Supabase puts the sign-in methods and times in the access token's `amr` claim. The token must already have been
 * verified with Supabase (auth.getUser); this only reads the time, it proves nothing by itself.
 */
export const REAUTH_WINDOW_SECONDS = 10 * 60;

export function lastSignInSeconds(accessToken: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { amr?: unknown };
    const times = (Array.isArray(payload.amr) ? payload.amr : [])
      .map((entry) => (entry && typeof entry === "object" ? (entry as { timestamp?: unknown }).timestamp : null))
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
    return times.length ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

export function signedInRecently(accessToken: string, nowSeconds: number, windowSeconds = REAUTH_WINDOW_SECONDS): boolean {
  const last = lastSignInSeconds(accessToken);
  return last !== null && last <= nowSeconds + 60 && nowSeconds - last <= windowSeconds;
}
