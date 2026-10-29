import { getAccountLifecycle, type AccountLifecycle } from "@/lib/profile/currentProfile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resumeReply, type OnboardingProgress, type OnboardingStep } from "./onboardingApi";

/**
 * Pending accounts Phase 6: the signed-in account's onboarding step for the real screens (server components), worked
 * out exactly like GET /api/account/onboarding — from saved data, so it survives closing the app or switching device.
 * step = null when it can't be worked out safely (never guessed as Play).
 */
export async function currentOnboardingStep(): Promise<{ lifecycle: AccountLifecycle; step: OnboardingStep | null; activationAvailable: boolean }> {
  const lifecycle = await getAccountLifecycle();
  let progress: OnboardingProgress | null = null;
  if (lifecycle.state === "pending") {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("account_onboarding_progress", { p_account: lifecycle.account.id });
    if (error) console.error("onboarding progress failed:", error.code ?? "");
    else progress = data as OnboardingProgress;
  }
  const result = resumeReply(lifecycle, progress);
  return result.body.ok
    ? { lifecycle, step: result.body.next, activationAvailable: result.body.activationAvailable }
    : { lifecycle, step: result.body.next, activationAvailable: false };
}
