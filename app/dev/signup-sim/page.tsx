import { SignUpSimulation } from "@/components/dev/SignUpSimulation";

export const metadata = { title: "Sign-up simulation", robots: { index: false, follow: false } };

/** DEV ONLY (app/dev/layout.tsx hides /dev outside development): the Sign-up Simulator, project_specs.md "Sign-up Simulator". */
export default function SignUpSimulationPage() {
  return <SignUpSimulation />;
}
