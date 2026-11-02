import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BirthdayScreen } from "@/components/onboarding/OnboardingScreens";
import { AGE_PASS_COOKIE } from "@/lib/auth/agePass";
import { AuthLinkResultPreview } from "@/components/dev/auth/AuthLinkResultPreview";
import { CodeScreen } from "@/components/onboarding/CodeScreen";
import { ForgotScreen, PasswordScreen } from "@/components/onboarding/PasswordScreens";
import { LogInScreen, SignUpScreen } from "@/components/onboarding/StartScreens";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { ONBOARDING, START, START_SCREENS, type StartScreen } from "@/lib/account/onboardingRoutes";
import { getAccountLifecycle } from "@/lib/profile/currentProfile";
import { oauthErrorMessage } from "@/lib/auth/oauth";
import { enabledOAuthProviders } from "@/lib/auth/oauthServer";
import { authReturnPath } from "@/lib/auth/returnTo";

export const metadata = { title: "The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Pending accounts Phase 6: the signed-out screens of the real sign-up / log-in / password-reset flow (public in
 * lib/account/accessPolicy.ts). Hidden unless MAROON_V2_ONBOARDING=on. Email Confirmed and Set a new password need the
 * session the code (or the email link) just created; without one they send the person to Log in / Forgot password.
 */
export default async function StartScreenPage({ params, searchParams }: {
  params: Promise<{ screen: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!onboardingEnabled()) notFound();
  const { screen } = await params;
  if (!START_SCREENS.includes(screen as StartScreen)) notFound();
  const query = await searchParams;
  // G4 birthday-first: Sign up and Create password need the age pass from the Birthday screen. This redirect is only for
  // the person on the screens; the sign-up API and Supabase's Before User Created hook are what enforce it.
  const hasAgePass = Boolean((await cookies()).get(AGE_PASS_COOKIE)?.value);
  switch (screen as StartScreen) {
    case "birthday": return <BirthdayScreen start />;
    // No Apple / Google on Sign up during the beta (owner decision 2026-10-30): new accounts are email only.
    case "sign-up": if (!hasAgePass) redirect(START.birthday); return <SignUpScreen providers={[]} />;
    case "password": if (!hasAgePass) redirect(START.birthday); return <PasswordScreen kind="create" />;
    case "verify": return <CodeScreen kind="signup" />;
    case "confirmed": {
      const lifecycle = await getAccountLifecycle();
      if (query.error || lifecycle.state === "signed-out") redirect(`${START.logIn}?error=invalid_link`);
      return <AuthLinkResultPreview nextHref={ONBOARDING.resume} />;
    }
    case "log-in": {
      const notice = query.reset === "1" ? "Password saved. Log in with your new password."
        : query.error === "invalid_link" ? "That link didn't work or has expired. Log in, or ask for a new code."
        : oauthErrorMessage(query.error); // Google / Apple cancelled, unavailable or failed (fixed words only)
      return <LogInScreen notice={notice} providers={await enabledOAuthProviders()} returnTo={authReturnPath(query.next)} />;
    }
    case "forgot": return <ForgotScreen />;
    case "reset-code": return <CodeScreen kind="recovery" />;
    case "reset-password": {
      const lifecycle = await getAccountLifecycle();
      if (query.error || lifecycle.state === "signed-out") redirect(START.forgot);
      return <PasswordScreen kind="reset" returnTo={authReturnPath(query.next)} />;
    }
  }
}
