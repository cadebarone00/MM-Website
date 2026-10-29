import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getAccountLifecycleForRequest, type AccountLifecycle } from "@/lib/profile/currentProfile";
import { apiError, type ApiError } from "./onboardingApi";

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
  try {
    if (new URL(origin).host === new URL(request.url).host) return null;
  } catch { /* malformed Origin: refuse below */ }
  return apiError(403, "cross_site", "That request can't be made from another site.");
}

export const service = () => createSupabaseServiceRoleClient();

/** Never log private values: just which operation failed and the database's error code. */
export function logFailure(operation: string, error: { code?: string } | null) {
  if (error) console.error(`account API ${operation} failed:`, error.code ?? "unknown");
}
