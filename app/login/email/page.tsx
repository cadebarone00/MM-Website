import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { legacyAuthRedirect } from "@/lib/account/legacyAuthRedirect";
import { AuthLayout } from "@/components/auth/AuthLayout";

import { authReturnPath } from "@/lib/auth/returnTo";

export default async function EmailLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // MAROON_V2_ONBOARDING=on: the V2 log-in screen replaces this page (lib/account/legacyAuthRedirect.ts).
  if (onboardingEnabled()) redirect(legacyAuthRedirect("/login/email", { next }, { signedIn: false })!);
  return <AuthLayout><LoginForm returnTo={authReturnPath(next)} /></AuthLayout>;
}
