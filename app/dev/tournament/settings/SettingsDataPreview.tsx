"use client";

import { useSimulator } from "@/components/dev/SimulatorBridge";
import { GolfTripSettingsPreview } from "@/components/platform/GolfTripSettingsPreview";
import { simulatorTripData, type SimulatorTripData } from "@/lib/dev/golfTripSimulatorData";

export function SettingsDataPreview({ mock, maroon }: { mock: SimulatorTripData; maroon: SimulatorTripData }) {
  const simulator = useSimulator();
  const data = simulator ? simulatorTripData(mock, maroon, simulator) : maroon;
  return <GolfTripSettingsPreview tripName={data.preview?.tripName || "Your Golf Trip"} />;
}
