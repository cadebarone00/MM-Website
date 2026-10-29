import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ProfileCreatedScreen } from "@/components/onboarding/ProfileCreatedScreen";
import { BirthdayScreen, NameScreen, PhotoScreen, SettingsScreen } from "@/components/onboarding/OnboardingScreens";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { currentOnboardingStep } from "@/lib/account/onboardingResume";
import { ONBOARDING_SCREENS, PLAY, START, STATUS, onboardingRedirect, type OnboardingScreen } from "@/lib/account/onboardingRoutes";
import { ACTIVATION_MARKER_COOKIE, markerMatchesNow } from "@/lib/account/activationMarker";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const metadata = { title: "The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Pending accounts Phase 6: the signed-in onboarding steps (Name, Birthday, Photo, Settings → Finish, Profile Created).
 * The server works out the account's step on every visit and only shows the screen that step allows
 * (lib/account/onboardingRoutes.ts): no skipping ahead, no going back to write-once steps, and Profile Created only for
 * an account the server confirms Active that is carrying the one-time marker from its own Finish (Phase 7A); any other
 * Active visit goes to Play. Hidden unless MAROON_V2_ONBOARDING=on.
 */
export default async function OnboardingScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  if (!onboardingEnabled()) notFound();
  const { screen } = await params;
  if (!ONBOARDING_SCREENS.includes(screen as OnboardingScreen)) notFound();
  const { lifecycle, step } = await currentOnboardingStep();
  if (lifecycle.state === "signed-out") redirect(START.logIn);
  if (!step) redirect(STATUS);
  const elsewhere = onboardingRedirect(screen as OnboardingScreen, step);
  if (elsewhere) redirect(elsewhere);
  switch (screen as OnboardingScreen) {
    case "name": return <NameScreen />;
    case "birthday": return <BirthdayScreen />;
    case "photo": return <PhotoScreen />;
    case "settings": return <SettingsScreen needsTerms={step === "terms"} />;
    case "created": {
      const marker = (await cookies()).get(ACTIVATION_MARKER_COOKIE)?.value;
      if (!marker || !("account" in lifecycle)) redirect(PLAY);
      const { data } = await createSupabaseServiceRoleClient().from("profiles").select("activated_at").eq("id", lifecycle.account.id).maybeSingle();
      if (!markerMatchesNow(marker, (data as { activated_at?: string | null } | null)?.activated_at)) redirect(PLAY);
      return <ProfileCreatedScreen />;
    }
  }
}
