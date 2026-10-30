import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { legacyAuthRedirect } from "@/lib/account/legacyAuthRedirect";
import { getAccountLifecycle } from "@/lib/profile/currentProfile";

import { authReturnPath } from "@/lib/auth/returnTo";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (onboardingEnabled()) {
    // MAROON_V2_ONBOARDING=on: a recovery session or a bad link goes to the V2 screens; with no session the legacy form
    // stays, because Admin invite links carry their tokens in the #fragment (lib/account/legacyAuthRedirect.ts).
    const signedIn = (await getAccountLifecycle()).state !== "signed-out";
    const to = legacyAuthRedirect("/reset-password", { next, error }, { signedIn });
    if (to) redirect(to);
  }
  return <ResetPasswordForm returnTo={authReturnPath(next)} />;
}
