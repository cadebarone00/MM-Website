/**
 * Where to send someone after login / signup. Only the exact website dashboard / Tap In and Golf Trip / tournament (incl. tournaments-by-code) invite pages are allowed (exact same-site paths), so
 * the `next` parameter can never be used to send people to another site or an unexpected page.
 */
const INVITE_PATH = /^\/(golf-trips|tournaments|tournaments\/code)\/invite\/[A-Za-z0-9_-]{32,200}$/;

export const inviteReturnPath = (value: string | null | undefined): string | null => value && INVITE_PATH.test(value) ? value : null;

/** A Content team invite link (app/join-team). */
const JOIN_TEAM_PATH = /^\/join-team\/[A-Za-z0-9_-]{32,200}$/;

/** A Golf Trip shareable join link (app/golf-trips/join, Trip Builder). Same code shape as golf_trip_join_links.sql. */
const GOLF_TRIP_JOIN_PATH = /^\/golf-trips\/join\/[A-Za-z0-9_-]{24,64}$/;

/** Exact website destination only; keep the invite-only helper unchanged for existing callers. */
export const authReturnPath = (value: unknown): string | null =>
  typeof value === "string" ? (value === "/dashboard" || value === "/tap-in" || JOIN_TEAM_PATH.test(value) || GOLF_TRIP_JOIN_PATH.test(value)) ? value : inviteReturnPath(value) : null;

export const withReturnTo = (href: string, next: string | null): string => {
  const safe = authReturnPath(next);
  return safe ? `${href}?next=${encodeURIComponent(safe)}` : href;
};
