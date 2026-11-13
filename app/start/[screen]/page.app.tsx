import { Suspense } from "react";
import { START_SCREENS } from "@/lib/account/onboardingRoutes";
import { AppStartScreen } from "@/components/app/AppOnboarding";

/** App → the signed-out sign-up / log-in / password screens (one file per screen, since the app is packaged). */
export function generateStaticParams() {
  return START_SCREENS.map((screen) => ({ screen }));
}

export default async function AppStartPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  return <Suspense><AppStartScreen screen={screen} /></Suspense>;
}
