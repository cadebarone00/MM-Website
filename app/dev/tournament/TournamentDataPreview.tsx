"use client";

import { useMemo, useState } from "react";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { useSimulator, useSimulatorNavigationReporter } from "@/components/dev/SimulatorBridge";
import { simulatorScorecard, simulatorTripData, type SimulatorTripData as TripData } from "@/lib/dev/golfTripSimulatorData";
import { DEFAULT_SIMULATOR_STATE } from "@/lib/dev/simulator";
import { GOLF_PREVIEW_TRIP_WEATHER } from "@/lib/platform/golfTripPreviewFixture";
import type { TripWeather } from "@/lib/platform/weather/types";


/** Data selection belongs to the dev route, never to the shared trip UI. */
export function TournamentDataPreview({ mock, maroon, unmapped, embedded = false, fictional = false, settingsHref = "/dev/tournament/settings" }: {
  mock: TripData;
  maroon: TripData;
  unmapped: Record<string, unknown>;
  embedded?: boolean;
  fictional?: boolean;
  settingsHref?: string;
}) {
  const [view, setView] = useState<"mock" | "maroon">("maroon");
  const simulator = useSimulator();
  const reportNavigation = useSimulatorNavigationReporter();
  const config = simulator ?? { source: view, state: DEFAULT_SIMULATOR_STATE };
  const data = simulatorTripData(mock, maroon, config);
  // "End of round, unsubmitted": the Scoring card starts filled in (scores match or not comes from opponentCard).
  const scoringPrefill = useMemo(() => simulatorScorecard(config.state.roundStatus, data.previewMatch?.par, config.state.opponentCard), [config.state.roundStatus, data.previewMatch?.par, config.state.opponentCard]);
  // Home's quick weather: made-up numbers for a trip with a destination, or "loading" forever for the simulator's Weather loading state.
  const hasDestination = Boolean(data.preview?.destination);
  const weather = useMemo(() => config.state.loading === "weather" ? new Promise<TripWeather>(() => {})
    : hasDestination ? Promise.resolve(GOLF_PREVIEW_TRIP_WEATHER) : undefined, [config.state.loading, hasDestination]);
  return <>
    {!simulator && !embedded && <div style={{ maxWidth: 920, margin: "12px auto", padding: "0 12px", fontSize: 12 }}>
      <div role="group" aria-label="Data View" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Data View</span>
        <button type="button" aria-pressed={view === "mock"} onClick={() => setView("mock")}>Mock</button>
        <button type="button" aria-pressed={view === "maroon"} onClick={() => setView("maroon")}>{fictional ? "Maroon U" : "Maroon Tournament"}</button>
      </div>
      <div aria-live="polite" style={{ marginTop: 4, opacity: 0.7 }}>{view === "mock" || fictional ? "Mock Data" : "Real Tournament Data"}</div>
    </div>}
    <GolfTripHome {...data} weather={weather} opponentCardMatches={config.state.opponentCard !== "mismatch"} scoringPrefill={scoringPrefill} navigation={simulator?.navigation} onNavigationChange={reportNavigation} settingsHref={settingsHref} backHref="/golf-trips" />
    {!simulator && !embedded && !fictional && view === "maroon" && <details style={{ maxWidth: 920, margin: "24px auto", padding: 12, background: "#fff8ef", borderRadius: 8 }}>
      <summary style={{ fontWeight: 600 }}>DEV: Unmapped Tournament Data (click to view)</summary>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(unmapped, null, 2)}</pre>
    </details>}
  </>;
}
