import { notFound, redirect } from "next/navigation";
import { AuthLinkResultPreview } from "@/components/dev/auth/AuthLinkResultPreview";
import { CodeScreen } from "@/components/onboarding/CodeScreen";
import { ForgotScreen, PasswordScreen } from "@/components/onboarding/PasswordScreens";
import { LogInScreen, SignUpScreen } from "@/components/onboarding/StartScreens";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { ONBOARDING, START, START_SCREENS, type StartScreen } from "@/lib/account/onboardingRoutes";
import { getAccountLifecycle } from "@/lib/profile/currentProfile";

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
  switch (screen as StartScreen) {
    case "sign-up": return <SignUpScreen />;
    case "password": return <PasswordScreen kind="create" />;
    case "verify": return <CodeScreen kind="signup" />;
    case "confirmed": {
      const lifecycle = await getAccountLifecycle();
      if (query.error || lifecycle.state === "signed-out") redirect(`${START.logIn}?error=invalid_link`);
      return <AuthLinkResultPreview nextHref={ONBOARDING.resume} />;
    }
    case "log-in": {
      const notice = query.reset === "1" ? "Password saved. Log in with your new password."
        : query.error === "invalid_link" ? "That link didn't work or has expired. Log in, or ask for a new code." : null;
      return <LogInScreen notice={notice} />;
    }
    case "forgot": return <ForgotScreen />;
    case "reset-code": return <CodeScreen kind="recovery" />;
    case "reset-password": {
      const lifecycle = await getAccountLifecycle();
      if (query.error || lifecycle.state === "signed-out") redirect(START.forgot);
      return <PasswordScreen kind="reset" />;
    }
  }
}
