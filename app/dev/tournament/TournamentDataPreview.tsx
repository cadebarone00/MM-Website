"use client";

import { useEffect, useMemo, useState } from "react";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { CELEBRATION_MS } from "@/components/platform/SubmitCelebration";
import { useSimulator, useSimulatorNavigationReporter } from "@/components/dev/SimulatorBridge";
import { readJustCreated, readJustCreatedAll, useJustCreatedReady, useJustCreatedVersion, writeJustCreated } from "@/lib/dev/justCreatedStore";
import { applyJustCreatedSetup, type JustCreatedSetup } from "@/lib/dev/justCreatedTrip";
import { simulatorNow, simulatorRoundLive, simulatorScorecard, simulatorTripData, type SimulatorTripData as TripData } from "@/lib/dev/golfTripSimulatorData";
import { DEFAULT_SIMULATOR_STATE } from "@/lib/dev/simulator";
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEFAULT_DEV_ACCOUNT } from "@/lib/dev/devAccounts";
import { DEV_TRIP_ID, devRoundMeta, devTripRound, devTripRoundId } from "@/lib/dev/devPlayerRounds";
import { devTripScoring } from "@/lib/dev/devTripScores";
import { liveCardFromSheet, type SheetCard } from "@/lib/platform/liveCards";
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
  // A card submitted after End round keeps the sheet up until its submit animation has finished.
  const [celebrating, setCelebrating] = useState(false);
  const simulator = useSimulator();
  const reportNavigation = useSimulatorNavigationReporter();
  const config = simulator ?? { source: view, state: DEFAULT_SIMULATOR_STATE };
  // Just created: everything set up in Settings and your own travel are saved until Reset in the /dev panel, and the trip
  // here is built from them (days, rounds, courses, formats, tee times, players, teams). Only in the browser after the first
  // render (the server has no saved data), and rebuilt only when the data choice or a reset changes it.
  const justCreated = config.source === "empty";
  const savedVersion = useJustCreatedVersion();
  const ready = useJustCreatedReady();
  const configKey = JSON.stringify(config);
  const data = useMemo(() => {
    const generated = simulatorTripData(mock, maroon, JSON.parse(configKey));
    return justCreated && ready ? applyJustCreatedSetup(generated, readJustCreatedAll(savedVersion) as JustCreatedSetup) : generated;
  }, [mock, maroon, configKey, justCreated, ready, savedVersion]);
  // Player rounds (dev): Submit & Save saves this round once to the signed-in mock account; reopening shows it locked.
  const viewAs = config.state.viewAs ?? DEFAULT_DEV_ACCOUNT;
  const devRounds = useDevPlayerRounds();
  const match = data.previewMatch;
  const saved = match ? devRounds.rounds.find((r) => r.id === playerRoundId("trip", DEV_TRIP_ID, devTripRoundId(match), viewAs)) : undefined;
  // Player & Attest (dev): this round's group (stored so Organizer settings can show it and swap attesters), whose score I
  // keep, the leaderboard with saved rounds, trip stats and the organizer's own changes.
  const scoring = devTripScoring(devRounds, match, viewAs);
  const group = scoring.group;
  const groupKey = group ? JSON.stringify(group) : null;
  useEffect(() => { if (groupKey) dispatchDevRounds({ type: "saveGroup", group: JSON.parse(groupKey) }); }, [groupKey]);
  // Live round: Start / End round in Organizer settings wins; otherwise the simulator's round state stands in for "today is
  // the round's day". After End round, a card I haven't submitted can still be finished.
  const roundEntry = match ? devRounds.tripRounds[devTripRoundId(match)] : undefined;
  const roundLive = tripRoundOpen(roundEntry, simulatorRoundLive(config.state.roundStatus, data.previewMatch)) || (roundEntry?.state === "closed" && !saved && Boolean(scoring.myLiveCard)) || celebrating;
  // The trip clock that matches the round state (a live round happens on the trip's day, not 197 days early).
  const tripNow = simulatorNow(config, data, roundLive);
  const submittedCard = useMemo(() => saved ? cardFromHoles(saved.holes) : undefined, [saved]);
  const onScoringSubmit = (card: ScoredCard) => { setCelebrating(true); window.setTimeout(() => setCelebrating(false), CELEBRATION_MS); if (match) dispatchDevRounds({ type: "saveRound", round: devTripRound(match, viewAs, card, { groupId: group?.id }) }); };
  // "End of round, unsubmitted": the Scoring card starts filled in (scores match or not comes from opponentCard).
  const scoringPrefill = useMemo(() => simulatorScorecard(config.state.roundStatus, data.previewMatch?.par, config.state.opponentCard), [config.state.roundStatus, data.previewMatch?.par, config.state.opponentCard]);
  // Home's quick weather: made-up numbers for a trip with a destination, or "loading" forever for the simulator's Weather loading state.
  const hasDestination = Boolean(data.preview?.destination);
  const weather = useMemo(() => config.state.loading === "weather" ? new Promise<TripWeather>(() => {})
    : hasDestination ? Promise.resolve(GOLF_PREVIEW_TRIP_WEATHER) : undefined, [config.state.loading, hasDestination]);
  const onScoringCardChange = (sheet: SheetCard) => { if (match && group) dispatchDevRounds({ type: "saveLiveCard", card: { ...liveCardFromSheet(group.id, viewAs, sheet), meta: devRoundMeta(match) } }); };
  // The second phone: what I enter for the player I attest goes onto their card.
  const onAttestChange = (strokes: (number | null)[]) => { if (match && group && scoring.attesteeId) dispatchDevRounds({ type: "saveAttestStrokes", groupId: group.id, profileId: scoring.attesteeId, strokes, meta: devRoundMeta(match) }); };
  return <>
    {!simulator && !embedded && <div style={{ maxWidth: 920, margin: "12px auto", padding: "0 12px", fontSize: 12 }}>
      <div role="group" aria-label="Data View" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Data View</span>
        <button type="button" aria-pressed={view === "mock"} onClick={() => setView("mock")}>Mock</button>
        <button type="button" aria-pressed={view === "maroon"} onClick={() => setView("maroon")}>{fictional ? "Maroon U" : "Maroon Tournament"}</button>
      </div>
      <div aria-live="polite" style={{ marginTop: 4, opacity: 0.7 }}>{view === "mock" || fictional ? "Mock Data" : "Real Tournament Data"}</div>
    </div>}
    <GolfTripHome key={justCreated ? `just-created-${savedVersion}` : config.source} {...data} now={tripNow} competitionKey={config.source}
      savedCompetitionType={justCreated ? readJustCreated("localCompetitionType") : undefined}
      savedTeamColors={justCreated ? readJustCreated("teamColors") : undefined}
      organizer={viewAs === DEFAULT_DEV_ACCOUNT}
      savedTeamDraft={justCreated ? { teamType: readJustCreated<{ team: string | null }>("localCompetitionType")?.team ?? null, selection: readJustCreated("teamSelection") ?? null,
        date: readJustCreated("draftDate") ?? "", time: readJustCreated("draftTime") ?? "", type: readJustCreated("draftType") ?? "Snake" } : undefined}
      onTravelChange={justCreated ? travel => writeJustCreated("travel", travel) : undefined} weather={weather} previewMatch={scoring.shownMatch} tripStats={scoring.tripStats} scoreChanges={scoring.scoreChanges} attesteeName={scoring.attesteeName} attestedStrokes={scoring.myLiveCard?.holes.map((h) => h.attestStrokes)} onAttestChange={onAttestChange} scoringEdits={saved?.edits} onScoringCardChange={onScoringCardChange} roundLive={roundLive} opponentCardMatches={config.state.opponentCard !== "mismatch"} scoringPrefill={scoringPrefill} onScoringSubmit={onScoringSubmit} submittedCard={submittedCard} scoringOwner={viewAs} navigation={simulator?.navigation} onNavigationChange={reportNavigation} settingsHref={settingsHref} backHref="/golf-trips" />
    {!simulator && !embedded && !fictional && view === "maroon" && <details style={{ maxWidth: 920, margin: "24px auto", padding: 12, background: "#fff8ef", borderRadius: 8 }}>
      <summary style={{ fontWeight: 600 }}>DEV: Unmapped Tournament Data (click to view)</summary>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(unmapped, null, 2)}</pre>
    </details>}
  </>;
}
