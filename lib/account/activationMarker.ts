/**
 * Phase 7A — the one-time "you just finished sign-up" marker behind Profile Created (pure, unit tested).
 * Finish (POST /api/account/finish, website) sets a short-lived HttpOnly cookie holding the account's own activation time
 * — no account id, no secret. The page shows Profile Created only when that value equals the activation time the
 * DATABASE has for the signed-in account and that activation is under 10 minutes old; the screen then uses it up
 * (POST /api/account/activation-seen). A forged or copied value can at most show one account its own success screen
 * within those 10 minutes; it can never activate anything (only Finish does).
 */
export const ACTIVATION_MARKER_COOKIE = "maroon_just_activated";
export const ACTIVATION_MARKER_SECONDS = 10 * 60;

/** True when an activation at `activatedAt` happened at most 10 minutes before `nowMs` (and not in the future). */
export function activationIsFresh(activatedAt: string | null | undefined, nowMs: number): boolean {
  const at = activatedAt ? Date.parse(activatedAt) : NaN;
  if (!Number.isFinite(at)) return false;
  const age = nowMs - at;
  return age >= -5_000 && age <= ACTIVATION_MARKER_SECONDS * 1000; // 5s allowance for clock skew between servers
}

/** May Profile Created show? Only for the exact, fresh activation time of the signed-in account. */
export function markerMatches(marker: string | null | undefined, activatedAt: string | null | undefined, nowMs: number): boolean {
  return !!marker && !!activatedAt && marker === activatedAt && activationIsFresh(activatedAt, nowMs);
}

/** Cookie options: browser-only, this site only, gone after 10 minutes at most. */
export const markerCookieOptions = (secure: boolean) =>
  ({ httpOnly: true, sameSite: "strict" as const, secure, path: "/", maxAge: ACTIVATION_MARKER_SECONDS });

/** markerMatches at the current time (server pages). */
export const markerMatchesNow = (marker: string | null | undefined, activatedAt: string | null | undefined) => markerMatches(marker, activatedAt, Date.now());
