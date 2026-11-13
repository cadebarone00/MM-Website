import { redirect } from "next/navigation";
import { AccountStatusView } from "@/components/auth/AccountStatusView";
import { getAccountLifecycle } from "@/lib/profile/currentProfile";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { currentOnboardingStep } from "@/lib/account/onboardingResume";
import { stepPath } from "@/lib/account/onboardingRoutes";

export const metadata = { title: "Your account | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where account enforcement (Pending accounts Phase 5; middleware.ts) sends a signed-in account that can't use a page
 * yet. Never gated itself (lib/account/accessPolicy.ts "account"), so it can't loop. Shows nothing private: no birthday,
 * age or reason. With the real onboarding screens switched on (MAROON_V2_ONBOARDING=on, Phase 6) a Pending account, or
 * an Active one that still needs its birthday, is sent straight to its next step instead of reading about it; blocked
 * states keep their message here. `?reason=ineligible` shows the under-13 message after the Birthday step signed out.
 */
export default async function AccountStatusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v2 = onboardingEnabled();
  const { lifecycle, step } = v2 ? await currentOnboardingStep() : { lifecycle: await getAccountLifecycle(), step: null };
  if (v2 && step && (lifecycle.state === "pending" || lifecycle.state === "active_needs_birthday")) redirect(stepPath(step));
  const ineligibleNotice = (await searchParams).reason === "ineligible";
  return <AccountStatusView state={lifecycle.state} ineligibleNotice={ineligibleNotice} v2={v2} />;
}
