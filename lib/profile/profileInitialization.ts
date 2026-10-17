import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ProfileId } from "./profileIdentity";
import type { ProfileSetupInput } from "./profileEdit";

/**
 * Accounts V2 (supabase/profile_initialization.sql): the ONE pathway that creates a profile, kept separate from
 * authentication. Signing up only makes a login; a profile is made the first time a VERIFIED account is initialized:
 * after login, after an email / OAuth callback, from Finish setup, from a Golf Trip invite, or by any client (the iOS
 * app) calling POST /api/account/initialize. Every call is safe to repeat. The account id always comes from a verified
 * session (web cookie or `Authorization: Bearer <access token>`), never from a request body. Nothing here ever deletes
 * an account.
 */
export type InitializeResult =
  | { status: "ok"; created: boolean; complete: boolean; claimedPlayer: string | null }
  | { status: "signed-out" }
  | { status: "unverified" }
  /** profile_initialization.sql isn't installed yet. */
  | { status: "unavailable" }
  | { status: "failed" };

export type SetupResult =
  | { status: "ok"; username: string; created: boolean }
  | { status: "invalid"; error: string }
  | { status: "signed-out" } | { status: "unverified" } | { status: "unavailable" } | { status: "failed" };

const missingFunction = (code?: string) => code === "PGRST202" || code === "42883";

/** The signed-in account for this request: a bearer access token (iOS / other clients) or the web cookie session. */
export async function accountForRequest(request?: Request): Promise<User | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(request?.headers.get("authorization") ?? "")?.[1];
  if (token) {
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user;
  }
  const { data } = await (await createSupabaseServerClient()).auth.getUser();
  return data.user ?? null;
}

/** Create the profile for this (verified) account if it has none; finish an admin player invitation bound to it. */
export async function initializeProfile(accountId: string): Promise<InitializeResult> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("initialize_my_profile", { p_account: accountId });
  if (error) {
    if (/Verify your email/.test(error.message)) return { status: "unverified" };
    if (/No account/.test(error.message)) return { status: "signed-out" };
    if (missingFunction(error.code)) return { status: "unavailable" };
    console.error("initialize_my_profile failed:", error.message);
    return { status: "failed" };
  }
  const reply = (data ?? {}) as { created?: unknown; complete?: unknown; claimedPlayer?: unknown };
  return { status: "ok", created: reply.created === true, complete: reply.complete === true,
    claimedPlayer: typeof reply.claimedPlayer === "string" ? reply.claimedPlayer : null };
}

/** POST /api/account/initialize and every other caller that has a request in hand. */
export async function initializeCurrentProfile(request?: Request): Promise<InitializeResult> {
  const account = await accountForRequest(request);
  return account ? initializeProfile(account.id) : { status: "signed-out" };
}

/** Best effort after a successful sign-in: never blocks the sign-in itself (Finish setup recovers anything missed). */
export async function initializeAfterSignIn(accountId: string | undefined | null): Promise<void> {
  if (!accountId) return;
  const result = await initializeProfile(accountId).catch(() => ({ status: "failed" }) as const);
  if (result.status === "failed") console.error("Profile initialization after sign-in failed; Finish setup will retry.");
}

/** Finish setup: make sure the profile row exists, then set name + username (only while incomplete). */
export async function finishProfileSetup(accountId: ProfileId, input: ProfileSetupInput): Promise<SetupResult> {
  const initialized = await initializeProfile(accountId);
  if (initialized.status !== "ok") return { status: initialized.status };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("complete_my_profile", { p_profile: accountId, p_input: input });
  if (error) {
    if (error.code === "22023") return { status: "invalid", error: error.message };
    if (missingFunction(error.code)) return { status: "unavailable" };
    console.error("complete_my_profile failed:", error.message);
    return { status: "failed" };
  }
  const reply = (data ?? {}) as { username?: unknown; changed?: unknown };
  return typeof reply.username === "string" ? { status: "ok", username: reply.username, created: reply.changed === true } : { status: "failed" };
}
