import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { legacyAuthRedirect } from "@/lib/account/legacyAuthRedirect";
import { authReturnPath } from "@/lib/auth/returnTo";
import { enabledOAuthProviders } from "@/lib/auth/oauthServer";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const { code, next } = await searchParams;
  // MAROON_V2_ONBOARDING=on: the V2 sign-up screen replaces this page (lib/account/legacyAuthRedirect.ts).
  if (onboardingEnabled()) redirect(legacyAuthRedirect("/signup", { code, next }, { signedIn: false })!);
  // Website dashboard and existing invite returns are validated before reaching the signup form.
  return <SignUpForm initialCode={code} returnTo={authReturnPath(next)} providers={await enabledOAuthProviders()} />;
}
