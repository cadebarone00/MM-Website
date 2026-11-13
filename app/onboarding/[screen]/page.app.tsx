import { ONBOARDING_SCREENS } from "@/lib/account/onboardingRoutes";
import { AppOnboardingScreen } from "@/components/app/AppOnboarding";

/** App → the signed-in onboarding steps (Name, Birthday, Photo, Settings, Profile Created). */
export function generateStaticParams() {
  return ONBOARDING_SCREENS.map((screen) => ({ screen }));
}

export default async function AppOnboardingPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  return <AppOnboardingScreen screen={screen} />;
}
