"use client";

import { useSimulator } from "@/components/dev/SimulatorBridge";
import { ALLOWED_PRESET, GolfTripSettingsPreview } from "@/components/platform/GolfTripSettingsPreview";
import { getPlayerDisplayName } from "@/lib/data/players";
import { simulatorRoundLive, simulatorTripData, type SimulatorTripData } from "@/lib/dev/golfTripSimulatorData";
import { DEFAULT_SIMULATOR_STATE } from "@/lib/dev/simulator";
import { adaptTournamentToPastTrip } from "@/lib/platform/tournamentToGolfTrip";
import { pinehurst2024 } from "@/lib/data/2024-pinehurst";
import { danzante2025 } from "@/lib/data/2025-danzante";
import { plannedRounds } from "@/lib/platform/golfTripDraft";
import type { CompetitionRound } from "@/lib/platform/golfTripCompetitionPreview";

export function SettingsDataPreview({ mock, maroon }: { mock: SimulatorTripData; maroon: SimulatorTripData }) {
  const simulator = useSimulator();
  const config = simulator ?? { source: "maroon" as const, state: DEFAULT_SIMULATOR_STATE };
  const data = simulatorTripData(mock, maroon, config);
  const source = config.source;
  const preview = data.preview;
  // Players who have joined, from the tournament roster; the rest of the expected count shows as open spots.
  const roster = [preview?.rosterMaroon, preview?.rosterWhite].flatMap(list => (list ?? "").split(",")).map(slug => slug.trim()).filter(Boolean).map(getPlayerDisplayName);
  // Without a roster: the golfers on the trip's leaderboard (busy / mock data), else whoever has joined (a just-created
  // trip: only the organizer).
  const golfers = data.previewMatch?.leaderboard.map(row => row.golfer.name) ?? [];
  const players = roster.length ? roster : golfers.length ? golfers : data.travel?.members.map(member => member.name) ?? (preview?.yourName ? [preview.yourName] : []);
  // The trip's rounds from the chosen data (empty data → none), so Golf Schedule, Format and Summary match the rest of the app.
  // Rounds already played (or in play) are locked, the same way the trip page reads the round state.
  const match = data.previewMatch;
  const live = simulatorRoundLive(config.state.roundStatus, match);
  const playedThrough = config.state.roundStatus === "complete" ? Infinity
    : match ? (live || match.leaderboard.some(row => row.holes.every(strokes => strokes !== null)) ? match.round : match.round - 1) : 0;
  const tripRounds: CompetitionRound[] = preview ? plannedRounds(preview).filter(round => round.date).map(round => ({
    id: `round-${round.number}`, date: round.date, number: round.number, course: preview[`round${round.number}Course`] || "Course TBD",
    format: "Singles", nassau: false, handicap: false, status: round.number <= playedThrough ? "started" : "scheduled",
  })) : [];
  // History and house rules from the chosen trip: the real trip's past Maroon tournaments (old code) and no house rules
  // (the old data has none); a just-created trip has neither; the mock / busy trips keep their samples.
  const pastTrips = source === "maroon" ? [danzante2025, pinehurst2024].map(adaptTournamentToPastTrip) : source === "empty" ? [] : undefined;
  // Randomized mock data also shuffles which house rules the trip has (same seed → same rules).
  const seed = config.state.seed;
  const houseRules = source === "maroon" || source === "empty" ? [] : source === "mock" && seed ? ALLOWED_PRESET.filter((_, index) => ((seed >>> index) & 1) === 1) : undefined;
  // The real trip's competition as it actually was (old tournament data): an individual stroke-play leaderboard and two
  // teams, Maroon and White, by roster (players list = Maroon roster, then White), already submitted.
  const maroonCount = (preview?.rosterMaroon ?? "").split(",").filter(slug => slug.trim()).length;
  const competitionSetup = source === "maroon" && roster.length ? {
    types: { individual: "Stroke Play", team: "2 Teams" }, teamNames: ["Maroon", "White"],
    teams: [roster.slice(0, maroonCount).map((_, index) => index), roster.slice(maroonCount).map((_, index) => maroonCount + index)],
  } : undefined;
  // A different data choice starts the settings fresh (its days, rounds and players).
  return <GolfTripSettingsPreview key={`${source}-${seed ?? 0}`} dataKey={source} tripName={preview?.tripName || "Your Golf Trip"} playerCount={Number(preview?.playerCount) || 0}
    players={players} tripRounds={tripRounds} pastTrips={pastTrips} houseRules={houseRules} competitionSetup={competitionSetup} />;
}
