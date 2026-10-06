"use client";

import { useEffect, useMemo, useState } from "react";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { useSimulator, useSimulatorNavigationReporter } from "@/components/dev/SimulatorBridge";
import { simulatorNow, simulatorRoundLive, simulatorScorecard, simulatorTripData, type SimulatorTripData as TripData } from "@/lib/dev/golfTripSimulatorData";
import { DEFAULT_SIMULATOR_STATE } from "@/lib/dev/simulator";
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEFAULT_DEV_ACCOUNT } from "@/lib/dev/devAccounts";
import { DEV_TRIP_ID, devTripRound, devTripRoundId } from "@/lib/dev/devPlayerRounds";
import { devTripGroup, withSavedRounds } from "@/lib/dev/devTripScores";
import { tripRoundOpen } from "@/lib/platform/tripRoundState";
import { cardFromHoles, playerRoundId, type ScoredCard } from "@/lib/platform/playerRounds";
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
  // Player rounds (dev): Submit & Save saves this round once to the signed-in mock account; reopening shows it locked.
  const viewAs = config.state.viewAs ?? DEFAULT_DEV_ACCOUNT;
  const devRounds = useDevPlayerRounds();
  const match = data.previewMatch;
  const saved = match ? devRounds.rounds.find((r) => r.id === playerRoundId("trip", DEV_TRIP_ID, devTripRoundId(match), viewAs)) : undefined;
  // Player & Attest (dev): this round's group and attesters. The group is stored so Organizer settings can show it and swap attesters.
  const group = match ? devTripGroup(match, viewAs, devRounds.attesters) : null;
  const groupKey = group ? JSON.stringify(group) : null;
  useEffect(() => { if (groupKey) dispatchDevRounds({ type: "saveGroup", group: JSON.parse(groupKey) }); }, [groupKey]);
  // Live round: Start / End round in Organizer settings wins; otherwise the simulator's round state stands in for "today is
  // the round's day". After End round, a card I haven't submitted can still be finished.
  const roundEntry = match ? devRounds.tripRounds[devTripRoundId(match)] : undefined;
  const myLiveCard = group ? devRounds.liveCards.find((c) => c.groupId === group.id && c.profileId === viewAs) : undefined;
  const roundLive = tripRoundOpen(roundEntry, simulatorRoundLive(config.state.roundStatus, data.previewMatch)) || (roundEntry?.state === "closed" && !saved && Boolean(myLiveCard));
  // The trip clock that matches the round state (a live round happens on the trip's day, not 197 days early).
  const tripNow = simulatorNow(config, data, roundLive);
  const tripRounds = devRounds.rounds.filter((r) => r.source === "trip" && r.tripId === DEV_TRIP_ID);
  const shownMatch = match && group ? withSavedRounds(match, group, tripRounds) : match;
  const submittedCard = useMemo(() => saved ? cardFromHoles(saved.holes) : undefined, [saved]);
  const onScoringSubmit = (card: ScoredCard) => { if (match) dispatchDevRounds({ type: "saveRound", round: devTripRound(match, viewAs, card, { groupId: group?.id }) }); };
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
    <GolfTripHome {...data} now={tripNow} weather={weather} previewMatch={shownMatch} roundLive={roundLive} opponentCardMatches={config.state.opponentCard !== "mismatch"} scoringPrefill={scoringPrefill} onScoringSubmit={onScoringSubmit} submittedCard={submittedCard} scoringOwner={viewAs} navigation={simulator?.navigation} onNavigationChange={reportNavigation} settingsHref={settingsHref} backHref="/golf-trips" />
    {!simulator && !embedded && !fictional && view === "maroon" && <details style={{ maxWidth: 920, margin: "24px auto", padding: 12, background: "#fff8ef", borderRadius: 8 }}>
      <summary style={{ fontWeight: 600 }}>DEV: Unmapped Tournament Data (click to view)</summary>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(unmapped, null, 2)}</pre>
    </details>}
  </>;
}
