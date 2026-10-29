import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getAccountLifecycleForRequest, type AccountLifecycle } from "@/lib/profile/currentProfile";
import { apiError, originMatchesHost, type ApiError } from "./onboardingApi";

/**
 * Pending accounts Phase 3 — server plumbing shared by the onboarding APIs. The account ALWAYS comes from the verified
 * session (web cookie or `Authorization: Bearer`, via getAccountLifecycleForRequest); request bodies never choose it.
 * Database calls use the service role because the Phase 1 functions are granted to it only.
 */

export const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const replyError = (e: ApiError) => reply(e.status, e.body);

/** The caller's lifecycle, or a 503 when it can't be read safely (never Active, never another account). */
export async function callerLifecycle(request: Request): Promise<{ lifecycle: AccountLifecycle } | { error: ApiError }> {
  try {
    return { lifecycle: await getAccountLifecycleForRequest(request) };
  } catch {
    return { error: apiError(503, "unavailable", "We couldn't check your account. Try again.") };
  }
}

/** The signed-in account id for an allowed lifecycle (every allowed state carries one). */
export const accountIdOf = (lifecycle: AccountLifecycle) => ("account" in lifecycle ? lifecycle.account.id : null);

/**
 * Cookie sessions must come from our own pages: a browser POST carrying our cookies from another site is refused.
 * App requests (Bearer token, no cookies involved) aren't browser-initiated cross-site requests, so they're allowed.
 */
export function crossSiteCookieRequest(request: Request): ApiError | null {
  if (request.headers.get("authorization")) return null;
  const origin = request.headers.get("origin");
  if (!origin) return null;
  // The Host the browser sent (and a proxy's forwarded host) is what the page was loaded from; request.url alone can
  // name a different host under the Next server (found 2026-10-29: every real-browser POST was refused). A cross-site
  // page can't change Host or add X-Forwarded-Host without a CORS preflight, so these stay safe to compare against.
  const hosts = [request.headers.get("host"), request.headers.get("x-forwarded-host"), new URL(request.url).host];
  if (originMatchesHost(origin, hosts)) return null;
  return apiError(403, "cross_site", "That request can't be made from another site.");
}

export const service = () => createSupabaseServiceRoleClient();

/** The caller's access token: the app's Bearer token, or the web session's (cookie) token. */
export async function callerAccessToken(request: Request): Promise<string | null> {
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (bearer) return bearer;
  const { data } = await (await createSupabaseServerClient()).auth.getSession();
  return data.session?.access_token ?? null;
}

/** Clear this browser's session cookies (no-op for app requests, which hold their own tokens). Never throws. */
export async function signOutThisBrowser(request: Request): Promise<void> {
  if (request.headers.get("authorization")) return;
  await (await createSupabaseServerClient()).auth.signOut({ scope: "local" }).catch(() => undefined);
}

/** Never log private values: just which operation failed and the database's error code. */
export function logFailure(operation: string, error: { code?: string } | null) {
  if (error) console.error(`account API ${operation} failed:`, error.code ?? "unknown");
}
