import { resumeReply, type OnboardingProgress } from "@/lib/account/onboardingApi";
import { callerLifecycle, logFailure, reply, replyError, service } from "@/lib/account/onboardingApiServer";

/**
 * GET /api/account/onboarding (Pending accounts Phase 3) — where the signed-in account should go next:
 * { ok, state, next, activationAvailable }. Pending accounts resume at their first unfinished REQUIRED step (worked out
 * from saved data, so it survives closing the app or switching device); Active → "play"; legacy without a birthday →
 * "birthday"; Ineligible / restricted / closed → their blocked screens, never Play. No birthdate or private detail.
 */
export async function GET(request: Request) {
  const caller = await callerLifecycle(request);
  if ("error" in caller) return replyError(caller.error);
  let progress: OnboardingProgress | null = null;
  if (caller.lifecycle.state === "pending") {
    const { data, error } = await service().rpc("account_onboarding_progress", { p_account: caller.lifecycle.account.id });
    if (error) logFailure("onboarding progress", error);
    else progress = data as OnboardingProgress;
  }
  const result = resumeReply(caller.lifecycle, progress);
  return reply(result.status, result.body);
}
