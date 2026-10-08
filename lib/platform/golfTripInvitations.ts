/**
 * Golf Trip invitations (supabase/golf_trip_invitations.sql). An invitation is the invited person's member row,
 * waiting with no profile until they accept while signed in; their profile is then attached to that same row.
 * The organizer only ever gives a name and an optional email (contact info, never identity — no profile is
 * looked up by it). The invite link's secret is made on the server; only its hash is stored.
 */

export interface InviteInput { displayName: string; email: string | null }

export function inviteInputFromBody(body: unknown): { ok: true; input: InviteInput } | { ok: false; error: string } {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const name = typeof record?.displayName === "string" ? record.displayName.trim() : "";
  if (!name || name.length > 120) return { ok: false, error: "Add the person's name." };
  const rawEmail = typeof record?.email === "string" ? record.email.trim().toLowerCase() : "";
  if (rawEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) return { ok: false, error: "That email doesn't look right." };
  return { ok: true, input: { displayName: name, email: rawEmail || null } };
}

/** The secret in an invite link: 32–200 URL-safe characters. */
export const isInviteToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{32,200}$/.test(value);

export type AcceptInvitationResult =
  | { status: "accepted" | "already_member"; tripId: string }
  /** Someone else already accepted this invitation. */
  | { status: "claimed" }
  /** Unknown or cancelled invitation. */
  | { status: "not_found" };

export function acceptResultFromJson(value: unknown): AcceptInvitationResult {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if ((record.status === "accepted" || record.status === "already_member") && typeof record.tripId === "string") return { status: record.status, tripId: record.tripId };
  if (record.status === "claimed") return { status: "claimed" };
  return { status: "not_found" };
}

/** What an invite link may show its holder (never the invited email). */
export interface InvitationPreview {
  tripId: string; tripName: string; destination: string | null; startDate: string | null; endDate: string | null;
  invitedName: string; organizerName: string | null;
  status: "open" | "yours" | "already_member" | "claimed";
}

export function invitationPreviewFromJson(value: unknown): InvitationPreview | null {
  const r = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const text = (v: unknown) => typeof v === "string" ? v : null;
  if (!r || !text(r.tripId) || !text(r.tripName) || !text(r.invitedName) || !["open", "yours", "already_member", "claimed"].includes(String(r.status))) return null;
  return {
    tripId: r.tripId as string, tripName: r.tripName as string, destination: text(r.destination), startDate: text(r.startDate), endDate: text(r.endDate),
    invitedName: r.invitedName as string, organizerName: text(r.organizerName), status: r.status as InvitationPreview["status"],
  };
}

export type DeclineInvitationResult = "declined" | "already_member" | "not_found";

export function declineResultFromJson(value: unknown): DeclineInvitationResult {
  const status = value && typeof value === "object" ? (value as Record<string, unknown>).status : null;
  return status === "declined" || status === "already_member" ? status : "not_found";
}

/** The page an invite link opens (the secret is part of the link; it's never shown on its own). */
export const golfTripInvitePath = (token: string) => `/golf-trips/invite/${token}`;
