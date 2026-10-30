import { redirect } from "next/navigation";
import { LoginWelcome } from "@/components/auth/LoginWelcome";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { legacyAuthRedirect } from "@/lib/account/legacyAuthRedirect";

export const metadata = { title: "Log In | The Maroon" };

import { authReturnPath } from "@/lib/auth/returnTo";
import { oauthErrorMessage } from "@/lib/auth/oauth";
import { enabledOAuthProviders } from "@/lib/auth/oauthServer";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  // MAROON_V2_ONBOARDING=on: the V2 log-in screen replaces this page (lib/account/legacyAuthRedirect.ts).
  if (onboardingEnabled()) redirect(legacyAuthRedirect("/login", { next, error }, { signedIn: false })!);
  // error = a Google / Apple sign-in that didn't finish (app/auth/callback); only our own fixed messages are shown.
  return <LoginWelcome returnTo={authReturnPath(next)} providers={await enabledOAuthProviders()} error={oauthErrorMessage(error)} />;
}
