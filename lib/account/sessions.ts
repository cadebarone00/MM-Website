import "server-only";
import { createClient } from "@supabase/supabase-js";
import { accountForRequest } from "@/lib/profile/profileInitialization";

/**
 * Settings → Account → Devices (Accounts V2, phase A4): sign out of OTHER devices, or EVERYWHERE.
 * - Who: the verified session (cookie or bearer); nothing in the body names an account.
 * - Recent authentication: the account password, checked by Supabase for that account's own email. A session alone
 *   (possibly stolen) can't do this. Accounts with no password (email-link only) can't yet: launch blocker,
 *   docs/account-sessions-2026-10-19.md.
 * - "others": every session except a fresh one for this device (the caller keeps working on it: the route swaps the
 *   web cookies or hands a native app its new tokens). "global": every session, this device's too.
 * Revoked sessions' access tokens stop working at once (supabase/account_deletion.sql session_is_revoked).
 */
export type SessionScope = "others" | "global";
export type SessionsResult =
  | { status: "ok"; scope: SessionScope; session: { access_token: string; refresh_token: string } | null }
  | { status: "signed-out" }
  | { status: "reauth-required" }
  | { status: "wrong-password" }
  | { status: "rate-limited" }
  | { status: "failed" };

export async function signOutDevices(request: Request, scope: SessionScope, password: unknown): Promise<SessionsResult> {
  const account = await accountForRequest(request);
  if (!account) return { status: "signed-out" };
  if (typeof password !== "string" || !password) return { status: "reauth-required" };
  if (!account.email) return { status: "reauth-required" };
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const proof = await client.auth.signInWithPassword({ email: account.email, password });
  if (proof.error || !proof.data.session) return { status: proof.error?.status === 429 ? "rate-limited" : "wrong-password" };
  if (proof.data.user?.id !== account.id) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { status: "signed-out" };
  }
  const { error } = await client.auth.signOut({ scope });
  if (error) return { status: "failed" };
  if (scope === "global") return { status: "ok", scope, session: null };
  const { data: { session } } = await client.auth.getSession();
  return session ? { status: "ok", scope, session: { access_token: session.access_token, refresh_token: session.refresh_token } } : { status: "failed" };
}
