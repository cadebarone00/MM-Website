import { notFound } from "next/navigation";
import { WelcomeScreen } from "@/components/onboarding/StartScreens";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";

export const metadata = { title: "The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Pending accounts Phase 6: Welcome (Sign up / Log in). Hidden unless MAROON_V2_ONBOARDING=on. */
export default function StartPage() {
  if (!onboardingEnabled()) notFound();
  return <WelcomeScreen />;
}
