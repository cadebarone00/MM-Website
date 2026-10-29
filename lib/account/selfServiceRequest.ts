import "server-only";
import { NextResponse } from "next/server";
import { getAccountLifecycleForRequest, getCurrentProfileForRequest, type CurrentProfile } from "@/lib/profile/currentProfile";
import { apiError, blockedLifecycle } from "./onboardingApi";
import { crossSiteCookieRequest, replyError } from "./onboardingApiServer";

/**
 * Phase 7B — who is calling an account self-service API (name/username, photo, privacy, Golf Trip invitation answers),
 * for the website (cookie) AND the iOS / Android app (`Authorization: Bearer <access token>`):
 * - identity comes only from the verified session (lib/supabase/requestIdentity.ts): an invalid, expired or revoked
 *   token, or a cookie for one account sent with another account's token, is treated as signed out. Nothing in the
 *   request body can choose the account or profile.
 * - cookie requests from another site are refused (the same check as the Phase 3 account APIs); Bearer requests are
 *   not browser-initiated, so no Origin rule applies to them.
 * - Ineligible (under 13), under-review and closed accounts are refused (403) wherever the lifecycle foundation is
 *   installed, whether or not enforcement is switched on; without the foundation the routes behave as before.
 * - every reply is private and never cached.
 */
export const NO_STORE = { "Cache-Control": "private, no-store" };
export const privateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function selfServiceCaller(request: Request): Promise<{ current: CurrentProfile } | { error: NextResponse }> {
  const crossSite = crossSiteCookieRequest(request);
  if (crossSite) return { error: withNoStore(replyError(crossSite)) };
  let current: CurrentProfile;
  try {
    current = await getCurrentProfileForRequest(request);
  } catch {
    return { error: privateJson({ ok: false, code: "unavailable", error: "We couldn't check your account. Try again." }, 503) };
  }
  if (current.status === "signed-out") return { current };
  try {
    const lifecycle = await getAccountLifecycleForRequest(request);
    if (lifecycle.state === "unavailable" && lifecycle.reason !== "foundation_missing") {
      return { error: privateJson({ ok: false, code: "unavailable", error: "We couldn't check your account. Try again." }, 503) };
    }
    const blocked = blockedLifecycle(lifecycle, ["pending", "active", "active_needs_birthday", "unavailable", "signed-out"]);
    if (blocked) return { error: withNoStore(replyError(blocked)) };
  } catch {
    return { error: withNoStore(replyError(apiError(503, "unavailable", "We couldn't check your account. Try again."))) };
  }
  return { current };
}

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return response;
}
