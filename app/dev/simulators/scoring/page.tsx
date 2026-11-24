import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimulatorConsole } from "@/components/dev/simulators/SimulatorConsole";
import { SAMPLE_COURSES } from "@/lib/dev/sim/studio/courses";
import { PRESETS } from "@/lib/dev/sim/studio/setup";

export const metadata: Metadata = { title: "Scoring simulator | The Maroon", robots: { index: false, follow: false } };

/**
 * DEV ONLY: the Simulator Studio (npm run sim). Frames the pretend phones, sets up a round, plays the steps, and shows the
 * live Checks and What happened log. Only plain sample data (presets and sample courses) goes to the browser; the scenario
 * code that pulls in the database is never loaded there.
 */
export default function ScoringSimulatorPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SimulatorConsole presets={PRESETS} courses={SAMPLE_COURSES} />;
}
