"use client";

import { useSimulator } from "@/components/dev/SimulatorBridge";
import { GolfTripSettingsPreview } from "@/components/platform/GolfTripSettingsPreview";
import { getPlayerDisplayName } from "@/lib/data/players";
import { simulatorTripData, type SimulatorTripData } from "@/lib/dev/golfTripSimulatorData";

export function SettingsDataPreview({ mock, maroon }: { mock: SimulatorTripData; maroon: SimulatorTripData }) {
  const simulator = useSimulator();
  const data = simulator ? simulatorTripData(mock, maroon, simulator) : maroon;
  const preview = data.preview;
  // Players who have joined, from the tournament roster; the rest of the expected count shows as open spots.
  const players = [preview?.rosterMaroon, preview?.rosterWhite].flatMap(list => (list ?? "").split(",")).map(slug => slug.trim()).filter(Boolean).map(getPlayerDisplayName);
  return <GolfTripSettingsPreview tripName={preview?.tripName || "Your Golf Trip"} playerCount={Number(preview?.playerCount) || 0} players={players} />;
}
