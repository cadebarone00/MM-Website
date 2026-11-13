/**
 * Trip Builder's shareable trip link (supabase/golf_trip_join_links.sql): /golf-trips/join/<code>. Anyone on the
 * trip can copy it; anyone who opens it can sign up and join. A link lasts 30 minutes. Safe to import on the client.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isJoinCode = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(value);
/** The trip's 6-character invite code (supabase/join_codes.sql), which doesn't expire, as stored. */
export const isTripInviteCode = (value: unknown): value is string => typeof value === "string" && /^[A-HJKMNP-Z2-9]{6}$/.test(value);
/** What the trip's join page takes: the 30-minute link's code, or the 6-character invite code (typed in any case, with or without a dash). */
export function tripJoinValue(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^[A-Za-z0-9_-]{24,64}$/.test(value)) return value;
  const code = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return isTripInviteCode(code) ? code : null;
}

/** 24 random bytes as base64url: 32 characters. Made on the server; the database only checks the format. */
export function newJoinCode(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const golfTripJoinPath = (code: string) => `/golf-trips/join/${code}`;

export type JoinPreview = {
  tripId: string; tripName: string; destination: string; startDate: string; endDate: string;
  organizerName: string | null; status: "member" | "open" | "expired";
};
export type JoinLink = { code: string; url: string; expiresAt: string };
export type JoinResult = { status: "joined" | "already_member"; tripId: string } | { status: "expired" | "not_found" };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const str = (value: unknown): value is string => typeof value === "string";

export function joinPreviewFromJson(value: unknown): JoinPreview | null {
  const r = record(value);
  if (!r || !str(r.tripId) || !UUID.test(r.tripId) || !str(r.tripName) || !str(r.destination) || !str(r.startDate) || !str(r.endDate)) return null;
  if (!(r.organizerName === null || r.organizerName === undefined || str(r.organizerName))) return null;
  if (r.status !== "member" && r.status !== "open" && r.status !== "expired") return null;
  return { tripId: r.tripId, tripName: r.tripName, destination: r.destination, startDate: r.startDate, endDate: r.endDate,
    organizerName: (r.organizerName as string | null | undefined) ?? null, status: r.status };
}

export function joinResultFromJson(value: unknown): JoinResult {
  const r = record(value);
  if ((r?.status === "joined" || r?.status === "already_member") && str(r.tripId) && UUID.test(r.tripId)) return { status: r.status, tripId: r.tripId };
  if (r?.status === "expired") return { status: "expired" };
  return { status: "not_found" };
}

/** The RPC's { code, expiresAt } plus the absolute link for `origin` (e.g. https://maroon.app). */
export function joinLinkFromJson(value: unknown, origin: string): JoinLink | null {
  const r = record(value);
  if (!r || !isJoinCode(r.code) || !str(r.expiresAt)) return null;
  return { code: r.code, url: `${origin}${golfTripJoinPath(r.code)}`, expiresAt: r.expiresAt };
}

/** True when there's no link to show, or it has 5 minutes or less left (the server then hands out a fresh one). */
export function linkNeedsRefresh(link: JoinLink | null, now: number): boolean {
  const expires = link ? Date.parse(link.expiresAt) : NaN;
  return !Number.isFinite(expires) || expires - now <= 5 * 60_000;
}
