import { notFound, redirect } from "next/navigation";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { currentOnboardingStep } from "@/lib/account/onboardingResume";
import { START, STATUS, stepPath } from "@/lib/account/onboardingRoutes";

export const dynamic = "force-dynamic";

/** Pending accounts Phase 6: "carry on" — sends the signed-in account to its first unfinished step (worked out on the
 *  server from saved data). Hidden unless MAROON_V2_ONBOARDING=on. */
export default async function OnboardingResumePage() {
  if (!onboardingEnabled()) notFound();
  const { lifecycle, step } = await currentOnboardingStep();
  if (lifecycle.state === "signed-out") redirect(START.logIn);
  redirect(step ? stepPath(step) : STATUS);
}
