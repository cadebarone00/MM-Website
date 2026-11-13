import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email/sendEmail";
import { codeInviteEmail, type InviteKind } from "./codeInvites.ts";

/**
 * Invite codes for Play rounds and Golf Trips, and emailing any kind's code (supabase/join_codes.sql). Profile ids
 * always come from the signed-in session — callers pass `user.id`, never a value from the request body. Never import
 * this from a client component. "not_installed" = join_codes.sql hasn't been run in this database yet.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; code: "not_installed" | "refused" | "failed"; message?: string };
export interface RoundLookup { roundId: string; hostName: string; course: string | null; holes: string | null; game: string | null; status: "live" | "ended"; playerCount: number; member: boolean }
export interface TripLookup { tripId: string; tripName: string; destination: string | null; startDate: string | null; endDate: string | null; organizerName: string | null; member: boolean }

const db = () => createSupabaseServiceRoleClient();
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await db().rpc(name, args);
  if (!error) return { ok: true, value: data as T };
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "42703") return { ok: false, code: "not_installed" };
  // 42501 = not allowed, 22023 = bad request: the message is written for players.
  if (error.code === "42501" || error.code === "22023") return { ok: false, code: "refused", message: error.message };
  console.error(`${name} failed:`, error.message);
  return { ok: false, code: "failed" };
}

export const sharedRoundInviteCode = (me: string, round: string) => rpc<string | null>("shared_round_invite_code", { p_profile: me, p_round: round });
export const findSharedRoundByCode = (me: string, code: string) => rpc<RoundLookup | null>("find_shared_round_by_code", { p_profile: me, p_code: code });
export const joinSharedRoundByCode = (me: string, code: string) => rpc<string>("join_shared_round_by_code", { p_profile: me, p_code: code });
export const golfTripInviteCode = (me: string, trip: string) => rpc<string | null>("golf_trip_invite_code", { p_profile: me, p_trip: trip });
export const resetGolfTripInviteCode = (me: string, trip: string) => rpc<string>("reset_golf_trip_invite_code", { p_profile: me, p_trip: trip });
export const findGolfTripByCode = (me: string, code: string) => rpc<TripLookup | null>("find_golf_trip_by_code", { p_profile: me, p_code: code });
export const joinGolfTripByInviteCode = (me: string, code: string) => rpc<string>("join_golf_trip_by_invite_code", { p_profile: me, p_code: code });

export type EmailResult = Result<{ sent: number; skipped: number; notConfigured: boolean }>;

/**
 * Emails the code to each address. The database checks the sender runs it, applies the caps (50 per thing, 200 a day,
 * once an hour per address) and records each send first; without email set up nothing is recorded or sent.
 */
export async function sendCodeInvites(sender: string, kind: InviteKind, item: string, emails: string[], origin: string): Promise<EmailResult> {
  const target = await rpc<{ name: string; code: string; sender: string | null }>("invite_email_target", { p_sender: sender, p_kind: kind, p_item: item });
  if (!target.ok) return target;
  if (!emailConfigured()) return { ok: true, value: { sent: 0, skipped: emails.length, notConfigured: true } };
  const allowed = await rpc<string[]>("record_email_invites", { p_sender: sender, p_kind: kind, p_item: item, p_emails: emails });
  if (!allowed.ok) return allowed;
  const message = codeInviteEmail(kind, target.value, origin);
  let sent = 0;
  for (const to of allowed.value ?? []) if ((await sendEmail({ to, ...message })).ok) sent++;
  return { ok: true, value: { sent, skipped: emails.length - sent, notConfigured: false } };
}
