import { apiError, blockedLifecycle, correctionReasonFromBody, correctionReply } from "@/lib/account/onboardingApi";
import { accountIdOf, callerLifecycle, crossSiteCookieRequest, logFailure, reply, replyError, service } from "@/lib/account/onboardingApiServer";

/**
 * POST /api/account/birthday-correction — { reason } (Pending accounts Phase 3). Asks support to correct the signed-in
 * account's OWN birthday. It never changes the date: an admin decides through admin_correct_birthdate (a separate,
 * authorized operation). One open request at a time and at most 3 in 30 days (database-enforced). Allowed for
 * Ineligible accounts — the main reason it exists — but not for closed ones. Replies never include the stored birthday.
 */
export async function POST(request: Request) {
  const crossSite = crossSiteCookieRequest(request);
  if (crossSite) return replyError(crossSite);
  const caller = await callerLifecycle(request);
  if ("error" in caller) return replyError(caller.error);
  const blocked = blockedLifecycle(caller.lifecycle, ["pending", "active", "active_needs_birthday", "ineligible", "restricted"]);
  if (blocked) return replyError(blocked);

  const reason = correctionReasonFromBody(await request.json().catch(() => null));
  if (!reason) return replyError(apiError(400, "invalid_reason", "Tell us what's wrong (up to 500 characters)."));
  const { error } = await service().rpc("request_birthdate_correction", { p_account: accountIdOf(caller.lifecycle)!, p_reason: reason });
  if (error && !/already have an open|too many|no birthday/i.test(error.message ?? "")) logFailure("birthday correction", error);
  const result = correctionReply(error);
  return reply(result.status, result.body);
}
