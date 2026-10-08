/**
 * Where to send someone after login / signup. Only Golf Trip invite pages are allowed (an exact same-site path), so
 * the `next` parameter can never be used to send people to another site or an unexpected page.
 */
const INVITE_PATH = /^\/golf-trips\/invite\/[A-Za-z0-9_-]{32,200}$/;

export const inviteReturnPath = (value: string | null | undefined): string | null => value && INVITE_PATH.test(value) ? value : null;

export const withReturnTo = (href: string, next: string | null): string => next ? `${href}?next=${encodeURIComponent(next)}` : href;
