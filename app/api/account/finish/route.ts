import { apiError, blockedLifecycle, finishReply } from "@/lib/account/onboardingApi";
import { ACTIVATION_MARKER_COOKIE, activationIsFresh, markerCookieOptions } from "@/lib/account/activationMarker";
import { accountIdOf, callerLifecycle, crossSiteCookieRequest, logFailure, reply, replyError, service } from "@/lib/account/onboardingApiServer";

/**
 * POST /api/account/finish — no body (Pending accounts Phase 3). The ONLY way to activate a golfer profile: calls the
 * atomic, idempotent activate_my_profile() for the signed-in account, which checks verification, name, username,
 * birthday (13+), privacy setting and the CURRENT Terms/Privacy versions, then accepts held invitations.
 * Success is reported only when the database activated the profile AND the lifecycle read back afterwards is "active".
 * While the activation switch is off (Phase 1 default) every call answers 503 activation_disabled; progress is kept.
 * Website success also sets the one-time Profile Created marker (lib/account/activationMarker.ts) — only when this
 * account's activation is under 10 minutes old, so a Finish repeated long after activation never earns a success screen.
 */
export async function POST(request: Request) {
  const crossSite = crossSiteCookieRequest(request);
  if (crossSite) return replyError(crossSite);
  const caller = await callerLifecycle(request);
  if ("error" in caller) return replyError(caller.error);
  if (caller.lifecycle.state === "active_needs_birthday") {
    return replyError(apiError(409, "incomplete", "Add your birthday to continue.", { missing: ["birthday"] }));
  }
  const blocked = blockedLifecycle(caller.lifecycle, ["pending", "active"]);
  if (blocked) return replyError(blocked);
  const accountId = accountIdOf(caller.lifecycle)!;

  const db = service();
  const { data, error } = await db.rpc("activate_my_profile", { p_account: accountId });
  if (error && error.code !== "55000") logFailure("finish", error);
  let confirmed: string | null = null;
  if (!error && (data as { activated?: unknown } | null)?.activated === true) {
    const check = await db.rpc("account_lifecycle_state", { p_account: accountId });
    confirmed = typeof check.data === "string" ? check.data : null;
  }
  const result = finishReply(error, data, confirmed);
  const response = reply(result.status, result.body);
  if (result.status === 200 && !request.headers.get("authorization")) {
    const { data: row } = await db.from("profiles").select("activated_at").eq("id", accountId).maybeSingle();
    const activatedAt = (row as { activated_at?: string | null } | null)?.activated_at;
    if (activatedAt && activationIsFresh(activatedAt, Date.now())) {
      response.cookies.set(ACTIVATION_MARKER_COOKIE, activatedAt, markerCookieOptions(new URL(request.url).protocol === "https:"));
    }
  }
  return response;
}
