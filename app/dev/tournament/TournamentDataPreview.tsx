"use client";

import { useMemo, useState } from "react";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { simulatorTripData, type SimulatorTripData as TripData } from "@/lib/dev/golfTripSimulatorData";
import { DEFAULT_SIMULATOR_STATE } from "@/lib/dev/simulator";
import type { TripWeather } from "@/lib/platform/weather/types";


/** Data selection belongs to the dev route, never to the shared trip UI. */
export function TournamentDataPreview({ mock, maroon, unmapped, embedded = false }: {
  mock: TripData;
  maroon: TripData;
  unmapped: Record<string, unknown>;
  embedded?: boolean;
}) {
  const [view, setView] = useState<"mock" | "maroon">("maroon");
  const simulator = useSimulator();
  const config = simulator ?? { source: view, state: DEFAULT_SIMULATOR_STATE };
  const data = simulatorTripData(mock, maroon, config);
  const weather = useMemo(() => config.state.loading === "weather" ? new Promise<TripWeather>(() => {}) : undefined, [config.state.loading]);
  return <>
    {!simulator && !embedded && <div style={{ maxWidth: 920, margin: "12px auto", padding: "0 12px", fontSize: 12 }}>
      <div role="group" aria-label="Data View" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Data View</span>
        <button type="button" aria-pressed={view === "mock"} onClick={() => setView("mock")}>Mock</button>
        <button type="button" aria-pressed={view === "maroon"} onClick={() => setView("maroon")}>Maroon Tournament</button>
      </div>
      <div aria-live="polite" style={{ marginTop: 4, opacity: 0.7 }}>{view === "mock" ? "Mock Data" : "Real Tournament Data"}</div>
    </div>}
    <GolfTripHome {...data} weather={weather} navigation={simulator?.navigation} settingsHref="/dev/tournament/settings" backHref="/golf-trips" />
    {!simulator && !embedded && view === "maroon" && <details style={{ maxWidth: 920, margin: "24px auto", padding: 12, background: "#fff8ef", borderRadius: 8 }}>
      <summary style={{ fontWeight: 600 }}>DEV: Unmapped Tournament Data (click to view)</summary>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(unmapped, null, 2)}</pre>
    </details>}
  </>;
}
