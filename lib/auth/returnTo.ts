/**
 * Where to send someone after login / signup. Only the exact website dashboard and Golf Trip/tournament invite pages are allowed (exact same-site paths), so
 * the `next` parameter can never be used to send people to another site or an unexpected page.
 */
const INVITE_PATH = /^\/(golf-trips|tournaments)\/invite\/[A-Za-z0-9_-]{32,200}$/;

export const inviteReturnPath = (value: string | null | undefined): string | null => value && INVITE_PATH.test(value) ? value : null;

/** Exact website destination only; keep the invite-only helper unchanged for existing callers. */
export const authReturnPath = (value: unknown): string | null =>
  typeof value === "string" ? value === "/dashboard" ? value : inviteReturnPath(value) : null;

export const withReturnTo = (href: string, next: string | null): string => {
  const safe = authReturnPath(next);
  return safe ? `${href}?next=${encodeURIComponent(safe)}` : href;
};
