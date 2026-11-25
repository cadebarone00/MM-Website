import { Redirect } from "expo-router";
import { useAuth } from "~/lib/auth.tsx";
import { screenForStep } from "~/lib/onboardingFlow.ts";

/** Carry on (website /onboarding): the signed-in account's first unfinished step, worked out by the server. */
export default function OnboardingResume() {
  const { step } = useAuth();
  const screen = screenForStep(step ?? "error");
  return <Redirect href={screen === "play" ? "/" : screen} />;
}
