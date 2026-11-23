import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimulatorConsole } from "@/components/dev/simulators/SimulatorConsole";
import { SCENARIOS } from "@/lib/dev/sim/scenarios";

export const metadata: Metadata = { title: "Scoring simulator | The Maroon", robots: { index: false, follow: false } };

/**
 * DEV ONLY: control page for the scoring simulator (npm run sim). Frames the pretend phones, picks a scenario, resets,
 * and shows the live Checks and What happened log. The scenario list is read here, on the server, so the browser never
 * loads the scenario code (which pulls in the database).
 */
export default function ScoringSimulatorPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SimulatorConsole scenarios={SCENARIOS.map(({ id, label, feature }) => ({ id, label, feature }))} />;
}
