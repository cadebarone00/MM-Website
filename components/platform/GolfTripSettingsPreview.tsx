"use client";

import { useSavedTripSetup } from "./SavedTripSetupProvider";
import { DatePicker } from "@/components/platform/DatePicker";


import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeftRight, ChevronLeft, GripVertical, Minus, Plus, Shuffle, Trash2, X } from "lucide-react";
import { GolfGameScoringSettings } from "./GolfGameScoringSettings";
import { SIDE_GAME_REGISTRY } from "@/lib/platform/golfTripGames";
import { ORGANIZER_GAME_TO_PLAY } from "@/lib/platform/tripGames";
import type { GameId } from "@/lib/platform/roundGames";
import type { CompetitionRound } from "@/lib/platform/golfTripCompetitionPreview";
import styles from "./GolfTripSettingsPreview.module.css";
import tripStyles from "./GolfTripHome.module.css";
import leaderboardStyles from "./GolfTripMatch.module.css";
import { OrganizerScorecard, type CardHole } from "./OrganizerScorecard";
import { devGolferId } from "@/lib/dev/devTripScores";
import { GolfTripCompetition } from "./GolfTripCompetition";
import { GolfTripDatePicker } from "./GolfTripDatePicker";
import { CourseEditSheet, TripScheduleCoursePicker, type PickedCourse } from "./TripScheduleCoursePicker";
import { NO_ROUND_TEES, RoundTeeBoxes, type RoundTees } from "./RoundTeeBoxes";
import { TripRoundPars } from "./TripRoundPars";
import { TeeTimePicker } from "./TeeTimePicker";
import { MatchDraftTimingFields, type MatchDraftTiming } from "./MatchDraftTimingFields";
import { draftScheduleError } from "@/lib/platform/draftSchedule";
import { matchDraftPreviewData } from "@/lib/dev/matchDraftPreview";
import { TripPlayerRoles } from "./TripPlayerRoles";
import { TripMatchDraftRoom } from "./TripMatchDraftRoom";
import { TimePicker } from "./TimePicker";
import { scopedRoundId, DEV_TRIP_ID } from "@/lib/dev/devPlayerRounds";
import { roundHasStarted, groupHasStarted, type GroupStarts } from "@/lib/platform/scheduleLocks";
import { removeScheduleSlot, shiftScheduleDays } from "@/lib/platform/scheduleDateShift";
import { RoundCompetitionSettings } from "./RoundCompetitionSettings";
import { defaultRoundComp, pointsPerMatchTotal, roundMatches, playersPerSide, roundPointsAvailable, type RoundCompSettings } from "@/lib/platform/roundCompetition";
import { GolfTripHistory, type HistoryLinking } from "./GolfTripHistory";
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEFAULT_DEV_ACCOUNT, DEV_ACCOUNTS, devAccount } from "@/lib/dev/devAccounts";
import { OrganizerScores } from "./OrganizerScores";
import { historyLinkInput, linkStatus } from "@/lib/platform/historyLinks";
import gamesStyles from "./GolfTripGames.module.css";
import { samplePastTrips, type PastTrip } from "@/lib/platform/golfTripHistory";
import toggleStyles from "./GolfTripCompetition.module.css";
import { GolfTripPredictSettings } from "./GolfTripPredictSettings";
import notificationStyles from "./GolfTripNotifications.module.css";
import { SCORING_VIEWS, setScoringView, useScoringView } from "@/lib/platform/scoringViewPreference";
import { useGolfTripCompetitionPreview } from "./GolfTripCompetitionPreviewProvider";

import { useSimulator, useSimulatorNavigationReporter } from "@/components/dev/SimulatorBridge";
import { usePersistedState } from "@/lib/dev/justCreatedStore";
import { TEAM_COLORS, teamColor } from "@/lib/platform/teamColors";
import { setMyStatsOptIn, setPlayerStats as setDevicePlayerStats, useMyStatsOptIn, usePlayerStats } from "@/lib/platform/playerStatsSetting";
import { setInAppScoring as setDeviceInAppScoring, useInAppScoring } from "@/lib/platform/inAppScoringSetting";
import { useRoundRsvps } from "@/lib/platform/roundRsvp";
import { savePredictSettings as saveDevicePredictSettings, usePredictSettings, type PredictSettings } from "@/lib/platform/predictSetting";

const GENERAL_CARDS = ["Scorecard View", ...Array.from({ length: 5 }, () => "Place holder")];
// Individual and Team competition are separate boxes; each opens the competition page for just that type.
const ORGANIZER_SECTIONS = [
  { title: "Overview", cards: ["Players", "Golf Schedule", "Games", "Player Scoring"] },
  { title: "Competition", cards: ["Individual Competition", "Team Competition", "Skins", "Match Selection", "Predict"] },
  { title: "History", cards: ["History", "Delete Trip"] },
];
const GAME_GROUPS = {
  Individual: [{ id: "skins", name: "Skins", description: "Play for the lowest net score on the hole or the round.", players: "1-4 players" }],
  Matches: SIDE_GAME_REGISTRY.filter(game => game.id !== "skins").map(game => ({ id: game.id, name: game.name, description: game.description, players: `${game.supportedGroupSizes.join(" / ")} players` })),
} as const;
const COMPETITION_TYPES = [
  { key: "individual", title: "Individual", options: ["Stroke Play", "Stableford"] },
  { key: "team", title: "Team", options: ["2 Teams", "Pairs", "3-Ball", "4-Ball"] },
] as const;
// Team Selection (Competition → Team): the ways players get put on teams.
const TEAM_SELECTIONS = ["Manual", "Draft", "Random"] as const;
type TeamSelection = (typeof TEAM_SELECTIONS)[number];
const DRAFT_ORDERS = ["Snake", "Straight"] as const;
type DraftOrder = (typeof DRAFT_ORDERS)[number];
const DRAFT_METHODS = ["Captain's Picks", "Duck Race"] as const;
type DraftMethod = (typeof DRAFT_METHODS)[number];
const MAX_DAYS = 14;
// Match Selection (Organizer): how a round's matches are made — the organizer enters them (Manual) or a Match Draft makes
// them (Response, Ranks or Randomized) at a set time. Set for every round at once, or (Select per round) round by round.
const MATCH_METHODS = ["Manual", "Match Draft"] as const;
const MATCH_DRAFT_TYPES = ["Response", "Ranks", "Randomized"] as const;
type MatchSelection = MatchDraftTiming & { method: (typeof MATCH_METHODS)[number] | null; draftType: (typeof MATCH_DRAFT_TYPES)[number] | null; date: string; time: string };
const NO_MATCH_SELECTION: MatchSelection = { method: null, draftType: null, date: "", time: "" };
/** The items in a random order (Fisher–Yates). */
/** "2027-05-12" → "May 12, 2027". */
function golfDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}
/** "19:30" → "7:30 PM". */
function clockLabel(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}
function shuffleOrder<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const MAX_PLAYERS = 100;
// Player Scoring: what players fill in on the Scoring sheet for each hole. Preview only; resets on reload.
const PLAYER_SCORING_FIELDS = ["Opponent's score", "Putts", "Fairway", "Greens in regulation"];
const GAME_LOOKUP = [...GAME_GROUPS.Individual, ...GAME_GROUPS.Matches];

/** Reference layout with local game scoring settings in the site's maroon palette. */
export function GolfTripSettingsPreview({ tripName, backHref = "/dev/tournament", playerCount = 0, players = [], tripRounds, pastTrips: tripHistory, dataKey = "default", persistenceScope, scoringTripId, competitionSetup, livePanels, scheduleBaseDate, organizerName = devAccount(DEFAULT_DEV_ACCOUNT).name }: {
  scheduleBaseDate?: string; organizerName?: string;
  livePanels?: { members: ReactNode; scorecards: ReactNode; scoring: ReactNode; isOrganizer: boolean; deleteHref: string };
  tripName: string; backHref?: string; playerCount?: number; players?: string[];
  /** The chosen trip's past trips; without them, the samples. */
  pastTrips?: PastTrip[];
  /** Which trip data this is (dev): the Individual / Team picks are kept per trip, shared with its Golf tab. */
  dataKey?: string;
  /** The trip's competition as it already stands (the real tournament: its Individual / Team types and its two teams by
   *  roster position, submitted). Picks made in Settings take over from it. */
  persistenceScope?: string; scoringTripId?: string;
  competitionSetup?: { types: { individual: string | null; team: string | null }; teamNames: string[]; teams: number[][] };
  /** The trip's own rounds (from the chosen data: mock, busy, empty or the real tournament). Without it, the shared sample rounds. */
  tripRounds?: CompetitionRound[];
}) {
  // Dev "Just created" trip: everything set up here is saved as you go (lib/dev/justCreatedStore) until Reset.
  const persist = persistenceScope ?? (dataKey === "empty");
  const savedSetup = useSavedTripSetup();
  const setPlayerStats = (on: boolean) => savedSetup ? savedSetup.write("playerStats", on) : setDevicePlayerStats(on);
  const setInAppScoring = (on: boolean) => savedSetup ? savedSetup.write("inAppScoring", on) : setDeviceInAppScoring(on);
  const savePredictSettings = (settings: PredictSettings) => savedSetup ? savedSetup.write("predictSettings", settings) : saveDevicePredictSettings(settings);
  const [section, setSection] = useState("General");
  const [competitionOpen, setCompetitionOpen] = useState(false);
  const [competitionSection, setCompetitionSection] = useState("Overview");
  const [gamesOpen, setGamesOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [playerScoringOpen, setPlayerScoringOpen] = useState(false);
  const [scorecardViewOpen, setScorecardViewOpen] = useState(false);
  // History: past trips the organizer entered. Preview only; one sample trip, resets on reload.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [predictOpen, setPredictOpen] = useState(false);
  // Organizer → Skins: the trip's skins game (any trip, separate from Individual / Team Competition).
  const [skinsOpen, setSkinsOpen] = useState(false);
  const [pastTrips, setPastTrips] = usePersistedState<PastTrip[]>(persist, "pastTrips", () => tripHistory ?? samplePastTrips(players));
  // History → Link to account (dev): requests go to the shared player-rounds store; the player answers on /dev/profile/requests.
  const devRounds = useDevPlayerRounds();
  const historyLinking: HistoryLinking = {
    accounts: DEV_ACCOUNTS.map(({ id, name }) => ({ id, name })),
    statusFor: (trip, playerName) => {
      const link = linkStatus(devRounds.linkRequests, trip.id, playerName);
      return link && link.status !== "declined" ? { status: link.status, accountName: devAccount(link.profileId).name } : null;
    },
    request: (trip, playerName, profileId) => {
      try { dispatchDevRounds({ type: "requestLink", input: historyLinkInput(trip, playerName, profileId) }); return null; }
      catch (error) { return error instanceof Error ? error.message : "Couldn't send the request."; }
    },
  };
  const scoringView = useScoringView();
  // Player Stats (Player Scoring): when off, players only enter their score and the Golf tab has no Stats section.
  const playerStats = usePlayerStats();
  const myStats = useMyStatsOptIn();
  const inAppScoring = useInAppScoring();
  const predictSettings = usePredictSettings();
  // Players' Play / Sit out for each round (they choose on their Itinerary).
  const roundRsvps = useRoundRsvps(dataKey);
  const [scoringFieldsOff, setScoringFieldsOff] = usePersistedState<Set<string>>(persist, "scoringFieldsOff", new Set());
  // Players: the expected count can't drop below the players who already joined; open spots show as "Player N".
  const [playerTotal, setPlayerTotal] = usePersistedState(persist, "playerTotal", () => Math.min(MAX_PLAYERS, Math.max(1, playerCount, players.length)));
  const [removedPlayers, setRemovedPlayers] = usePersistedState<Set<string>>(persist, "removedPlayers", () => new Set());
  const joinedPlayers = players.map((name, index) => ({ name, key: `${index}:${name}` })).filter(player => !removedPlayers.has(player.key));
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [confirmDeleteRoundId, setConfirmDeleteRoundId] = useState<string | null>(null);
  // Competition type: one choice per grouping (Individual, Team); None applies to its own grouping only.
  // Rounds page: a day count, and 0, 1 or 2 round slots for each day. Lowering Days only hides that day's row.
  // Shared with the Golf tab (dev layout provider) so its sections follow these choices; local state when there's no provider.
  const sharedCompetition = useGolfTripCompetitionPreview();
  const [localCompetitionType, setLocalCompetitionType] = usePersistedState<{ individual: string | null; team: string | null }>(persist, "localCompetitionType", competitionSetup?.types ?? { individual: null, team: null });
  // The Just created trip keeps its picks saved (and tells the Golf tab); other trips share them with the Golf tab only.
  const competitionType = persist ? localCompetitionType : sharedCompetition?.competitionTypes[dataKey] ?? competitionSetup?.types ?? localCompetitionType;
  const setCompetitionType: typeof setLocalCompetitionType = persist
    ? update => { setLocalCompetitionType(update); sharedCompetition?.setCompetitionType(dataKey)(update); }
    : sharedCompetition ? sharedCompetition.setCompetitionType(dataKey) : setLocalCompetitionType;
  const [overviewType, setOverviewType] = useState<"individual" | "team">("individual");
  // Submit & Save Individual / Team Competition locks that side (greyed, no edits) until Undo and Change.
  const [lockedComp, setLockedComp] = usePersistedState<{ individual: boolean; team: boolean }>(persist, "lockedComp", { individual: false, team: false });
  // Team Competition → Save Teams: locks the team type (2 Teams … None) and Team Selection until Undo Save.
  const [teamChoiceSaved, setTeamChoiceSaved] = usePersistedState(persist, "teamChoiceSaved", false);
  // Players ticked under each competition type (by roster slot). Preview only; resets on reload.
  // A trip with an individual competition already set up counts everyone on it.
  const [typePlayers, setTypePlayers] = usePersistedState<Record<"individual" | "team", Set<number>>>(persist, "typePlayers", () => ({
    individual: new Set(competitionSetup?.types.individual ? players.map((_, index) => index) : []), team: new Set() }));
  // Any Team type (not None): teams are named under the ovals; + Add Player opens a drop-down list of players not yet on a team. Preview only; resets on reload.
  const [addingToTeam, setAddingToTeam] = useState<number | null>(null);
  const [addPick, setAddPick] = useState<number | null>(null);
  const openAddPlayer = (team: number) => { setAddPick(null); setAddingToTeam(team); };
  // Swap pop-up: pick a player on another team to swap with, or an empty spot on another team to move into.
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ player: number } | { emptyTeam: number; open: number } | null>(null);
  const [teamNames, setTeamNames] = usePersistedState<string[]>(persist, "teamNames", competitionSetup?.teamNames ?? []);
  // Each team's color (an id from TEAM_COLORS), and which team's color list is open.
  const [localTeamColors, setLocalTeamColors] = usePersistedState<(string | null)[]>(persist, "teamColors", []);
  const teamColors = persist ? localTeamColors : sharedCompetition?.teamColors[dataKey] ?? localTeamColors;
  const setTeamColors: typeof setLocalTeamColors = persist
    ? update => { setLocalTeamColors(update); sharedCompetition?.setTeamColors(dataKey)(update); }
    : sharedCompetition ? sharedCompetition.setTeamColors(dataKey) : setLocalTeamColors;
  const [colorPicker, setColorPicker] = useState<number | null>(null);
  // Which team (0 = A, 1 = B, ...) each roster slot is on; a player can only be on one team.
  const [teamPicks, setTeamPicks] = usePersistedState<Record<number, number>>(persist, "teamPicks", () =>
    Object.fromEntries((competitionSetup?.teams ?? []).flatMap((team, teamIndex) => team.map(player => [player, teamIndex]))));
  const playerName = (index: number) => joinedPlayers[index]?.name ?? `Player ${index + 1}`;
  const rosterSlots = Array.from({ length: playerTotal }, (_, index) => index);
  const pickedOn = (team: number) => rosterSlots.filter(index => teamPicks[index] === team);
  // Pairs / 3-Ball / 4-Ball: fixed players per team, Total players in steps of that size, at least 2 teams.
  // 2 Teams: Total players in steps of 2 split in half, or (Add Sub/Uneven Teams on) a separate size per team up to the trip's players.
  const groupSize = ({ Pairs: 2, "3-Ball": 3, "4-Ball": 4 } as Record<string, number>)[competitionType.team ?? ""] ?? null;
  const [teamTotalChoice, setTeamTotalChoice] = usePersistedState<number | null>(persist, "teamTotalChoice", null);
  const [unevenTeams, setUnevenTeams] = usePersistedState(persist, "unevenTeams", false);
  const [teamTie, setTeamTie] = usePersistedState<"Retain" | "Teams Tie" | "Playoff">(persist, "teamTie", "Teams Tie");
  const selectedTeamTie = competitionType.team !== "2 Teams" && teamTie === "Retain" ? "Teams Tie" : teamTie;
  const [unevenSizes, setUnevenSizes] = usePersistedState<[number, number]>(persist, "unevenSizes", [2, 2]);
  const uneven = unevenTeams && !groupSize;
  const pageGroup = COMPETITION_TYPES.find(group => group.key === overviewType) ?? COMPETITION_TYPES[0];
  // Team Selection starts unpicked. Switching how teams are picked starts the teams over.
  const [teamSelection, setTeamSelectionState] = usePersistedState<TeamSelection | null>(persist, "teamSelection", null);
  const setTeamSelection = (choice: TeamSelection) => {
    if (choice === teamSelection) return;
    setTeamSelectionState(choice); setTeamPicks({}); setSubmittedTeams(null);
  };
  // Draft: when it happens and its order (Snake reverses each round; Straight keeps the same order).
  const [draftDate, setDraftDate] = usePersistedState(persist, "draftDate", "");
  const [draftTime, setDraftTime] = usePersistedState(persist, "draftTime", "");
  const [draftOrder, setDraftOrder] = usePersistedState<DraftOrder>(persist, "draftType", "Snake");
  const [draftMethod, setDraftMethod] = usePersistedState<DraftMethod>(persist, "draftMethod", "Captain's Picks");
  // Home's Draftboard follows these (team type, how teams are picked, the draft's date, time and order).
  const shareTeamDraft = sharedCompetition?.setTeamDraft;
  useEffect(() => {
    shareTeamDraft?.(dataKey, { teamType: competitionType.team, selection: teamSelection, date: draftDate, time: draftTime, type: draftOrder, method: draftMethod });
  }, [shareTeamDraft, dataKey, competitionType.team, teamSelection, draftDate, draftTime, draftOrder, draftMethod]);
  const teamStep = groupSize ?? 2;
  const teamTotalMax = playerTotal - (playerTotal % teamStep);
  const highestTeam = Math.max(-1, ...rosterSlots.map(index => teamPicks[index] ?? -1));
  const stepMin = groupSize ? Math.max(2, highestTeam + 1) * groupSize : Math.max(4, pickedOn(0).length * 2, pickedOn(1).length * 2);
  const totalMin = Math.min(teamTotalMax, stepMin + (stepMin % teamStep ? teamStep - (stepMin % teamStep) : 0));
  const steppedTotal = Math.min(teamTotalMax, Math.max(totalMin, teamTotalChoice ?? teamTotalMax));
  const evenTotal = steppedTotal - (steppedTotal % teamStep);
  const teamCount = groupSize ? Math.max(1, evenTotal / groupSize) : 2;
  const sizeMin = [Math.max(1, pickedOn(0).length), Math.max(1, pickedOn(1).length)];
  const teamSizes = groupSize ? Array.from({ length: teamCount }, () => groupSize) : uneven ? unevenSizes.map((size, team) => Math.max(sizeMin[team], size)) : [evenTotal / 2, evenTotal / 2];
  const teamSplit = Array.from({ length: teamCount }, (_, team) => pickedOn(team));
  const teamTotal = teamSizes.reduce((sum, size) => sum + size, 0);
  const teamAssigned = teamSplit.reduce((sum, team) => sum + team.length, 0);
  const allPicked = teamAssigned === teamTotal;
  // Random: shuffle the trip's players and deal them onto the teams, filling each team's size in order.
  const randomizeTeams = () => {
    const shuffled = shuffleOrder(rosterSlots);
    const picks: Record<number, number> = {};
    let next = 0;
    teamSizes.forEach((size, team) => { for (const index of shuffled.slice(next, next + size)) picks[index] = team; next += size; });
    setTeamPicks(picks);
  };
  // Team A, B, ... Z, then AA, AB, ...; blank names fall back to these.
  const teamLetter = (team: number) => team < 26 ? String.fromCharCode(65 + team) : String.fromCharCode(64 + Math.floor(team / 26)) + String.fromCharCode(65 + (team % 26));
  const teamLabels = teamSizes.map((_, team) => teamNames[team]?.trim() || `Team ${teamLetter(team)}`);
  const stepTeamSize = (team: number, change: number) => {
    const next: [number, number] = [teamSizes[0], teamSizes[1]];
    next[team] += change;
    setUnevenSizes(next);
  };
  // Set by Submit teams; the sheet then shows the submitted team columns.
  const [submittedTeams, setSubmittedTeams] = usePersistedState<number[][] | null>(persist, "submittedTeams", competitionSetup?.teams.length ? competitionSetup.teams : null);
  const [gameSettings, setGameSettings] = usePersistedState<CompetitionRound>(persist, "gameSettings", {
    id: "game-settings-preview",
    date: "2027-04-22",
    number: 1,
    course: "Desert Pines GC",
    format: "Singles" as const,
    nassau: true,
    handicap: true,
    status: "scheduled" as const,
  });
  const competition = useGolfTripCompetitionPreview();
  const selectedRound = competition?.rounds.find(round => round.id === selectedRoundId);
  const selectedGame = GAME_LOOKUP.find(game => game.id === selectedGameId) ?? null;
  const rounds = useMemo(() => tripRounds ?? competition?.rounds ?? [], [tripRounds, competition?.rounds]);
  const days = Array.from(new Set(rounds.map(round => round.date).filter(Boolean))).sort();
  const [dayCount, setDayCount] = usePersistedState(persist, "dayCount", () => Math.max(1, days.length));
  const [roundsPerDay, setRoundsPerDay] = usePersistedState<Record<number, 0 | 1 | 2>>(persist, "roundsPerDay", () => Object.fromEntries(days.map((date, index) => [index, Math.min(2, rounds.filter(round => round.date === date).length) as 0 | 1 | 2])));
  // Arrival / Departure: moving Arrival keeps Departure where it is, so the day count grows or shrinks with it.
  const [arrivalShift, setArrivalShift] = usePersistedState(persist, "arrivalShift", 0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Golf Schedule: tap a round's course → the course pop-up (like New game). Picks are kept per day/round slot.
  const [pickedCourses, setPickedCourses] = usePersistedState<Record<string, PickedCourse>>(persist, "pickedCourses", {});
  // Each Golf Schedule round's tees (by round key): one tee box, or a tee per hole.
  const [groupStarts, setGroupStarts] = usePersistedState<Record<string, GroupStarts>>(persist, "groupStarts", {});
  const [yardageCorrections, setYardageCorrections] = usePersistedState<Record<string, { at: string; reason: string; before: RoundTees; after: RoundTees; affectedCards: string[] }[]>>(persist, "yardageCorrections", {});
  const [roundTees, setRoundTees] = usePersistedState<Record<string, RoundTees>>(persist, "roundTees", {});
  // Competition → Format: which Golf Schedule round slots count toward the competition (on unless switched off).
  const [compRounds, setCompRounds] = usePersistedState<Record<string, boolean>>(persist, "compRounds", {});
  // Competition → Format → tap a comp round: that round's competition settings (players, format, match type, points, Nassau, handicap), kept per round slot.
  const [compRoundSlot, setCompRoundSlot] = useState<{ day: number; slot: number } | null>(null);
  // Individual Competition → Skins: on or off for the trip; while on, each round is on unless switched off and has its own
  // players (everyone unless changed). `skinsRound`: the round whose players page is open.
  const [skinsOn, setSkinsOn] = usePersistedState(persist, "skinsOn", false);
  const [skinsRounds, setSkinsRounds] = usePersistedState<Record<string, boolean>>(persist, "skinsRounds", {});
  const [skinsPlayers, setSkinsPlayers] = usePersistedState<Record<string, Set<number>>>(persist, "skinsPlayers", {});
  const [skinsRound, setSkinsRound] = useState<{ day: number; slot: number } | null>(null);
  const roundSkinsOn = (key: string) => skinsOn && (skinsRounds[key] ?? true);
  const roundSkinsPlayers = (key: string) => skinsPlayers[key] ?? new Set(rosterSlots);
  const [compFormats, setCompFormats] = usePersistedState<Record<string, RoundCompSettings>>(persist, "compFormats", {});
  // Organizer → Games: which games each round plays (round number → Play game ids). Everyone's Games tab gets them.
  const [gameRounds, setGameRounds] = usePersistedState<Record<string, GameId[]>>(persist, "gameRounds", {});
  const [gameRound, setGameRound] = useState(1);
  // Turning a round's Comp switch off waits for this confirm (it removes the round's format).
  const [confirmCompOff, setConfirmCompOff] = useState<string | null>(null);
  const [coursePicker, setCoursePicker] = useState<{ key: string; label: string } | null>(null);
  // The Edit course pop-up, for one Golf Schedule round (its day and slot): from a round's Edit, or right after + Add Round.
  // `adding`: opened by + Add Round, so the pop-up says Select course.
  const [editCourse, setEditCourse] = useState<{ day: number; slot: number; adding?: boolean } | null>(null);
  // Golf Schedule: tap a round's tee time → the tee time sheet. Each group's time ("HH:MM") is kept per day/round slot.
  const [teeTimes, setTeeTimes] = usePersistedState<Record<string, string[]>>(persist, "teeTimes", {});
  const [scheduleTab, setScheduleTab] = useState<"Tee times" | "Course Yardage">("Tee times");
  const [teeTimePicker, setTeeTimePicker] = useState<{ key: string; course: string; date: string; round: number; fixedGroups?: number; startGroup?: number } | null>(null);
  // Golf Schedule → tap a round's box → that round's settings page (course, tee times).
  const [scheduleRound, setScheduleRound] = useState<{ day: number; slot: number } | null>(null);
  const [deleteScheduleRound, setDeleteScheduleRound] = useState(false);
  // Match Selection: its page, the round open on it, and each round's choice (by Golf Schedule round key).
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [matchDraftRoomOpen, setMatchDraftRoomOpen] = useState(false);
  const [matchDraftRoomRound, setMatchDraftRoomRound] = useState<string | undefined>(undefined);
  const [matchRound, setMatchRound] = useState<{ day: number; slot: number } | null>(null);
  const [matchSelections, setMatchSelections] = usePersistedState<Record<string, MatchSelection>>(persist, "matchSelections", {});
  // Match Selection Type (all rounds at once): Select per round off = every round follows `allRounds`; on = each round's own.
  const [matchPerRound, setMatchPerRound] = usePersistedState(persist, "matchPerRound", false);
  const [allRoundsMatch, setAllRoundsMatch] = usePersistedState<MatchSelection>(persist, "allRoundsMatch", NO_MATCH_SELECTION);
  const [draftScheduleMessage,setDraftScheduleMessage] = useState("");
  const checkDraftSchedule = (changes: Record<string,unknown>) => {
    const error=draftScheduleError({teamSelection,draftDate,draftTime,matchSelections,matchPerRound,allRoundsMatch,...changes});
    setDraftScheduleMessage(error ?? "");return !error;
  };
  const roundMatchSelection = (key: string) => matchPerRound ? matchSelections[key] : allRoundsMatch;
  // Round settings → Players: up to 4 roster slots per tee time group, kept per round slot. A player can be in one group per round.
  const [teePlayers, setTeePlayers] = usePersistedState<Record<string, Record<number, number[]>>>(persist, "teePlayers", {});
  const [teePlayersGroup, setTeePlayersGroup] = useState<number | null>(null);
  // 2 Teams + a comp match-play round: the matchups, per round slot, by match number — each side's players (roster slots,
  // null = still open). The slot being filled (which match, which side, which spot) while its player list is open.
  const [teeMatches, setTeeMatches] = usePersistedState<Record<string, Record<number, { a: (number | null)[]; b: (number | null)[] }>>>(persist, "teeMatches", {});
  // Course names carried by rounds that were dragged (they no longer line up with the sample schedule).
  const [slotCourseNames, setSlotCourseNames] = usePersistedState<Record<string, string>>(persist, "slotCourseNames", {});
  // Organizer short names for lock screens / Live Activities, by full course name (a course played twice shares one).
  const [courseShortNames, setCourseShortNames] = usePersistedState<Record<string, string>>(persist, "courseShortNames", {});
  // Dragging a round by its grip: where it started, how far it moved, and where it would land.
  const [roundDrag, setRoundDrag] = useState<{ day: number; slot: number; startY: number; dy: number } | null>(null);
  const [roundDrop, setRoundDrop] = useState<{ day: number; index: number } | null>(null);
  // A drop onto another day waits for this confirm (it resets the round's settings).
  const [pendingMove, setPendingMove] = useState<{ from: { day: number; slot: number }; to: { day: number; index: number } } | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const baseDate = scheduleBaseDate ?? days[0] ?? today;
  const isoForDay = (index: number) => {
    const date = new Date(`${baseDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + arrivalShift + index);
    return date.toISOString().slice(0, 10);
  };
  const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
  const arrivalIso = isoForDay(0);
  const departureIso = isoForDay(dayCount - 1);
  // Golf on Arrival / Departure Day: when off, golf Day 1 is the day after Arrival, or the last golf day is the day before Departure.
  const [golfOnArrival, setGolfOnArrival] = usePersistedState(persist, "golfOnArrival", true);
  const [golfOnDeparture, setGolfOnDeparture] = usePersistedState(persist, "golfOnDeparture", true);
  const golfStart = golfOnArrival ? 0 : 1;
  const golfDayCount = Math.max(0, dayCount - golfStart - (golfOnDeparture ? 0 : 1));
  const golfIso = (index: number) => isoForDay(index + golfStart);
  const golfDate = (index: number) => dayDate(index + golfStart);
  // Slot indices change when the first golf date moves; the settings stay on their calendar date.
  // Keep hidden days too, so toggling arrival golf back on restores their selections.
  const preserveScheduleDates = (nextFirstGolfDate: string) => {
    const offset = daysBetween(nextFirstGolfDate, golfIso(0));
    if (!offset) return;
    setRoundsPerDay(current => shiftScheduleDays(current, offset));
    setPickedCourses(current => shiftScheduleDays(current, offset));
    setRoundTees(current => shiftScheduleDays(current, offset));
    setTeeTimes(current => shiftScheduleDays(current, offset));
    setTeePlayers(current => shiftScheduleDays(current, offset));
    setTeeMatches(current => shiftScheduleDays(current, offset));
    setCompRounds(current => shiftScheduleDays(current, offset));
    setCompFormats(current => shiftScheduleDays(current, offset));
    setMatchSelections(current => shiftScheduleDays(current, offset));
    setSlotCourseNames(current => shiftScheduleDays(current, offset));
    setGroupStarts(current => shiftScheduleDays(current, offset));
    setYardageCorrections(current => shiftScheduleDays(current, offset));
  };
  const changeGolfOnArrival = (on: boolean) => {
    if (anyPlayStarted) return;
    preserveScheduleDates(isoForDay(on ? 0 : 1));
    setGolfOnArrival(on);
  };
  // The trip dates popup sets both ends at once; the Day rows follow (1 to MAX_DAYS days).
  const setTripDates = (arrival: string, departure: string) => {
    if (anyPlayStarted) return;
    const nextFirstGolfDate = new Date(`${arrival}T12:00:00Z`);
    nextFirstGolfDate.setUTCDate(nextFirstGolfDate.getUTCDate() + golfStart);
    preserveScheduleDates(nextFirstGolfDate.toISOString().slice(0, 10));
    setArrivalShift(daysBetween(baseDate, arrival));
    setDayCount(daysBetween(arrival, departure) + 1);
    setDatePickerOpen(false);
  };
  // Day N's date follows on from Arrival; "Date" until the trip has one.
  // Trip day N as "April 22, 2027" (Arrival / Departure pills, round labels).
  const dayDate = (index: number) => {
    if (!days[0] && !scheduleBaseDate) return "Date";
    const date = new Date(`${baseDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + arrivalShift + index);
    return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  };
  // One Golf Schedule round slot: its key, number, course and every group's tee time.
  const scheduleSlot = (day: number, slot: number) => {
    const key = `${day}-${slot}`, picked = pickedCourses[key];
    const number = Array.from({ length: day }, (_, before) => roundsPerDay[before] ?? 1).reduce<number>((sum, count) => sum + count, 0) + slot + 1;
    const course = picked?.name ?? slotCourseNames[key] ?? rounds.filter(round => round.date === golfIso(day))[slot]?.course ?? "Course TBD";
    const groupTimes = teeTimes[key] ?? (picked?.settings?.teeTime ? [picked.settings.teeTime] : []);
    // City, ST of a picked course (sample-schedule courses have none).
    const place = picked?.place ?? "";
    return { key, number, course, place, groupTimes, label: `Round ${number} · ${golfDate(day)}` };
  };
  const playState = (key: string, number: number) => {
    const entry = devRounds.tripRounds[scopedRoundId(scoringTripId ?? DEV_TRIP_ID, number)];
    const sourceStarted = rounds.find(round => round.number === number)?.status === "started";
    const groups = groupStarts[key] ?? {};
    return { started: roundHasStarted(groups, entry, sourceStarted), groupStarted: (group: number) => groupHasStarted(group, groups, entry, sourceStarted) };
  };
  const anyPlayStarted = Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => { const round = scheduleSlot(day, slot); return playState(round.key, round.number).started; }).some(Boolean)).some(Boolean) || Object.values(groupStarts).some(groups => Object.keys(groups).length > 0);
  const sourceRoundComp=(key:string):RoundCompSettings=>{
    const [day,slot]=key.split('-').map(Number);
    const format=rounds.filter(round=>round.date===golfIso(day))[slot]?.format;
    return {...defaultRoundComp(playerTotal),...(format?{format:(format==='Best Ball'?'Fourball':format) as RoundCompSettings['format']}: {})};
  };
  // The open Format round: its slot, number and settings (defaults until changed: every trip player, Singles match play, 1 point, gross).
  const compRound = compRoundSlot ? (() => {
    const slot = scheduleSlot(compRoundSlot.day, compRoundSlot.slot);
    const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${golfIso(compRoundSlot.day)}T12:00:00Z`));
    return { id: slot.key, number: slot.number, course: slot.course, date, settings: compFormats[slot.key] ?? sourceRoundComp(slot.key) };
  })() : undefined;
  // Summary: a rundown of what's actually happening in this competition — the type, who's playing (individual) or the
  // teams (team), each competition round's format and points, and whether it's saved.
  const competitionSummary = (): [string, ReactNode][] => {
    const key = pageGroup.key, type = competitionType[key];
    if (!type) return [["Competition", "None"], ...(key === "individual" && !competitionType.team || key === "team" && !competitionType.individual ? [["Score in the app", inAppScoring ? "On" : "Off"] as [string, ReactNode]] : [])];
    const slots = Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => scheduleSlot(day, slot))).flat();
    const compSlots = slots.filter(slot => compRounds[slot.key] ?? true);
    const points = compSlots.reduce((sum, slot) => sum + roundPointsAvailable(compFormats[slot.key] ?? sourceRoundComp(slot.key)), 0);
    const rows: [string, ReactNode][] = [["Competition", type]];
    if (key === "individual") {
      const playing = [...typePlayers.individual].sort((x, y) => x - y);
      rows.push(["Players", playing.length ? `${playing.length} of ${playerTotal} · ${playing.map(playerName).join(", ")}` : "None picked yet"]);
    } else {
      rows.push(["Team selection", teamSelection ?? "Not chosen"]);
      if (teamSelection === "Draft") rows.push(["Draft type", draftMethod], ...(draftMethod === "Captain's Picks" ? [["Draft order", draftOrder] as [string, string]] : []), ["Draft", `${draftMethod} · ${draftDate ? golfDateLabel(draftDate) : "Date not set"}${draftTime ? ` · ${clockLabel(draftTime)}` : " · Time not set"}`]);
      const teams = submittedTeams ?? teamSplit;
      teams.forEach((team, index) => rows.push([teamLabels[index], `${teamColor(teamColors[index])?.name ?? "No color"} · ${team.length ? team.map(playerName).join(", ") : "No players yet"}${submittedTeams ? "" : " (not submitted)"}`]));
    }
    rows.push(["Rounds", `${compSlots.length} of ${slots.length} count`]);
    for (const slot of compSlots) {
      const comp = compFormats[slot.key] ?? sourceRoundComp(slot.key);
      rows.push([`Round ${slot.number}`, `${slot.course} · ${comp.format}${key === "team" ? ` · ${roundPointsAvailable(comp)} points` : ""}`]);
    }
    if (key === "team" && points) rows.push(["Points", `${points} available · ${points / 2 + 0.5} to win`]);
    rows.push(["Status", lockedComp[key] ? "Saved" : "Not saved yet"]);
    return rows;
  };
  // Moves a round to another place (max 2 a day). Same day: it keeps its settings. Another day: course, tee times, players and Comp go back to default.
  const moveRound = (from: { day: number; slot: number }, to: { day: number; index: number }) => {
    if (anyPlayStarted) return;
    type Slot = { picked?: PickedCourse; tees?: string[]; comp?: boolean; format?: RoundCompSettings; players?: Record<number, number[]>; matches?: Record<number, { a: (number | null)[]; b: (number | null)[] }>; name: string };
    const lists: Slot[][] = Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => {
      const key = `${day}-${slot}`;
      return { picked: pickedCourses[key], tees: teeTimes[key], comp: compRounds[key], format: compFormats[key], players: teePlayers[key], matches: teeMatches[key], name: scheduleSlot(day, slot).course };
    }));
    const [item] = lists[from.day].splice(from.slot, 1);
    const index = from.day === to.day && to.index > from.slot ? to.index - 1 : to.index;
    lists[to.day].splice(index, 0, from.day === to.day ? item : { name: "Course TBD" });
    if (lists[to.day].length > 2) return;
    const picked: Record<string, PickedCourse> = {}, tees: Record<string, string[]> = {}, comp: Record<string, boolean> = {}, names: Record<string, string> = {};
    const players: Record<string, Record<number, number[]>> = {};
    const formats: Record<string, RoundCompSettings> = {};
    const matchups: Record<string, Record<number, { a: (number | null)[]; b: (number | null)[] }>> = {};
    lists.forEach((list, day) => list.forEach((slot, at) => {
      const key = `${day}-${at}`;
      if (slot.picked) picked[key] = slot.picked;
      if (slot.tees) tees[key] = slot.tees;
      if (slot.comp !== undefined) comp[key] = slot.comp;
      if (slot.players) players[key] = slot.players;
      if (slot.format) formats[key] = slot.format;
      if (slot.matches) matchups[key] = slot.matches;
      names[key] = slot.name;
    }));
    setRoundsPerDay(Object.fromEntries(lists.map((list, day) => [day, list.length as 0 | 1 | 2])));
    setPickedCourses(picked);
    setTeeTimes(tees);
    setCompRounds(comp);
    setTeePlayers(players);
    setCompFormats(formats);
    setTeeMatches(matchups);
    setSlotCourseNames(names);
  };
  // While dragging: the round under the pointer (drop above or below its middle), or the end of a day; a full other day can't take it.
  const findRoundDrop = (x: number, y: number, from: { day: number; slot: number }) => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-day]");
    if (!target) return null;
    const day = Number(target.dataset.dropDay);
    const count = roundsPerDay[day] ?? 1;
    if (day !== from.day && count >= 2) return null;
    if (target.dataset.dropSlot === undefined) return { day, index: count };
    const rect = target.getBoundingClientRect();
    return { day, index: Number(target.dataset.dropSlot) + (y > rect.top + rect.height / 2 ? 1 : 0) };
  };
  const simulator = useSimulator();
  const reportNavigation = useSimulatorNavigationReporter();
  const appliedCommand = useRef<number | undefined>(undefined);
  const [placeholder, setPlaceholder] = useState<number | null>(null);
  // Scorecards tab: the round whose players page is open (its Golf Schedule day and slot), then the player whose card is open.
  const [scorecardRound, setScorecardRound] = useState<{ day: number; slot: number } | null>(null);
  const [scorecardPlayer, setScorecardPlayer] = useState<number | null>(null);
  const scorecardOpen = scorecardRound !== null;
  // Who's playing a round: the trip's players, minus anyone who chose "I'm out" for it on their Itinerary.
  const roundPlayers = (number: number) => rosterSlots.filter(player => roundRsvps[number]?.[playerName(player)] !== "out");
  // Scorecards edits saved for the Golf Trip only (by trip round and player): they show here over the player's own card.
  const [tripScoreEdits, setTripScoreEdits] = usePersistedState<Record<string, CardHole[]>>(persist, "tripScoreEdits", {});
  // A player's card for a round (dev store): their submitted round (their account), else their card in progress, else blank;
  // the trip's own edits on top.
  const roundCard = (name: string, number: number) => {
    const tripRoundId = scopedRoundId(scoringTripId ?? DEV_TRIP_ID, number);
    const accountIds = DEV_ACCOUNTS.filter(account => account.name === name).map(account => account.id);
    const ids = new Set([devGolferId(name), ...accountIds,
      ...devRounds.groups.flatMap(group => Object.entries(group.names).filter(([, groupName]) => groupName === name).map(([id]) => id))]);
    const submitted = devRounds.rounds.find(card => card.tripRoundId === tripRoundId && ids.has(card.profileId));
    const live = devRounds.liveCards.find(card => card.meta.tripRoundId === tripRoundId && ids.has(card.profileId));
    const par = submitted ? submitted.holes.map(hole => hole.par) : live?.meta.par ?? [];
    const account: CardHole[] = Array.from({ length: 18 }, (_, i) => {
      const hole = submitted?.holes[i] ?? live?.holes[i];
      return { strokes: hole?.strokes ?? null, putts: hole?.putts ?? null, fairway: hole?.fairway ?? null, green: hole?.green ?? null };
    });
    return { tripRoundId, submitted, par, account, holes: tripScoreEdits[`${tripRoundId}|${name}`] ?? account };
  };
  // Save Score (submitted rounds only): the Golf Trip's copy always; with the player's account too, just the changes made in
  // this save go onto their submitted round, each logged as an organizer edit.
  const saveRoundCard = (card: ReturnType<typeof roundCard>, name: string, next: CardHole[], account: boolean) => {
    setTripScoreEdits(current => ({ ...current, [`${card.tripRoundId}|${name}`]: next }));
    if (!account || !card.submitted) return;
    const byProfileId = simulator?.state.viewAs ?? DEFAULT_DEV_ACCOUNT, at = new Date().toISOString(), reason = "Edited by the organizer in Settings → Scorecards";
    for (const [i, hole] of next.entries()) for (const field of ["strokes", "putts", "fairway", "green"] as const) {
      if (hole[field] === card.holes[i][field] || hole[field] === card.account[i][field] || (field === "strokes" && hole.strokes === null)) continue;
      try { dispatchDevRounds({ type: "overrideHole", roundId: card.submitted.id, input: { hole: i + 1, field, to: hole[field], byProfileId, at, reason } }); } catch { /* not a change this card can take */ }
    }
  };
  // Scorecards: a round is Upcoming until its first group starts, Live while it's being played, Finished once it's ended.
  const roundStatus = (key: string, number: number) => devRounds.tripRounds[scopedRoundId(scoringTripId ?? DEV_TRIP_ID, number)]?.state === "closed" ? "Finished"
    : playState(key, number).started ? "Live" : "Upcoming";
  useEffect(() => {
    const request = simulator?.navigation;
    if (!request?.settingsView || request.command === appliedCommand.current) return;
    appliedCommand.current = request.command;
    const view = request.settingsView;
    setMatchesOpen(view === "match-selection" || view === "match-draft-room");
    setMatchDraftRoomOpen(view === "match-draft-room");
    setSection(view === "player" || view === "scorecard-view" || /^placeholder-[1-6]$/.test(view) ? "General" : "Organizer");
    setPlayersOpen(view === "players");
    setRoundsOpen(view === "schedule");
    setCompetitionOpen(view === "competition" || view === "competition-rounds" || view.startsWith("round-"));
    setCompetitionSection(view === "competition-rounds" || view.startsWith("round-") ? "Format" : "Overview");
    setGamesOpen(view === "games" || view.startsWith("game-"));
    setExpandedGameId(view.startsWith("game-") ? view.slice(5) : null);
    setSelectedGameId(null);
    setSelectedRoundId(view.startsWith("round-") ? view.slice(6) : null);
    setPlaceholder(view.startsWith("placeholder-") ? Number(view.slice(12)) : null);
    setPlayerScoringOpen(view === "player-scoring");
    setScorecardViewOpen(view === "scorecard-view");
    setHistoryOpen(view === "history");
    setSkinsOpen(view === "skins");
  }, [simulator?.navigation]);
  useEffect(() => {
    if (!reportNavigation) return;
    const settingsView = matchDraftRoomOpen ? "match-draft-room" : matchesOpen ? "match-selection" : predictOpen ? "predict" : skinsOpen ? "skins" : historyOpen ? "history" : scorecardViewOpen ? "scorecard-view" : playerScoringOpen ? "player-scoring" : playersOpen ? "players" : roundsOpen ? "schedule" : competitionOpen ? selectedRoundId ? `round-${selectedRoundId}` : competitionSection === "Format" ? "competition-rounds" : "competition" : gamesOpen ? expandedGameId ? `game-${expandedGameId}` : "games" : placeholder ? `placeholder-${placeholder}` : section === "General" ? "player" : "organizer";
    reportNavigation({ tab: "Home", settingsView }, rounds.map(({ id, number }) => ({ id, number })));
  }, [reportNavigation, matchDraftRoomOpen, matchesOpen, predictOpen, skinsOpen, historyOpen, scorecardViewOpen, playerScoringOpen, playersOpen, roundsOpen, competitionOpen, competitionSection, gamesOpen, expandedGameId, placeholder, section, selectedRoundId, rounds]);
  const cardSections = section === "Organizer" ? ORGANIZER_SECTIONS : [{ title: null, cards: livePanels ? ["Scorecard View"] : GENERAL_CARDS }];
  // Steps back one level (the back arrow goes through tryGoBack below).
  const goBack = () => {
    if (scorecardPlayer !== null) setScorecardPlayer(null);
    else if (scorecardRound) setScorecardRound(null);
    else if (selectedRound) setSelectedRoundId(null);
    else if (compRound) setCompRoundSlot(null);
    else if (skinsRound) setSkinsRound(null);
    else if (selectedGame) setSelectedGameId(null);
    else if (scheduleRound) { setScheduleRound(null); setTeePlayersGroup(null); }
    else if (matchRound) setMatchRound(null);
    else if (matchesOpen) setMatchesOpen(false);
    else if (competitionOpen) setCompetitionOpen(false);
    else if (roundsOpen) setRoundsOpen(false);
    else if (playersOpen) setPlayersOpen(false);
    else if (playerScoringOpen) setPlayerScoringOpen(false);
    else if (scorecardViewOpen) setScorecardViewOpen(false);
    else if (historyOpen) setHistoryOpen(false);
    else if (predictOpen) setPredictOpen(false);
    else if (skinsOpen) setSkinsOpen(false);
    else setGamesOpen(false);
  };
  // SAVE: every setting below, as it was when each open settings page was opened (one entry per level). Changes only
  // count once SAVE is tapped; leaving a page with unsaved changes asks first, and Exit without saving puts them back.
  const settingsValues = { pastTrips, scoringFieldsOff, playerTotal, removedPlayers, competitionType, lockedComp, teamChoiceSaved, typePlayers,
    teamNames, teamColors, teamPicks, teamTotalChoice, unevenTeams, unevenSizes, teamTie, teamSelection, draftDate, draftTime, draftOrder, draftMethod, submittedTeams,
    gameSettings, dayCount, roundsPerDay, arrivalShift, pickedCourses, yardageCorrections, roundTees, compRounds, compFormats, matchSelections, matchPerRound,
    allRoundsMatch, teePlayers, teeMatches, slotCourseNames, courseShortNames, golfOnArrival, golfOnDeparture, teeTimes, skinsOn, skinsRounds, skinsPlayers, scoringView, playerStats, myStats, inAppScoring, predictSettings, gameRounds };
  const restoreSettings = (saved: typeof settingsValues) => {
    setTeamTie(saved.teamTie);
    setPastTrips(saved.pastTrips); setScoringFieldsOff(saved.scoringFieldsOff); setPlayerTotal(saved.playerTotal);
    setRemovedPlayers(saved.removedPlayers); setCompetitionType(saved.competitionType); setLockedComp(saved.lockedComp); setTeamChoiceSaved(saved.teamChoiceSaved);
    setTypePlayers(saved.typePlayers); setTeamNames(saved.teamNames); setTeamColors(saved.teamColors); setTeamPicks(saved.teamPicks);
    setTeamTotalChoice(saved.teamTotalChoice); setUnevenTeams(saved.unevenTeams); setUnevenSizes(saved.unevenSizes); setTeamSelectionState(saved.teamSelection);
    setDraftDate(saved.draftDate); setDraftTime(saved.draftTime); setDraftOrder(saved.draftOrder); setDraftMethod(saved.draftMethod); setSubmittedTeams(saved.submittedTeams);
    setGameSettings(saved.gameSettings); setDayCount(saved.dayCount); setRoundsPerDay(saved.roundsPerDay); setArrivalShift(saved.arrivalShift);
    setPickedCourses(saved.pickedCourses); setYardageCorrections(saved.yardageCorrections); setRoundTees(saved.roundTees); setCompRounds(saved.compRounds);
    setCompFormats(saved.compFormats); setGameRounds(saved.gameRounds ?? {}); setMatchSelections(saved.matchSelections); setMatchPerRound(saved.matchPerRound); setAllRoundsMatch(saved.allRoundsMatch);
    setTeePlayers(saved.teePlayers); setTeeMatches(saved.teeMatches); setSlotCourseNames(saved.slotCourseNames); setCourseShortNames(saved.courseShortNames ?? {}); setGolfOnArrival(saved.golfOnArrival);
    setGolfOnDeparture(saved.golfOnDeparture); setTeeTimes(saved.teeTimes); setSkinsOn(saved.skinsOn); setSkinsRounds(saved.skinsRounds); setSkinsPlayers(saved.skinsPlayers);
    if (saved.scoringView !== scoringView) setScoringView(saved.scoringView);
    if (saved.playerStats !== playerStats) setPlayerStats(saved.playerStats);
    if (saved.myStats !== myStats) setMyStatsOptIn(saved.myStats);
    if (saved.inAppScoring !== inAppScoring) setInAppScoring(saved.inAppScoring);
    if (settingsKey(saved.predictSettings) !== settingsKey(predictSettings)) savePredictSettings(saved.predictSettings);
  };
  const settingsDepth = (competitionOpen || gamesOpen || roundsOpen || playersOpen || playerScoringOpen || scorecardViewOpen || historyOpen || predictOpen || skinsOpen || matchesOpen || scorecardOpen ? 1 : 0)
    + (selectedRound || compRound || skinsRound || selectedGame || scheduleRound || matchRound || scorecardPlayer !== null ? 1 : 0);
  const [savedSettings, setSavedSettings] = useState<(typeof settingsValues)[]>([]);
  // Opening a page remembers the settings as they are; closing one forgets its entry.
  if (savedSettings.length !== settingsDepth) setSavedSettings(stack => stack.length < settingsDepth
    ? [...stack, ...Array.from({ length: settingsDepth - stack.length }, () => settingsValues)] : stack.slice(0, settingsDepth));
  const savedNow = savedSettings[savedSettings.length - 1];
  const unsaved = savedNow !== undefined && settingsKey(savedNow) !== settingsKey(settingsValues);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  // SAVE keeps everything as it is now (on this page and the pages under it); you stay on the page, and it reads SAVED.
  const saveSettings = () => setSavedSettings(stack => stack.map(() => settingsValues));
  const tryGoBack = () => { if (unsaved) setLeaveConfirm(true); else goBack(); };
  // The trip's players as checkboxes in two columns (filled down the left first), with Select all on top.
  const playerChecklist = (label: string, checked: Set<number>, onChange: (next: Set<number>) => void) => {
    const everyone = Array.from({ length: playerTotal }, (_, index) => index);
    const allChecked = playerTotal > 0 && everyone.every(index => checked.has(index));
    return <div className={styles.typePlayers}>
      <div className={styles.typePlayersHeader}>
        <label className={styles.typePlayer}>
          <input type="checkbox" checked={allChecked} onChange={() => onChange(new Set(allChecked ? [] : everyone))} />
          <span>Select all</span>
        </label>
      </div>
      <ul className={styles.typePlayerGrid} style={{ gridTemplateRows: `repeat(${Math.ceil(playerTotal / 2)}, auto)` }} aria-label={label}>
        {everyone.map(index => <li key={index}>
          <label className={styles.typePlayer}>
            <input type="checkbox" checked={checked.has(index)} onChange={() => { const next = new Set(checked); if (!next.delete(index)) next.add(index); onChange(next); }} />
            <ShortName name={playerName(index)} />
          </label>
        </li>)}
      </ul>
    </div>;
  };
  // A section's own save button (Save Team Size, Submit teams, Submit & Save, a round's Submit & Save, the tee time SAVE)
  // keeps just that section's settings as saved; anything else changed on the page still waits for SAVE.
  type SettingsValues = typeof settingsValues;
  const saveSection = (pick: (saved: SettingsValues) => Partial<SettingsValues>) => setSavedSettings(stack => stack.map(saved => ({ ...saved, ...pick(saved) })));
  const teamSizeSection = (saved: SettingsValues): Partial<SettingsValues> => ({ competitionType: { ...saved.competitionType, team: competitionType.team },
    teamTotalChoice, unevenTeams, unevenSizes, teamTie });
  const teamsSection = (): Partial<SettingsValues> => ({ teamSelection, teamPicks, teamNames, teamColors });
  const exitWithoutSaving = () => { if (savedNow) restoreSettings(savedNow); setLeaveConfirm(false); goBack(); };

  if (matchDraftRoomOpen) {
    const method = simulator?.state.matchDraftPreview;
    if (process.env.NODE_ENV === "development" && method && method !== "off") {
      const sourcePlayers = (submittedTeams ?? teamSplit).slice(0,2).flatMap((team,index)=>team.map(player=>({id:String(player),name:playerName(player),team:index===0?"A" as const:"B" as const})));
      const fixture = matchDraftPreviewData(sourcePlayers,rounds.map(round=>round.course),undefined,method);
      return <TripMatchDraftRoom key={method} rounds={fixture.rounds} players={fixture.players} initialRound={"preview-"+method} onClose={()=>{setMatchDraftRoomOpen(false);setMatchesOpen(true);}} />;
    }
    const draftRounds = Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => scheduleSlot(day, slot))).flat()
      .filter(round => round.course !== "Course TBD" && (compRounds[round.key] ?? true) && roundMatchSelection(round.key)?.method === "Match Draft")
      .map(round => {
        const choice = roundMatchSelection(round.key)!;
        const own = matchSelections[round.key];
        const settings = compFormats[round.key] ?? sourceRoundComp(round.key);
        const date = own?.date || choice.date;
        const time = own?.time || choice.time;
        return { ...round, format: settings.format, rankMinutes:choice.rankMinutes, putForwardMinutes:choice.putForwardMinutes, responseMinutes:choice.responseMinutes, matches: roundMatches(settings), perSide: playersPerSide(settings.format), locked: playState(round.key, round.number).started, type: choice.draftType ?? "Not selected", when: `${date ? golfDateLabel(date) : "Date not set"} · ${time ? clockLabel(time) : "Time not set"}` };
      });
    const draftPlayers = (submittedTeams ?? teamSplit).slice(0,2).flatMap((team, index) => team.map(player => ({ id: String(player), name: playerName(player), team: index === 0 ? "A" as const : "B" as const })));
    return <TripMatchDraftRoom rounds={draftRounds} canEdit={!savedSetup?.readOnly} teamNames={teamLabels} players={draftPlayers} initialRound={matchDraftRoomRound} onClose={() => { setMatchDraftRoomOpen(false); setMatchesOpen(true); }} />;
  }

  return <main className={`${styles.page} ${competitionOpen || gamesOpen || roundsOpen || playersOpen || playerScoringOpen || scorecardViewOpen || historyOpen || predictOpen || skinsOpen || matchesOpen || scorecardOpen ? styles.competitionPage : ""}`}>
    <div className={styles.content}>
      {draftScheduleMessage && <p role="alert" className={styles.statNote}>{draftScheduleMessage}</p>}
      {(competitionOpen || gamesOpen || roundsOpen || playersOpen || playerScoringOpen || scorecardViewOpen || historyOpen || predictOpen || skinsOpen || matchesOpen || scorecardOpen) ? <header className={styles.competitionHeader}>
        <button type="button" className={styles.close} aria-label={scorecardPlayer !== null ? "Back to players" : scorecardOpen ? "Back to scorecards" : skinsRound ? "Back to skins" : selectedRound || compRound ? "Back to competition rounds" : selectedGame ? "Back to games" : "Back to organizer settings"} onClick={tryGoBack}><ChevronLeft size={28} aria-hidden /></button>
        <h1>{scorecardPlayer !== null ? playerName(scorecardPlayer) : scorecardRound ? `Round ${scheduleSlot(scorecardRound.day, scorecardRound.slot).number}` : selectedRound ? "Round " + selectedRound.number + " Settings" : compRound ? `Round ${compRound.number} Competition` : skinsRound ? `Round ${scheduleSlot(skinsRound.day, skinsRound.slot).number} Skins` : selectedGame ? selectedGame.name : gamesOpen ? "Games" : roundsOpen ? scheduleRound ? `Round ${scheduleSlot(scheduleRound.day, scheduleRound.slot).number}` : "Golf Schedule" : playersOpen ? "Players" : playerScoringOpen ? "Player Scoring" : scorecardViewOpen ? "Scorecard View" : historyOpen ? "History" : predictOpen ? "Predict" : skinsOpen ? "Skins" : matchesOpen ? matchRound ? `Round ${scheduleSlot(matchRound.day, matchRound.slot).number}` : "Match Selection" : overviewType === "team" ? "Team Competition" : "Individual Competition"}</h1>
        {/* Gold SAVE once something has changed; greyed-out SAVED (can't be tapped) while there's nothing to save. */}
        <motion.button type="button" className={styles.save} disabled={!unsaved} onClick={saveSettings} whileHover={unsaved ? { scale: 1.02 } : undefined} whileTap={unsaved ? { scale: 0.96 } : undefined} transition={{ type: "spring", stiffness: 420, damping: 24 }}>{unsaved ? "SAVE" : "SAVED"}</motion.button>
      </header> : <header className={styles.header}>
      <Link href={backHref} className={styles.close} aria-label="Back to trip"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></Link>
      <div className={styles.heading}>
        <h1>{tripName}</h1>
        <p>Trip Settings</p>
      </div>
      </header>}

      {!competitionOpen && !gamesOpen && !roundsOpen && !playersOpen && !playerScoringOpen && !scorecardViewOpen && !historyOpen && !predictOpen && !skinsOpen && !matchesOpen && !scorecardOpen && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Settings sections preview">
        {["General", ...(livePanels && !livePanels.isOrganizer ? [] : ["Organizer"]), "Scorecards"].map((name) => <button key={name} type="button" aria-pressed={section === name}
          className={`${tripStyles.tab} ${section === name ? tripStyles.tabActive : ""} ${styles.tab}`}
          onClick={() => { setSection(name); setPlaceholder(null); setCompetitionOpen(false); setGamesOpen(false); setRoundsOpen(false); setPlayersOpen(false); }}>{name}</button>)}
      </div>}

      {competitionOpen && competition ? <div className={styles.competition}>
        {/* Individual: Format (its type and players; every round plays it) | Summary. Team: Overview | Format | Summary. Skins has its own card. */}
        {!selectedRound && !compRound && !skinsRound && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Competition sections">
          {(overviewType === "individual" ? [["Overview", "Format"], ["Summary", "Summary"]] : [["Overview", "Overview"], ["Format", "Format"], ["Summary", "Summary"]]).map(([name, label]) => <button key={name} type="button" aria-pressed={competitionSection === name}
            className={`${tripStyles.tab} ${competitionSection === name ? tripStyles.tabActive : ""} ${styles.tab}`}
            onClick={() => setCompetitionSection(name)}>{label}</button>)}
        </div>}
        {selectedRound ? <GolfTripCompetition rounds={[selectedRound]} onChange={change => competition.change(change, selectedRound.id)} showBulk={false} />
          : compRound ? <fieldset className={styles.compLock} disabled={playState(compRound.id, compRound.number).started}><RoundCompetitionSettings key={compRound.id} course={compRound.course} date={compRound.date} round={compRound.number} settings={compRound.settings} maxPlayers={playerTotal}
            onSubmit={next => { if (playState(compRound.id, compRound.number).started) return; saveSection(saved => ({ compFormats: { ...saved.compFormats, [compRound.id]: next } })); setCompFormats(current => ({ ...current, [compRound.id]: next })); setCompRoundSlot(null); }} /></fieldset>
          : <div className={tripStyles.events}>
            {competitionSection === "Overview" && <section className={tripStyles.infoSection} aria-label="Overview">
              <div className={styles.typePicker}>
                {COMPETITION_TYPES.filter(group => group.key === overviewType).map(group => <div key={group.key} className={styles.typeGroup} role="group" aria-label={group.title}>
                  <h4 className={styles.typeHeading}>{group.title}</h4>
                  <fieldset className={styles.compLock} disabled={lockedComp[group.key] || anyPlayStarted}>
                  {/* Team: the team type and its players (how many, uneven / subs), saved together by the small gold Save under them. */}
                  <fieldset className={styles.compLock} disabled={group.key === "team" && teamChoiceSaved} aria-label={group.key === "team" ? "Team type and players" : undefined}>
                  <div className={`${styles.typeChoices} ${styles.typeChoicesRow} ${group.key === "individual" ? styles.typeChoicesThree : ""}`}>
                    {[...group.options, null].map(option => <button key={option ?? "none"} type="button" className={styles.typeChoice} aria-pressed={competitionType[group.key] === option}
                      onClick={() => {
                        // A different team type has different team sizes, so it starts from empty teams.
                        if (group.key === "team" && competitionType.team !== option) { setTeamPicks({}); setSubmittedTeams(null); setTeamTotalChoice(null); }
                        setCompetitionType(current => ({ ...current, [group.key]: option }));
                      }}>{option ?? "None"}</button>)}
                  </div>
                  {/* Submitted & saved: a small "Saved" under the chosen pill (stays bright while the rest is greyed). */}
                  {lockedComp[group.key] && <div className={`${styles.typeChoicesRow} ${styles.savedRow} ${group.key === "individual" ? styles.typeChoicesThree : ""}`} aria-live="polite">
                    {[...group.options, null].map(option => <span key={option ?? "none"} className={styles.savedTag}>{competitionType[group.key] === option ? "Saved" : ""}</span>)}
                  </div>}
                  {group.key === "team" && competitionType.team && <div className={`${styles.typePlayers} ${styles.teamSize}`}>
                {/* Add Sub/Uneven Teams off: one even Total players stepper. On: a size stepper per team instead. */}
                {uneven ? ([0, 1] as const).map(team => <div key={team} className={styles.totalPlayers} role="group" aria-label={`${teamLabels[team]} players`}>
                  <span className={styles.typeHeading}>{teamLabels[team]}</span>
                  <div className={`${styles.typeChoice} ${styles.stepper}`}>
                    <button type="button" aria-label={`Fewer ${teamLabels[team]} players`} disabled={!!submittedTeams || teamSizes[team] <= sizeMin[team]} onClick={() => stepTeamSize(team, -1)}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
                    <span aria-live="polite">{teamSizes[team]}</span>
                    <button type="button" aria-label={`More ${teamLabels[team]} players`} disabled={!!submittedTeams || teamTotal >= playerTotal} onClick={() => stepTeamSize(team, 1)}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
                  </div>
                </div>) : <div className={styles.totalPlayers} role="group" aria-label="Total players">
                  <span className={styles.typeHeading}>Total players</span>
                  <div className={`${styles.typeChoice} ${styles.stepper}`}>
                    <button type="button" aria-label="Fewer players" disabled={!!submittedTeams || evenTotal <= totalMin} onClick={() => setTeamTotalChoice(evenTotal - teamStep)}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
                    <span aria-live="polite">{evenTotal}</span>
                    <button type="button" aria-label="More players" disabled={!!submittedTeams || evenTotal >= teamTotalMax} onClick={() => setTeamTotalChoice(evenTotal + teamStep)}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
                  </div>
                </div>}
                {!groupSize && <div className={styles.totalPlayers}>
                  <span className={styles.typeHeading}>Add Sub/Uneven Teams</span>
                  <button type="button" role="switch" aria-checked={unevenTeams} aria-label="Add Sub/Uneven Teams" className={toggleStyles.toggle} disabled={!!submittedTeams} onClick={() => { if (!unevenTeams) setUnevenSizes([teamSizes[0], teamSizes[1]]); setUnevenTeams(on => !on); }}>
                    <span className={toggleStyles.track} data-on={unevenTeams}><span className={toggleStyles.thumb} /></span><span>{unevenTeams ? "On" : "Off"}</span>
                  </button>
                </div>}
                  <div className={styles.teamSelection} role="group" aria-label="If Tie">
                    <span className={styles.typeHeading}>If Tie</span>
                    <div className={styles.tieChoices}>
                      {(competitionType.team === "2 Teams" ? ["Retain", "Teams Tie", "Playoff"] as const : ["Teams Tie", "Playoff"] as const).map(option => <button key={option} type="button" className={styles.typeChoice} aria-pressed={selectedTeamTie === option} onClick={() => setTeamTie(option)}>{option}</button>)}
                    </div>
                  </div>
                  </div>}
                  </fieldset>
                  {/* Save → Undo: the team type and players, saved or opened back up. Team Selection and everything under it
                      have their own save (the button at the bottom). */}
                  {group.key === "team" && <button type="button" className={styles.goldSave} onClick={() => { if (!teamChoiceSaved) saveSection(saved => ({ ...teamSizeSection(saved), teamChoiceSaved: true })); setTeamChoiceSaved(!teamChoiceSaved); }}>
                    {teamChoiceSaved ? "Undo" : "Save Team Size"}
                  </button>}
                  {group.key === "team" && competitionType.team && <>
                  {/* Team Selection: how players get onto teams — picked by the organizer, a draft, or at random. */}
                  <div className={styles.teamSelection} role="group" aria-label="Team Selection">
                    <span className={styles.typeHeading}>Team Selection</span>
                    <div className={styles.teamSelectionChoices}>
                      {TEAM_SELECTIONS.map(option => <button key={option} type="button" className={styles.typeChoice} aria-pressed={teamSelection === option}
                        onClick={() => setTeamSelection(option)}>{option}</button>)}
                    </div>
                  </div>
                  </>}
                  {/* Who's playing (individual) or the teams (team: once Manual / Draft / Random is picked). */}
                  {competitionType[group.key] && (group.key !== "team" || teamSelection) && <>
                  {/* The trip's players under each type as checkboxes in two columns, filled down the left first (left gets the extra); Select all heads the list. */}
                  {group.key === "team" ? <div className={styles.typePlayers}>
                    {/* Random: deal everyone onto teams; tap again for a new shuffle (until the teams are submitted). */}
                    {teamSelection === "Random" && !submittedTeams && <button type="button" className={`${styles.typeChoice} ${styles.randomizeButton}`} onClick={randomizeTeams}>
                      <Shuffle size={15} strokeWidth={2.25} aria-hidden /> {teamAssigned ? "Randomize again" : "Randomize teams"}
                    </button>}
                    <div className={styles.teamColumns}>
                      {(submittedTeams ?? teamSplit).map((team, column) => <div key={column}>
                        {/* Team Color: a small pill; tap it for the color list (a color the other team has is taken). */}
                        {(() => {
                          const color = teamColor(teamColors[column]);
                          return <div className={styles.teamColorField}>
                            <span className={styles.teamFieldLabel}>Team Color</span>
                            <button type="button" className={styles.teamColorPill} disabled={!!submittedTeams} aria-haspopup="listbox" aria-expanded={colorPicker === column}
                              aria-label={`Team ${teamLetter(column)} color: ${color?.name ?? "not picked"}`}
                              style={color ? { background: color.base, color: color.text, borderColor: color.secondary } : undefined}
                              onClick={() => setColorPicker(open => open === column ? null : column)}>{color?.name ?? "Pick"}</button>
                            {colorPicker === column && !submittedTeams && <ul className={styles.teamColorList} role="listbox" aria-label={`Team ${teamLetter(column)} color`}>
                              {TEAM_COLORS.map(option => {
                                const taken = teamColors.some((id, other) => other !== column && id === option.id);
                                return <li key={option.id}>
                                  <button type="button" role="option" aria-selected={option.id === teamColors[column]} disabled={taken}
                                    onClick={() => { setTeamColors(current => { const next = [...current]; next[column] = option.id; return next; }); setColorPicker(null); }}>
                                    <span className={styles.teamColorSwatch} style={{ background: option.base, borderColor: option.secondary }} aria-hidden />
                                    {option.name}{taken ? " (taken)" : ""}
                                  </button>
                                </li>;
                              })}
                            </ul>}
                          </div>;
                        })()}
                        {submittedTeams ? <div className={styles.typePlayersHeader}>{teamLabels[column]}</div>
                          : <>
                            <span className={styles.teamFieldLabel}>Team Name</span>
                            <input type="text" className={styles.teamNameInput} aria-label={`Team ${teamLetter(column)} name`} placeholder="Create team name" value={teamNames[column] ?? ""}
                              onChange={event => setTeamNames(current => { const next = [...current]; next[column] = event.target.value; return next; })} />
                          </>}
                        <ul className={styles.teamColumnList} aria-label={`${teamLabels[column]} players`}>
                          {team.map(index => <li key={index} className={styles.teamPlayerRow}>
                            <ShortName name={playerName(index)} />
                            {!submittedTeams && <button type="button" className={styles.swapButton} aria-haspopup="dialog" aria-label={`Move or swap ${playerName(index)}`} onClick={() => { setSwapTarget(null); setSwapFrom(index); }}><ArrowLeftRight size={14} strokeWidth={2.25} aria-hidden /></button>}
                          </li>)}
                          {/* Draft: the team fills up in the draft. */}
                          {teamSelection === "Draft" && !team.length && <li className={styles.draftNote}>Picked in the draft</li>}
                          {/* Manual: one + Add Player row per open spot on this team. */}
                          {!submittedTeams && teamSelection === "Manual" && Array.from({ length: Math.max(0, teamSizes[column] - team.length) }, (_, open) => <li key={`open-${open}`}>
                            <button type="button" className={styles.addTeamPlayer} aria-haspopup="dialog" onClick={() => openAddPlayer(column)}><Plus size={14} strokeWidth={2.5} aria-hidden /> Add Player</button>
                          </li>)}
                        </ul>
                      </div>)}
                    </div>
                    {/* Draft: when the draft happens, and its order. */}
                    {teamSelection === "Draft" && <div className={styles.draftSettings} role="group" aria-label="Draft settings">
                      <div className={styles.totalPlayers}>
                        <span className={styles.typeHeading}>Draft date</span>
                        <DatePicker className={styles.draftInput} aria-label="Draft date" value={draftDate} onChange={event => { if(checkDraftSchedule({draftDate:event.target.value})) setDraftDate(event.target.value); }} />
                      </div>
                      <div className={styles.totalPlayers}>
                        <span className={styles.typeHeading}>Draft time</span>
                        <TimePicker className={styles.draftInput} label="Draft time" value={draftTime} onChange={time=>{if(checkDraftSchedule({draftTime:time}))setDraftTime(time);}} />
                      </div>
                      <span className={styles.typeHeading}>Draft type</span>
                      <div className={styles.draftTypes} role="group" aria-label="Draft type">
                        {DRAFT_METHODS.map(option => <button key={option} type="button" className={styles.typeChoice} aria-pressed={draftMethod === option} onClick={() => setDraftMethod(option)}>{option}</button>)}
                      </div>
                      {draftMethod === "Captain's Picks" && <>
                        <span className={styles.typeHeading}>Draft order</span>
                        <div className={styles.draftTypes} role="group" aria-label="Draft order">
                          {DRAFT_ORDERS.map(option => <button key={option} type="button" className={styles.typeChoice} aria-pressed={draftOrder === option} onClick={() => setDraftOrder(option)}>{option}</button>)}
                        </div>
                        <p className={styles.statNote}>{draftOrder === "Snake" ? "Snake: the pick order flips every round (A, B, then B, A...), so no team always picks first." : "Straight: the same pick order every round (A, B, then A, B...)."}</p>
                      </>}
                    </div>}
                    {/* Submit teams lights up once every player is on a team; after submitting it becomes Undo & Change. Draft: the draft sets the teams. */}
                    {teamSelection === "Draft" ? null : submittedTeams ? <button type="button" className={`${styles.typeChoice} ${styles.selectTeams}`} onClick={() => setSubmittedTeams(null)}>Undo &amp; Change</button>
                      : <button type="button" className={`${styles.typeChoice} ${styles.selectTeams}`} disabled={!allPicked} onClick={() => { saveSection(() => ({ ...teamsSection(), submittedTeams: teamSplit })); setSubmittedTeams(teamSplit); }}>Submit teams</button>}
                  </div> : playerChecklist(`${group.title} players`, typePlayers[group.key], next => setTypePlayers(current => ({ ...current, [group.key]: next })))}
                  </>}
                  </fieldset>
                  {/* Saves the whole competition: type, players / teams (Manual and Random need submitted teams; Draft its settings). */}
                  <button type="button" className={`${styles.typeChoice} ${styles.selectTeams} ${styles.compLockButton}`}
                    disabled={!lockedComp[group.key] && group.key === "team" && !!competitionType.team && (!teamSelection || (teamSelection !== "Draft" && !submittedTeams))}
                    onClick={() => {
                      if (!lockedComp[group.key]) saveSection(saved => ({ lockedComp: { ...saved.lockedComp, [group.key]: true },
                        typePlayers: { ...saved.typePlayers, [group.key]: typePlayers[group.key] },
                        ...(group.key === "individual" ? { competitionType: { ...saved.competitionType, individual: competitionType.individual } }
                          : { ...teamSizeSection(saved), ...teamsSection(), teamChoiceSaved, submittedTeams, draftDate, draftTime, draftOrder, draftMethod }) }));
                      setLockedComp(current => ({ ...current, [group.key]: !current[group.key] }));
                    }}>
                    {lockedComp[group.key] ? "Undo and Change" : "Submit & Save"}
                  </button>
                </div>)}
              </div>
              {/* No competition (Individual and Team both None): players can still score in the app, or not at all. */}
              {!competitionType.individual && !competitionType.team && <div className={styles.totalPlayers}>
                <span className={styles.typeHeading}>Score in the app</span>
                <button type="button" role="switch" aria-checked={inAppScoring} aria-label="Score in the app" className={toggleStyles.toggle} onClick={() => setInAppScoring(!inAppScoring)}>
                  <span className={toggleStyles.track} data-on={inAppScoring}><span className={toggleStyles.thumb} /></span><span>{inAppScoring ? "On" : "Off"}</span>
                </button>
              </div>}
            </section>}
            {competitionSection === "Summary" && <section className={tripStyles.infoSection} aria-label="Summary">
              {overviewType === "team" ? (() => {
                const slots = competitionType.team ? Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => scheduleSlot(day, slot))).flat()
                  .filter(slot => slot.course !== "Course TBD" && (compRounds[slot.key] ?? true)) : [];
                const rows = slots.map(slot => ({ ...slot, settings: compFormats[slot.key] ?? sourceRoundComp(slot.key) }));
                const matches = rows.reduce((sum, row) => sum + roundMatches(row.settings), 0);
                const points = rows.reduce((sum, row) => sum + roundPointsAvailable(row.settings), 0);
                return <>
                  <dl className={styles.teamSummaryChoices}>
                    <div><dt>Competition</dt><dd>{competitionType.team ?? "None"}</dd></div>
                    <div><dt>Team selection</dt><dd>{competitionType.team ? teamSelection ?? "Not chosen" : "—"}</dd></div>
                    <div><dt>If Tie</dt><dd>{competitionType.team ? selectedTeamTie : "—"}</dd></div>
                  </dl>
                  <div className={styles.teamSummaryTableWrap}>
                    <table className={styles.teamSummaryTable} aria-label="Team competition round formats and points">
                      <thead><tr><th scope="col">Format</th><th scope="col">Type</th><th scope="col">Matches</th><th scope="col">Pts per</th><th scope="col">Pts Avail</th></tr></thead>
                      <tbody>{rows.map(row => <tr key={row.key}>
                        <th scope="row">Round {row.number}<small>{row.course}</small></th>
                        <td>{row.settings.format === "Alternate Shot" ? "Alt Shot" : row.settings.format}</td>
                        <td>{roundMatches(row.settings)}</td>
                        <td>{row.settings.matchType === "Match Play" ? pointsPerMatchTotal(row.settings) : "—"}</td>
                        <td>{roundPointsAvailable(row.settings)}</td>
                      </tr>)}</tbody>
                      <tfoot><tr><th scope="row">Total</th><td>{rows.length} rounds</td><td>{matches}</td><td>—</td><td>{points}</td></tr></tfoot>
                    </table>
                  </div>
                  <dl className={styles.overview}>{competitionSummary().filter(([label]) => !["Competition", "Team selection", "Rounds", "Points"].includes(label) && !/^Round \d+$/.test(label)).map(([label, value]) => <div key={label} className={styles.overviewRow}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                </>;
              })() : (() => {
                // Individual: the format, players and Skins on top, then each round (its format, players and skins), then
                // who's playing and whether it's saved.
                const type = competitionType.individual;
                const playing = [...typePlayers.individual].sort((x, y) => x - y);
                const slots = Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => scheduleSlot(day, slot))).flat();
                const skinsCount = slots.filter(slot => roundSkinsOn(slot.key)).length;
                return <>
                  <dl className={styles.teamSummaryChoices}>
                    <div><dt>Competition</dt><dd>{type ?? "None"}</dd></div>
                    <div><dt>Players</dt><dd>{type ? `${playing.length} of ${playerTotal}` : "—"}</dd></div>
                    <div><dt>Skins</dt><dd>{skinsOn ? "On" : "Off"}</dd></div>
                  </dl>
                  {(type || skinsOn) && <div className={styles.teamSummaryTableWrap}>
                    <table className={styles.teamSummaryTable} aria-label="Individual competition rounds">
                      <thead><tr><th scope="col">Round</th><th scope="col">Format</th><th scope="col">Players</th><th scope="col">Skins</th></tr></thead>
                      <tbody>{slots.map(slot => <tr key={slot.key}>
                        <th scope="row">Round {slot.number}<small>{slot.course}</small></th>
                        <td>{type ?? "—"}</td>
                        <td>{type ? playing.length : "—"}</td>
                        <td>{roundSkinsOn(slot.key) ? `${roundSkinsPlayers(slot.key).size} players` : "Off"}</td>
                      </tr>)}</tbody>
                      <tfoot><tr><th scope="row">Total</th><td>{slots.length} rounds</td><td>—</td><td>{skinsOn ? `${skinsCount} rounds` : "Off"}</td></tr></tfoot>
                    </table>
                  </div>}
                  <dl className={styles.overview}>
                    {type && <div className={styles.overviewRow}><dt>Players</dt><dd>{playing.length ? playing.map(playerName).join(", ") : "None picked yet"}</dd></div>}
                    {!type && !competitionType.team && <div className={styles.overviewRow}><dt>Score in the app</dt><dd>{inAppScoring ? "On" : "Off"}</dd></div>}
                    {type && <div className={styles.overviewRow}><dt>Status</dt><dd>{lockedComp.individual ? "Saved" : "Not saved yet"}</dd></div>}
                  </dl>
                </>;
              })()}
            </section>}
            {/* One section per trip day (Arrival to Departure): centered Day N, its date small underneath, then a line and that day's rounds. */}
            {/* Format: just the round boxes (no day headers). Each box: Date / Round # / course (+ format when on), with a Comp switch top right; tap a comp round for its competition settings. On = a competition round (box lit); off = not (box greyed). */}
            {competitionSection === "Format" && overviewType === "team" && <div className={styles.formatRounds}>
              {Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => {
                const noTeamCompetition = overviewType === "team" && !competitionType.team && (lockedComp.team || teamChoiceSaved);
                const round = scheduleSlot(day, slot), inComp = !noTeamCompetition && (compRounds[round.key] ?? true);
                return <div key={round.key} className={`${styles.compRoundRow} ${styles.scheduleRoundCard} ${styles.formatRoundCard}`} data-comp={inComp}>
                  {/* A comp round opens its competition settings; a non-comp round can't be opened. */}
                  <button type="button" className={styles.roundCardButton} disabled={!inComp} aria-label={`Round ${round.number}: ${round.course}. Competition settings`} onClick={() => setCompRoundSlot({ day, slot })}>
                    <span className={tripStyles.eventInfo}>
                      <span className={styles.roundCardPlace}>{golfDate(day)}</span>
                      <span className={tripStyles.eventHost}>Round {round.number}</span>
                      <span className={tripStyles.eventTitle}>{round.course}</span>
                      {inComp && <span className={styles.roundCardPlace}>{(compFormats[round.key] ?? sourceRoundComp(round.key)).format} · {(compFormats[round.key] ?? sourceRoundComp(round.key)).matchType}</span>}
                    </span>
                  </button>
                  <button type="button" role="switch" aria-checked={inComp} aria-label={`Round ${round.number} is a competition round`} disabled={noTeamCompetition || playState(round.key, round.number).started} className={styles.formatSwitch} onClick={() => inComp ? setConfirmCompOff(round.key) : setCompRounds(current => ({ ...current, [round.key]: true }))}>
                    <span className={styles.formatThumb} />
                  </button>
                </div>;
              }))}
            </div>}
            {/* Turning a round off: Keep in Competition cancels; Confirm takes it out and removes its format. */}
            {confirmCompOff && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Remove round from competition">
              <div className={tripStyles.deleteDialog}>
                <p className={tripStyles.deletePrompt}>Removing this round from competition will remove its format</p>
                <button type="button" className={tripStyles.cancelButton} onClick={() => setConfirmCompOff(null)}>Keep in Competition</button>
                <button type="button" className={tripStyles.deleteButton} onClick={() => {
                  setCompRounds(current => ({ ...current, [confirmCompOff]: false }));
                  setCompFormats(current => { const next = { ...current }; delete next[confirmCompOff]; return next; });
                  setConfirmCompOff(null);
                }}>Confirm</button>
              </div>
            </div>}
            {/* Add Player drop-down: slides from the top to 80% of the screen; a list of players not on a team. Tap one, then Add to <team> on its right. */}
            {addingToTeam !== null && <div className={`${styles.teamsDropdown} ${styles.addPlayerDropdown}`} role="dialog" aria-modal="false" aria-label={`Add player to ${teamLabels[addingToTeam]}`}>
              <button type="button" className={tripStyles.sheetClose} aria-label="Close add player" onClick={() => setAddingToTeam(null)}><X size={18} strokeWidth={2.25} aria-hidden /></button>
              <h3 className={gamesStyles.sheetTitle}>Add Player</h3>
              <ul className={styles.addPlayerList}>
                {teamSplit[addingToTeam].length < teamSizes[addingToTeam] && rosterSlots.filter(index => teamPicks[index] === undefined || teamPicks[index] >= teamCount).map(index => <li key={index} className={styles.addPlayerRow} data-selected={addPick === index}>
                  <button type="button" className={styles.addPlayerName} aria-pressed={addPick === index} onClick={() => setAddPick(index)}>{playerName(index)}</button>
                  {addPick === index && <button type="button" className={styles.addToTeam} onClick={() => { setTeamPicks(current => ({ ...current, [index]: addingToTeam })); setAddingToTeam(null); }}>Add to {teamLabels[addingToTeam]}</button>}
                </li>)}
              </ul>
              {teamSplit[addingToTeam].length >= teamSizes[addingToTeam] && <p className={gamesStyles.sheetHint}>{teamLabels[addingToTeam]} is full.</p>}
            </div>}
            {/* Swap / move drop-down: both teams with their spots, like moving a roster spot in a fantasy app. */}
            {swapFrom !== null && teamPicks[swapFrom] !== undefined && (() => {
              const fromTeam = teamPicks[swapFrom];
              const close = () => { setSwapFrom(null); setSwapTarget(null); };
              return <div className={`${styles.teamsDropdown} ${styles.addPlayerDropdown}`} role="dialog" aria-modal="false" aria-label={`Move ${playerName(swapFrom)}`}>
                <button type="button" className={tripStyles.sheetClose} aria-label="Close swap players" onClick={close}><X size={18} strokeWidth={2.25} aria-hidden /></button>
                <h3 className={gamesStyles.sheetTitle}>Move {playerName(swapFrom)}</h3>
                {teamLabels.map((_, team) => <section key={team} className={styles.swapTeam} aria-label={teamLabels[team]}>
                  <h4 className={styles.summaryTeam}>{teamLabels[team]}</h4>
                  <ul className={styles.addPlayerList}>
                    {teamSplit[team].map(index => {
                      const selectable = team !== fromTeam;
                      const picked = swapTarget !== null && "player" in swapTarget && swapTarget.player === index;
                      return <li key={index} className={styles.addPlayerRow} data-selected={picked || index === swapFrom}>
                        <button type="button" className={styles.addPlayerName} disabled={!selectable} aria-pressed={picked} onClick={() => setSwapTarget({ player: index })}>{playerName(index)}</button>
                        {picked && <button type="button" className={styles.addToTeam} onClick={() => { setTeamPicks(current => ({ ...current, [swapFrom]: team, [index]: fromTeam })); close(); }}>Swap players</button>}
                      </li>;
                    })}
                    {Array.from({ length: Math.max(0, teamSizes[team] - teamSplit[team].length) }, (_, open) => {
                      const selectable = team !== fromTeam;
                      const picked = selectable && swapTarget !== null && "emptyTeam" in swapTarget && swapTarget.emptyTeam === team && swapTarget.open === open;
                      return <li key={`open-${open}`} className={`${styles.addPlayerRow} ${styles.emptySpot}`} data-selected={picked}>
                        <button type="button" className={styles.addPlayerName} disabled={!selectable} aria-pressed={picked} onClick={() => setSwapTarget({ emptyTeam: team, open })}>Empty spot</button>
                        {picked && <button type="button" className={styles.addToTeam} onClick={() => { setTeamPicks(current => ({ ...current, [swapFrom]: team })); close(); }}>Add to {teamLabels[team]}</button>}
                      </li>;
                    })}
                  </ul>
                </section>)}
              </div>;
            })()}
            {confirmDeleteRoundId && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Delete round confirmation">
              <div className={tripStyles.deleteDialog}>
                <p className={tripStyles.deletePrompt}>Are you sure?</p>
                <button type="button" className={tripStyles.cancelButton} onClick={() => setConfirmDeleteRoundId(null)}>Keep editing</button>
                <button type="button" className={tripStyles.deleteButton} onClick={() => { competition.removeRound(confirmDeleteRoundId); setConfirmDeleteRoundId(null); }}>Delete</button>
              </div>
            </div>}
          </div>}
      </div> : null}

      {<div hidden={!gamesOpen || competitionOpen} className={styles.competition}>
        {selectedGame ? <GolfTripCompetition rounds={[gameSettings]} onChange={change => setGameSettings(current => ({ ...current, ...change }))} showBulk={false} /> : <div className={styles.gameGroups}>
          {/* Which round these switches are for; each round shows how many games it has. */}
          {(() => {
            const numbers = Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => scheduleSlot(day, slot).number)).flat();
            return numbers.length > 0 && <div className={styles.gameRoundPicker} role="group" aria-label="Round">
              {numbers.map(number => <button key={number} type="button" aria-pressed={gameRound === number} onClick={() => setGameRound(number)}>
                Round {number}{gameRounds[number]?.length ? <small>{gameRounds[number].length}</small> : null}
              </button>)}
            </div>;
          })()}
          {Object.entries(GAME_GROUPS).map(([label, games]) => <section key={label} className={styles.gameGroup}>
            <h2 className={styles.gameHeading}>{label}</h2>
            {games.map(game => {
              const isExpanded = expandedGameId === game.id;
              return <div key={game.id} className={styles.gameRowWrapper}>
                <div className={styles.gameRowLine}>
                  <button type="button" className={styles.gameRow} aria-expanded={isExpanded} onClick={() => setExpandedGameId(isExpanded ? null : game.id)}>
                    <span className={styles.gameInfo}>
                      <span className={styles.gameLabel}>{game.name}</span>
                      <span className={styles.gameMeta}>{game.players}</span>
                    </span>
                    <span className={`${styles.gameToggle} ${isExpanded ? styles.gameToggleOpen : ""}`} aria-hidden>▾</span>
                  </button>
                  {/* On / off for the selected round: everyone's Games tab gets it for that round. */}
                  {(() => {
                    const play = ORGANIZER_GAME_TO_PLAY[game.id];
                    const on = !!play && (gameRounds[gameRound] ?? []).includes(play);
                    const toggle = () => { if (!play) return; const list = gameRounds[gameRound] ?? []; const next = { ...gameRounds, [gameRound]: on ? list.filter(id => id !== play) : [...list, play] };
                      setGameRounds(next); saveSection(() => ({ gameRounds: next })); };
                    return <button type="button" role="switch" aria-checked={on} disabled={!play} aria-label={`${game.name} in Round ${gameRound}`} className={toggleStyles.toggle} onClick={toggle}>
                      <span className={toggleStyles.track} data-on={on}><span className={toggleStyles.thumb} /></span>
                    </button>;
                  })()}
                </div>
                <div hidden={!isExpanded} className={styles.gameDropdown}>
                  <GolfGameScoringSettings game={game.id} />
                </div>
              </div>;
            })}
          </section>)}
        </div>}
      </div>}

      {teeTimePicker && <TeeTimePicker key={`${teeTimePicker.key}-${teeTimePicker.startGroup ?? 0}`} fixedGroups={teeTimePicker.fixedGroups} startGroup={teeTimePicker.startGroup} course={teeTimePicker.course} date={teeTimePicker.date} round={teeTimePicker.round} value={teeTimes[teeTimePicker.key] ?? (pickedCourses[teeTimePicker.key]?.settings?.teeTime ? [pickedCourses[teeTimePicker.key]!.settings!.teeTime] : undefined)}
        onClose={() => setTeeTimePicker(null)} onSave={times => { const roundNumber = teeTimePicker.round; const play = playState(teeTimePicker.key, roundNumber); const previous = teeTimes[teeTimePicker.key] ?? []; if (previous.some((_, group) => play.groupStarted(group) && !times[group])) return; saveSection(saved => ({ teeTimes: { ...saved.teeTimes, [teeTimePicker.key]: times } })); setTeeTimes(current => ({ ...current, [teeTimePicker.key]: times })); setTeeTimePicker(null); }} />}
      {/* Edit course pop-up: picking one makes that round's course (its tee times / settings stay). */}
      {roundsOpen && editCourse && (() => {
        const round = scheduleSlot(editCourse.day, editCourse.slot);
        return <CourseEditSheet roundLabel={round.label} current={round.course} title={editCourse.adding ? "Select course" : "Edit course"} onClose={() => setEditCourse(null)}
          shortName={courseShortNames[round.course]} onShortName={shortName => setCourseShortNames(current => {
            const next = { ...current };
            if (shortName) next[round.course] = shortName; else delete next[round.course];
            return next;
          })}
          onPick={course => { setPickedCourses(current => ({ ...current, [round.key]: { ...course, settings: current[round.key]?.settings } })); setEditCourse(null); }} />;
      })()}
      {coursePicker && <TripScheduleCoursePicker roundLabel={coursePicker.label} current={pickedCourses[coursePicker.key]} onClose={() => setCoursePicker(null)}
        onPick={(course) => { setPickedCourses(current => ({ ...current, [coursePicker.key]: course })); setCoursePicker(null); }} />}
      {datePickerOpen && <GolfTripDatePicker arrival={arrivalIso} departure={departureIso} maxDays={MAX_DAYS}
        onSubmit={setTripDates} onClose={() => setDatePickerOpen(false)} />}

      {roundsOpen && scheduleRound && (() => {
        // Round settings page: course + date header, then Tee Times | Players (tap a group's players to assign up to 4). + Add Tee Time opens the tee time sheet.
        const round = scheduleSlot(scheduleRound.day, scheduleRound.slot);
        const date = golfIso(scheduleRound.day);
        const play = playState(round.key, round.number);
        const groups = teePlayers[round.key] ?? {};
        const groupOf = (player: number) => Object.entries(groups).find(([, list]) => list.includes(player))?.[0];
        const togglePlayer = (group: number, player: number) => { if (play.groupStarted(group)) return; setTeePlayers(current => {
          const list = current[round.key]?.[group] ?? [];
          const next = list.includes(player) ? list.filter(value => value !== player) : list.length < 4 ? [...list, player] : list;
          return { ...current, [round.key]: { ...current[round.key], [group]: next } };
        }); };
        const comp = compRounds[round.key] !== false ? compFormats[round.key] ?? sourceRoundComp(round.key) : null;
        return <div className={styles.competition}>
          <div className={styles.roundDayHeader}>
            <div className={styles.roundCourseActions}>
              <button type="button" className={styles.editCourse} disabled={play.started} aria-haspopup="dialog" aria-label={`Edit course for ${round.label}`} onClick={() => setEditCourse(scheduleRound)}>Edit</button>
              <button type="button" className={`${styles.editCourse} ${styles.deleteRound}`} disabled={anyPlayStarted} aria-haspopup="dialog" onClick={() => setDeleteScheduleRound(true)}>Delete Round</button>
            </div>
            <div className={styles.roundCourseLine}>
              <h2 title={round.course} data-length={round.course.length > 44 ? "longer" : round.course.length > 28 ? "long" : undefined}>{round.course}</h2>
            </div>
            <time dateTime={date}>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))} · Round {round.number}</time>
          </div>
          {comp && <div className={styles.roundCompOverview}>
            <strong>Competition Round {round.number}</strong>
            <span>{comp.format}</span>
          </div>}
          <div className={styles.scheduleTabs} role="group" aria-label="Round schedule view">
            {(["Tee times", "Course Yardage"] as const).map(tab => <button key={tab} type="button" aria-pressed={scheduleTab === tab} onClick={() => setScheduleTab(tab)}>{tab}</button>)}
          </div>
          <p className={styles.scheduleLockNote}>{scheduleTab === "Tee times" ? "Started groupings lock. Tee times remain editable." : "Tees and yardages lock when the first group starts."}</p>
          {scheduleTab === "Tee times" && <section className={styles.teeTable} aria-label={comp ? "Competition tee times" : "Tee times and players"}>
            <div className={styles.teeTableHeader} aria-hidden="true"><span>Tee Times</span>{!comp && <span>Players</span>}</div>
            {comp && <p className={styles.roundSettingsEmpty}>Create matchups in Matchup Selection settings</p>}
            {round.groupTimes.length ? round.groupTimes.map((time, group) => {
              const names = (groups[group] ?? []).filter(player => player < playerTotal);
              return <div key={group} className={styles.teeTableRow}>
                {comp ? <button type="button" className={styles.teeTableTime} aria-haspopup="dialog" aria-label={`Group ${group + 1} tee time: ${teeTimeLabel(time)}`}
                  onClick={() => setTeeTimePicker({ key: round.key, course: round.course, date: golfDate(scheduleRound.day), round: round.number })}>
                  <small>Group {group + 1}</small>{teeTimeLabel(time)}
                </button> : <span className={styles.teeTableTime}><small>Group {group + 1}</small>{teeTimeLabel(time)}</span>}
                {!comp && <button type="button" className={styles.teeTablePlayers} disabled={play.groupStarted(group)} aria-haspopup="dialog" aria-label={`Group ${group + 1} players: ${names.length ? names.map(playerName).join(", ") : "none"}`} onClick={() => setTeePlayersGroup(group)}>
                  {names.length ? names.map(player => <ShortName key={player} name={playerName(player)} />) : <span className={styles.teeTableAdd}><Plus size={13} strokeWidth={2.5} aria-hidden /> Add Players</span>}
                </button>}
                <button type="button" className={styles.startGroup} disabled={!!livePanels || play.groupStarted(group)} onClick={() => {
                  if (play.groupStarted(group)) return;
                  const at = new Date().toISOString();
                  setGroupStarts(current => ({ ...current, [round.key]: { ...current[round.key], [group]: at } }));
                  if (!play.started) dispatchDevRounds({ type: "setTripRound", tripRoundId: scopedRoundId(scoringTripId ?? DEV_TRIP_ID, round.number), state: "open", at });
                }}>{play.groupStarted(group) ? "Started" : comp ? "Start match group" : "Start group"}</button>
              </div>;
            }) : <p className={styles.roundSettingsEmpty}>No tee times yet.</p>}
            <button type="button" className={styles.addRound} aria-haspopup="dialog" onClick={() => setTeeTimePicker({ key: round.key, course: round.course, date: golfDate(scheduleRound.day), round: round.number })}><Plus size={14} strokeWidth={2.5} aria-hidden /> Add Tee Time</button>
          </section>}
          {/* Tee box (one for the round, or Set per hole), then the scorecard: hole / par, tee / yardage. */}
          {scheduleTab === "Course Yardage" && <RoundTeeBoxes key={`${round.key}-${pickedCourses[round.key]?.ref ?? ""}`} courseRef={pickedCourses[round.key]?.ref} value={roundTees[round.key] ?? NO_ROUND_TEES} playLocked={play.started}
            affectedCards={devRounds.rounds.filter(card => card.tripRoundId === scopedRoundId(scoringTripId ?? DEV_TRIP_ID, round.number)).length}
            onChange={(next, reason) => {
              if (play.started && !reason) return;
              if (reason) setYardageCorrections(current => ({ ...current, [round.key]: [...(current[round.key] ?? []), { at: new Date().toISOString(), reason, before: roundTees[round.key] ?? NO_ROUND_TEES, after: next, affectedCards: devRounds.rounds.filter(card => card.tripRoundId === scopedRoundId(scoringTripId ?? DEV_TRIP_ID, round.number)).map(card => card.id) }] }));
              setRoundTees(current => ({ ...current, [round.key]: next }));
            }} />}
          {scheduleTab === "Course Yardage" && (yardageCorrections[round.key] ?? []).length > 0 && <div className={styles.scheduleLockNote}>
            <strong>Course corrections</strong>
            {(yardageCorrections[round.key] ?? []).map((entry, index) => <p key={index}>{new Date(entry.at).toLocaleString()} {entry.reason} ({entry.affectedCards.length} player cards to review)</p>)}
          </div>}
          {/* H5C: a saved trip's confirmed round pars + shotgun starting holes (organizer; not in the dev simulator). */}
          {scheduleTab === "Course Yardage" && savedSetup && !savedSetup.readOnly && scoringTripId && <TripRoundPars key={`${scoringTripId}-${round.number}`} tripId={scoringTripId} roundNumber={round.number} />}
          {/* Players drop-down for one group: tick up to 4; anyone already in another group this round is shown with that group and can't be picked. */}
          {!comp && teePlayersGroup !== null && !play.groupStarted(teePlayersGroup) && <div className={`${styles.teamsDropdown} ${styles.addPlayerDropdown}`} role="dialog" aria-modal="false" aria-label={`Group ${teePlayersGroup + 1} players`}>
            <button type="button" className={tripStyles.sheetClose} aria-label="Close players" onClick={() => setTeePlayersGroup(null)}><X size={18} strokeWidth={2.25} aria-hidden /></button>
            <h3 className={gamesStyles.sheetTitle}>Group {teePlayersGroup + 1}{round.groupTimes[teePlayersGroup] ? ` · ${teeTimeLabel(round.groupTimes[teePlayersGroup])}` : ""}</h3>
            <p className={gamesStyles.sheetHint}>{(groups[teePlayersGroup] ?? []).length} of 4 players</p>
            <ul className={styles.addPlayerList}>
              {rosterSlots.map(player => {
                const other = groupOf(player);
                const inThis = (groups[teePlayersGroup] ?? []).includes(player);
                const full = !inThis && (groups[teePlayersGroup] ?? []).length >= 4;
                const taken = other !== undefined && Number(other) !== teePlayersGroup;
                // The player's own Play / Sit out for this round: "I'm out" greys them out and they can't be picked.
                const rsvp = roundRsvps[round.number]?.[playerName(player)] ?? (other !== undefined ? "in" : undefined);
                const sittingOut = rsvp === "out" && !inThis;
                return <li key={player} className={styles.addPlayerRow} data-selected={inThis} data-out={sittingOut}>
                  <label className={styles.teePlayerPick}>
                    <input type="checkbox" checked={inThis} disabled={taken || full || sittingOut} onChange={() => togglePlayer(teePlayersGroup, player)} />
                    <span className={styles.teePlayerName}>
                      {playerName(player)}
                      {rsvp && <em className={styles.rsvpNote} data-rsvp={rsvp}>{rsvp === "in" ? "I'm in!" : "I'm out"}</em>}
                    </span>
                    {taken && <small>Group {Number(other) + 1}</small>}
                  </label>
                </li>;
              })}
            </ul>
          </div>}
        </div>;
      })()}
      {/* Match Selection: every round, laid out like Golf Schedule (Day N + date, a cream box per round); tap one to choose
          how its matches are made. */}
      {matchesOpen && !matchRound && <div className={styles.competition}>
        {/* Match Selection Type: every round at once. Select per round on greys this out (each round is set on its own page);
            off, Manual selection or Match Draft (and its type) here sets them all. Match drafts can be changed later in the
            Match Draft room. */}
        <section className={`${tripStyles.infoSection} ${styles.matchType}`} aria-label="Match Selection Type">
          <h3 className={styles.matchTypeTitle}>Match Selection Type</h3>
          <div className={styles.totalPlayers}>
            <span className={styles.typeHeading}>Select per round</span>
            <button type="button" role="switch" aria-checked={matchPerRound} aria-label="Select per round" disabled={anyPlayStarted} className={toggleStyles.toggle} onClick={() => setMatchPerRound(!matchPerRound)}>
              <span className={toggleStyles.track} data-on={matchPerRound}><span className={toggleStyles.thumb} /></span><span>{matchPerRound ? "On" : "Off"}</span>
            </button>
          </div>
          <fieldset className={styles.compLock} disabled={matchPerRound || anyPlayStarted} aria-label="All rounds">
            {([["Manual selection", "Manual"], ["Match Draft", "Match Draft"]] as const).map(([label, method]) => {
              const on = allRoundsMatch.method === method;
              return <div key={method} className={styles.totalPlayers}>
                <span className={styles.typeHeading}>{label}</span>
                <button type="button" role="switch" aria-checked={on} aria-label={label} className={toggleStyles.toggle}
                  onClick={() => setAllRoundsMatch(current => ({ ...current, method: on ? null : method }))}>
                  <span className={toggleStyles.track} data-on={on}><span className={toggleStyles.thumb} /></span><span>{on ? "Yes" : "No"}</span>
                </button>
              </div>;
            })}
            {allRoundsMatch.method === "Match Draft" && <div className={styles.teamSelection} role="group" aria-label="Match draft type">
              <span className={styles.typeHeading}>Draft type</span>
              <div className={styles.teamSelectionChoices}>
                {MATCH_DRAFT_TYPES.map(option => <button key={option} type="button" className={styles.typeChoice} aria-pressed={allRoundsMatch.draftType === option}
                  onClick={() => setAllRoundsMatch(current => ({ ...current, draftType: option }))}>{option}</button>)}
              </div>
              <MatchDraftTimingFields type={allRoundsMatch.draftType} value={allRoundsMatch} onChange={change=>setAllRoundsMatch(current=>({...current,...change}))}/>
              <p className={styles.statNote}>Select Match Drafts in each round.</p>
            </div>}
          </fieldset>
        </section>
        <div className={tripStyles.events}>
          {Array.from({ length: golfDayCount }, (_, index) => {
            const date = golfIso(index);
            return <section key={index} className={tripStyles.infoSection} aria-label={`Day ${index + 1}`}>
              <div className={styles.roundDayHeader}>
                <h2>Day {index + 1}</h2>
                <time dateTime={date}>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</time>
              </div>
              {Array.from({ length: roundsPerDay[index] ?? 1 }, (_, slot) => {
                const round = scheduleSlot(index, slot);
                const choice = roundMatchSelection(round.key);
                return <div key={slot} className={`${styles.compRoundRow} ${styles.scheduleRoundCard}`}>
                  <button type="button" className={styles.roundCardButton} aria-label={`${round.label}: ${round.course}. Match selection`} onClick={() => setMatchRound({ day: index, slot })}>
                    <span className={tripStyles.eventInfo}>
                      <span className={tripStyles.eventHost}>Round {round.number}</span>
                      <span className={tripStyles.eventTitle}>{round.course}</span>
                      {round.place && <span className={styles.roundCardPlace}>{round.place}</span>}
                    </span>
                    {/* How this round's matches are made, once chosen. */}
                    <span className={styles.scheduleTeeList}>{choice?.method === "Match Draft" ? `Match Draft${choice.draftType ? ` · ${choice.draftType}` : ""}` : choice?.method ?? "Not set"}</span>
                  </button>
                </div>;
              })}
            </section>;
          })}
        </div>
      </div>}
      {matchesOpen && matchRound && (() => {
        const round = scheduleSlot(matchRound.day, matchRound.slot);
        const date = golfIso(matchRound.day);
        const choice = roundMatchSelection(round.key) ?? NO_MATCH_SELECTION;
        // The round's own draft date and time (editable even when the method and type come from all rounds).
        const own = matchSelections[round.key] ?? NO_MATCH_SELECTION;
        const choose = (change: Partial<MatchSelection>) => { if (playState(round.key, round.number).started || !checkDraftSchedule({matchSelections:{...matchSelections,[round.key]:{...(matchSelections[round.key] ?? NO_MATCH_SELECTION),...change}}})) return; setMatchSelections(current => ({ ...current, [round.key]: { ...(current[round.key] ?? NO_MATCH_SELECTION), ...change } })); };
        return <div className={styles.competition}>
          <div className={styles.roundDayHeader}>
            <div className={styles.roundCourseLine}>
              <h2 title={round.course} data-length={round.course.length > 44 ? "longer" : round.course.length > 28 ? "long" : undefined}>{round.course}</h2>
            </div>
            <time dateTime={date}>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))} · Round {round.number}</time>
          </div>
          {/* The round's tee times (Golf Schedule), above the match selector. */}
          <section className={styles.matchTeeTimes} aria-label="Tee times">
            <span className={styles.typeHeading}>Tee times</span>
            {round.groupTimes.some(Boolean)
              ? <ul>{round.groupTimes.map((time, group) => time && <li key={group}><span>Group {group + 1}</span><span>{teeTimeLabel(time)}</span></li>)}</ul>
              : <p className={styles.statNote}>No tee times yet. Add them on this round in Golf Schedule.</p>}
          </section>
          {/* Match selector: Manual (the organizer enters the matches) or Match Draft (made at a set time, by Response,
              Ranks or Randomized). The method and type are locked to all rounds unless Select per round is on; a draft's
              date and time are always this round's own. */}
          <fieldset className={`${styles.compLock} ${styles.matchSelector}`} disabled={!matchPerRound || playState(round.key, round.number).started} aria-label="Match selection">
            <div className={styles.teamSelection} role="group" aria-label="How matches are made">
              <span className={styles.typeHeading}>Match Selection</span>
              <div className={styles.draftTypes}>
                {MATCH_METHODS.map(option => <button key={option} type="button" className={styles.typeChoice} aria-pressed={choice.method === option} onClick={() => choose({ method: option })}>{option}</button>)}
              </div>
            </div>
            {choice.method === "Manual" && <p className={styles.statNote}>You&apos;ll enter each match yourself: who plays who, and in which tee time.</p>}
            {choice.method === "Match Draft" && <div className={styles.draftSettings} role="group" aria-label="Match draft settings">
              <span className={styles.typeHeading}>Draft type</span>
              <div className={styles.teamSelectionChoices} role="group" aria-label="Match draft type">
                {MATCH_DRAFT_TYPES.map(option => <button key={option} type="button" className={styles.typeChoice} aria-pressed={choice.draftType === option} onClick={() => choose({ draftType: option })}>{option}</button>)}
              </div>
              <MatchDraftTimingFields type={choice.draftType} value={choice} onChange={choose}/>
            </div>}
          </fieldset>
          {choice.method === "Match Draft" && <div className={`${styles.draftSettings} ${styles.matchDraftWhen}`} role="group" aria-label="Match draft date and time">
            <button type="button" className={styles.typeChoice} onClick={() => { setMatchDraftRoomRound(round.key); setMatchDraftRoomOpen(true); }}>Open Match Selector</button>
            <div className={styles.totalPlayers}>
              <span className={styles.typeHeading}>Draft date</span>
              <DatePicker className={styles.draftInput} aria-label="Match draft date" disabled={playState(round.key, round.number).started} value={own.date} onChange={event => choose({ date: event.target.value })} />
            </div>
            <div className={styles.totalPlayers}>
              <span className={styles.typeHeading}>Draft time</span>
              <TimePicker className={styles.draftInput} label="Match draft time" disabled={playState(round.key, round.number).started} value={own.time} onChange={time => choose({ time })} />
            </div>
          </div>}
        </div>;
      })()}
      {roundsOpen && !scheduleRound && <div className={styles.competition}>
        <section className={tripStyles.infoSection} aria-label="Golf Schedule">
          <div className={styles.scheduleColumn}>
            <div className={styles.arrivalDeparture}>
              <div className={styles.typeGroup} role="group" aria-label="Arrival">
                <h4 className={styles.typeHeading}>Arrival</h4>
                <button type="button" className={styles.typeChoice} aria-haspopup="dialog" disabled={anyPlayStarted} onClick={() => setDatePickerOpen(true)}>{dayDate(0)}</button>
              </div>
              <div className={styles.typeGroup} role="group" aria-label="Departure">
                <h4 className={styles.typeHeading}>Departure</h4>
                <button type="button" className={styles.typeChoice} aria-haspopup="dialog" disabled={anyPlayStarted} onClick={() => setDatePickerOpen(true)}>{dayDate(dayCount - 1)}</button>
              </div>
            </div>
            <div className={styles.golfDaySettings}>
            {([["Golf on Arrival Day", golfOnArrival, changeGolfOnArrival], ["Golf on Departure Day", golfOnDeparture, setGolfOnDeparture]] as const).map(([label, on, set]) => <div key={label} className={`${styles.totalPlayers} ${styles.golfDaySetting}`}>
              <span className={styles.typeHeading}>{label}</span>
              <button type="button" role="switch" aria-checked={on} aria-label={label} className={toggleStyles.toggle} disabled={anyPlayStarted} onClick={() => set(!on)}>
                <span className={toggleStyles.track} data-on={on}><span className={toggleStyles.thumb} /></span><span>{on ? "On" : "Off"}</span>
              </button>
            </div>)}
            </div>
          </div>
        </section>
        {/* Day sections use the Competition → Format look: centered Day N + date over a line, each round as a cream box (tap for its settings page), then + Add Round. */}
        <div className={tripStyles.events}>
          {Array.from({ length: golfDayCount }, (_, index) => {
            const perDay = roundsPerDay[index] ?? 0;
            const emptySlot = Array.from({ length: perDay }, (_, slot) => slot).find(slot => scheduleSlot(index, slot).course === "Course TBD");
            const addSlot = emptySlot ?? perDay;
            const date = golfIso(index);
            const dropLine = (at: number) => roundDrop?.day === index && roundDrop.index === at && <div className={styles.roundDropLine} aria-hidden />;
            return <section key={index} className={tripStyles.infoSection} aria-label={`Golf Day ${index + 1}`} data-drop-day={index}>
              <div className={styles.roundDayHeader}>
                <h2>Golf Day {index + 1}</h2>
                <time dateTime={date}>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</time>
              </div>
              {/* Each round is a raised cream box: grip on the left to drag it (within a day or to another day), tap the rest for its settings page. */}
              {Array.from({ length: perDay }, (_, slot) => {
                const round = scheduleSlot(index, slot);
                if (round.course === "Course TBD") return null;
                const dragging = roundDrag?.day === index && roundDrag.slot === slot;
                return <Fragment key={slot}>
                  {dropLine(slot)}
                  <div className={`${styles.compRoundRow} ${styles.scheduleRoundCard} ${dragging ? styles.roundDragging : ""}`} data-drop-day={index} data-drop-slot={slot}
                    style={dragging ? { transform: `translateY(${roundDrag.dy}px)` } : undefined}>
                    <span className={styles.roundGrip} aria-hidden
                      onPointerDown={event => { if (anyPlayStarted) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setRoundDrag({ day: index, slot, startY: event.clientY, dy: 0 }); setRoundDrop(null); }}
                      onPointerMove={event => { if (!dragging) return; setRoundDrag({ ...roundDrag, dy: event.clientY - roundDrag.startY }); setRoundDrop(findRoundDrop(event.clientX, event.clientY, roundDrag)); }}
                      onPointerUp={() => {
                        if (dragging && roundDrop) {
                          const from = { day: roundDrag.day, slot: roundDrag.slot };
                          if (roundDrop.day === from.day) moveRound(from, roundDrop);
                          else setPendingMove({ from, to: roundDrop });
                        }
                        setRoundDrag(null); setRoundDrop(null);
                      }}
                      onPointerCancel={() => { setRoundDrag(null); setRoundDrop(null); }}>
                      <GripVertical size={18} strokeWidth={2.25} />
                    </span>
                    <button type="button" className={styles.roundCardButton} aria-label={`${round.label}: ${round.course}. Round settings`} onClick={() => setScheduleRound({ day: index, slot })}>
                      <span className={tripStyles.eventInfo}>
                        <span className={tripStyles.eventHost}>Round {round.number}</span>
                        <span className={tripStyles.eventTitle}>{round.course}</span>
                        {round.place && <span className={styles.roundCardPlace}>{round.place}</span>}
                      </span>
                      {/* Every group's tee time down the right side; four show, then the list scrolls. */}
                      {round.groupTimes.some(Boolean) && <span className={styles.scheduleTeeList}>
                        {round.groupTimes.map((time, group) => time && <span key={group}>Group {group + 1} · {teeTimeLabel(time)}</span>)}
                      </span>}
                    </button>
                  </div>
                </Fragment>;
              })}
              {dropLine(perDay)}
              {/* + Add Round under the day's last round (or right under the day when it has none); up to 2 rounds a day. */}
              {addSlot < 2 && !anyPlayStarted && <button type="button" className={styles.addRound} aria-haspopup="dialog" onClick={() => { if (emptySlot === undefined) setRoundsPerDay(current => ({ ...current, [index]: (perDay + 1) as 1 | 2 })); setEditCourse({ day: index, slot: addSlot, adding: true }); }}><Plus size={14} strokeWidth={2.5} aria-hidden /> Add Round</button>}
            </section>;
          })}
        </div>
      </div>}

      {deleteScheduleRound && scheduleRound && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Delete round confirmation">
        <div className={tripStyles.deleteDialog}>
          <p className={tripStyles.deletePrompt}>Are you sure you want to delete this round?</p>
          <button type="button" className={tripStyles.deleteButton} onClick={() => {
            if (anyPlayStarted) return;
            const { day, slot } = scheduleRound;
            const count = roundsPerDay[day] ?? 1;
            // Materialize source names before closing the gap so a remaining source round keeps its course.
            const names = { ...slotCourseNames };
            for (let at = 0; at < count; at++) names[`${day}-${at}`] = scheduleSlot(day, at).course;
            setSlotCourseNames(removeScheduleSlot(names, day, slot));
            const formats = { ...compFormats };
            for (let at = 0; at < count; at++) formats[`${day}-${at}`] ??= sourceRoundComp(`${day}-${at}`);
            setCompFormats(removeScheduleSlot(formats, day, slot));
            setPickedCourses(current => removeScheduleSlot(current, day, slot));
            setRoundTees(current => removeScheduleSlot(current, day, slot));
            setTeeTimes(current => removeScheduleSlot(current, day, slot));
            setTeePlayers(current => removeScheduleSlot(current, day, slot));
            setTeeMatches(current => removeScheduleSlot(current, day, slot));
            setCompRounds(current => removeScheduleSlot(current, day, slot));
            setMatchSelections(current => removeScheduleSlot(current, day, slot));
            setGroupStarts(current => removeScheduleSlot(current, day, slot));
            setYardageCorrections(current => removeScheduleSlot(current, day, slot));
            setRoundsPerDay(current => ({ ...current, [day]: Math.max(0, count - 1) as 0 | 1 | 2 }));
            setDeleteScheduleRound(false);
            setScheduleRound(null);
          }}>Confirm</button>
          <button type="button" className={tripStyles.cancelButton} onClick={() => setDeleteScheduleRound(false)}>Keep editing</button>
        </div>
      </div>}

      {/* Leaving a settings page without tapping SAVE: Go back stays on the page; Exit without saving puts the changes back. */}
      {leaveConfirm && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Unsaved changes">
        <div className={tripStyles.deleteDialog}>
          <p className={tripStyles.deletePrompt}>Unsaved changes will be lost</p>
          <button type="button" className={tripStyles.cancelButton} onClick={() => setLeaveConfirm(false)}>Go back</button>
          <button type="button" className={tripStyles.deleteButton} onClick={exitWithoutSaving}>Exit without saving</button>
        </div>
      </div>}

      {/* Moving a round to another day: Undo puts it back, Confirm moves it and resets its settings. */}
      {roundsOpen && pendingMove && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Move round confirmation">
        <div className={tripStyles.deleteDialog}>
          <p className={tripStyles.deletePrompt}>Moving this round will reset its settings</p>
          <button type="button" className={tripStyles.cancelButton} onClick={() => setPendingMove(null)}>Undo</button>
          <button type="button" className={tripStyles.deleteButton} onClick={() => { moveRound(pendingMove.from, pendingMove.to); setPendingMove(null); }}>Confirm</button>
        </div>
      </div>}

      {/* Scorecards → a round: its players, laid out like the Players page; tap a player for their card. */}
      {scorecardRound && scorecardPlayer === null && (() => {
        const round = scheduleSlot(scorecardRound.day, scorecardRound.slot);
        const playing = roundPlayers(round.number);
        return <div className={styles.competition}>
          <section className={leaderboardStyles.match} aria-label="Players">
            <div className={leaderboardStyles.lineupHeader}>
              <h2 className={leaderboardStyles.headerTitle}>Players</h2>
            </div>
            <div>
              <div className={`${leaderboardStyles.single} ${leaderboardStyles.columns} ${styles.playerRow} ${styles.playerListRow}`} aria-hidden="true">
                <span className={leaderboardStyles.columnPlayer}>Player</span>
              </div>
              <ol className={leaderboardStyles.lineup}>
                {playing.map((player, index) => <li key={player} className={`${leaderboardStyles.single} ${styles.playerRow} ${styles.playerListRow}`}>
                  <span className={leaderboardStyles.rank}>{index + 1}</span>
                  <button type="button" className={`${leaderboardStyles.golfer} ${styles.scorecardPlayerButton}`} aria-label={`${playerName(player)} scorecard`} onClick={() => setScorecardPlayer(player)}>
                    <span className={leaderboardStyles.golferName}>{playerName(player)}</span>
                    {!joinedPlayers[player] && <span className={leaderboardStyles.tee}>Open spot</span>}
                  </button>
                </li>)}
              </ol>
              {!playing.length && <p className={styles.statNote}>No players in this round.</p>}
            </div>
          </section>
        </div>;
      })()}
      {/* Scorecards → a round → a player: their card for that round, which the organizer can edit and Save Score. */}
      {scorecardRound && scorecardPlayer !== null && (() => {
        const round = scheduleSlot(scorecardRound.day, scorecardRound.slot);
        const name = playerName(scorecardPlayer);
        const card = roundCard(name, round.number);
        const competition = Boolean(competitionType.individual || competitionType.team) && (compRounds[round.key] ?? true);
        return <div className={styles.competition}>
          <div className={styles.roundDayHeader}>
            <h2>{round.course}</h2>
            <time dateTime={golfIso(scorecardRound.day)}>{golfDate(scorecardRound.day)} · Round {round.number}</time>
          </div>
          <OrganizerScorecard key={`${round.key}|${scorecardPlayer}|${settingsKey(card.holes)}`} name={name} par={card.par} holes={card.holes} editable={Boolean(card.submitted)}
            competition={competition} onSave={(next, account) => saveRoundCard(card, name, next, account)} />
        </div>;
      })()}

      {playersOpen && <div className={styles.competition}>
        <section className={leaderboardStyles.match} aria-label="Players">
            <div className={leaderboardStyles.lineupHeader} role="group" aria-label="Number of players">
              <h2 className={leaderboardStyles.headerTitle}>Players</h2>
              <div className={`${styles.typeChoice} ${styles.stepper}`}>
                <button type="button" aria-label="Fewer players" disabled={playerTotal <= Math.max(1, joinedPlayers.length)} onClick={() => setPlayerTotal(count => Math.max(1, joinedPlayers.length, count - 1))}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
                <span aria-live="polite">{playerTotal}</span>
                <button type="button" aria-label="More players" disabled={playerTotal >= MAX_PLAYERS} onClick={() => setPlayerTotal(count => count + 1)}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
              </div>
            </div>
            {livePanels ? livePanels.members : <TripPlayerRoles key={simulator?.state.playerRoleViewer ?? simulator?.state.viewAs ?? "default"}
              players={joinedPlayers.map((player,index)=>({key:player.key,name:player.name,team:teamPicks[index]}))} total={playerTotal} persist={persist}
              organizerName={organizerName} viewerName={simulator?.state.viewAs && simulator.state.viewAs!==DEFAULT_DEV_ACCOUNT ? devAccount(simulator.state.viewAs).name : organizerName}
              viewer={process.env.NODE_ENV==="development"?simulator?.state.playerRoleViewer:undefined}
              teamNames={teamNames} teamCount={Math.max(2,teamCount)} onRemove={key=>setRemovedPlayers(previous=>new Set([...previous,key]))}/>}

        </section>
      </div>}

      {/* Organizer → Skins: the trip's skins game, then a round's players. */}
      {skinsOpen && <div className={styles.competition}>
        {skinsRound ? (() => {
            // Skins → a round: who's playing skins in it (locked once the round has started).
            const round = scheduleSlot(skinsRound.day, skinsRound.slot);
            return <section className={tripStyles.infoSection} aria-label={`Round ${round.number} skins players`}>
              <div className={styles.roundDayHeader}>
                <h2>{round.course}</h2>
                <time dateTime={golfIso(skinsRound.day)}>{golfDate(skinsRound.day)} · Round {round.number}</time>
              </div>
              <fieldset className={styles.compLock} disabled={playState(round.key, round.number).started}>
                {playerChecklist(`Round ${round.number} skins players`, roundSkinsPlayers(round.key), next => setSkinsPlayers(current => ({ ...current, [round.key]: next })))}
              </fieldset>
            </section>;
          })()
          : <div className={tripStyles.events}>
            {/* Skins: on or off for the trip, then every round; while on, the rounds light up, each with its own
                switch, and tapping a round that's on opens its players. */}
            <section className={tripStyles.infoSection} aria-label="Skins">
              <div className={styles.totalPlayers}>
                <span className={styles.typeHeading}>Skins</span>
                <button type="button" role="switch" aria-checked={skinsOn} aria-label="Skins" className={toggleStyles.toggle} onClick={() => setSkinsOn(!skinsOn)}>
                  <span className={toggleStyles.track} data-on={skinsOn}><span className={toggleStyles.thumb} /></span><span>{skinsOn ? "On" : "Off"}</span>
                </button>
              </div>
              <div className={styles.formatRounds}>
                {Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => {
                  const round = scheduleSlot(day, slot), on = roundSkinsOn(round.key);
                  return <div key={round.key} className={`${styles.compRoundRow} ${styles.scheduleRoundCard} ${styles.formatRoundCard}`} data-comp={on}>
                    <button type="button" className={styles.roundCardButton} disabled={!on} aria-label={`Round ${round.number}: ${round.course}. Skins players`} onClick={() => setSkinsRound({ day, slot })}>
                      <span className={tripStyles.eventInfo}>
                        <span className={styles.roundCardPlace}>{golfDate(day)}</span>
                        <span className={tripStyles.eventHost}>Round {round.number}</span>
                        <span className={tripStyles.eventTitle}>{round.course}</span>
                        {on && <span className={styles.roundCardPlace}>{roundSkinsPlayers(round.key).size} players</span>}
                      </span>
                    </button>
                    <button type="button" role="switch" aria-checked={on} aria-label={`Round ${round.number} skins`} disabled={!skinsOn || playState(round.key, round.number).started} className={styles.formatSwitch}
                      onClick={() => setSkinsRounds(current => ({ ...current, [round.key]: !on }))}>
                      <span className={styles.formatThumb} />
                    </button>
                  </div>;
                }))}
              </div>
            </section>
          </div>}
      </div>}
      {predictOpen && <div className={styles.competition}><GolfTripPredictSettings teamEvent={Boolean(competitionType.team)} /></div>}
      {historyOpen && <div className={styles.competition}><GolfTripHistory trips={pastTrips} onChange={setPastTrips} tripPlayers={joinedPlayers.map(player => player.name)} linking={livePanels ? undefined : historyLinking} /></div>}

      {placeholder && <section className={styles.card}><button type="button" onClick={() => setPlaceholder(null)}>Back to settings</button><h2>Place holder {placeholder <= 6 ? placeholder : placeholder - 6}</h2></section>}
      {scorecardViewOpen && <div className={styles.competition}>
        <div className={styles.typeGroup} role="radiogroup" aria-label="Scorecard view">
          <h4 className={styles.typeHeading}>How scoring opens on your phone</h4>
          <div className={styles.typeChoices}>
            {SCORING_VIEWS.map(option => <button key={option.value} type="button" role="radio" aria-checked={scoringView === option.value} aria-pressed={scoringView === option.value}
              className={styles.typeChoice} onClick={() => setScoringView(option.value)}>{option.label}</button>)}
          </div>
          <p className={styles.scorecardViewNote}>{scoringView === "slide" ? "Pull the Scoring bar up from the bottom of the trip page." : scoringView === "hold" ? "Press and hold anywhere on the trip page for 2 seconds to open scoring full screen." : "Tap the Scoring button above the bottom menu to open scoring full screen."}</p>
        </div>
        {/* My stats: required by the organizer (locked on), or my own choice when they're optional. */}
        <div className={notificationStyles.row}>
          <span className={notificationStyles.label}>My stats</span>
          <button type="button" role="switch" aria-checked={playerStats || myStats} aria-label="Record my stats" className={toggleStyles.toggle} disabled={playerStats} onClick={() => setMyStatsOptIn(!myStats)}>
            <span className={toggleStyles.track} data-on={playerStats || myStats}><span className={toggleStyles.thumb} /></span><span>{playerStats || myStats ? "On" : "Off"}</span>
          </button>
        </div>
        <p className={styles.scorecardViewNote}>{playerStats ? "Your organizer requires stats: putts, fairways and greens on every hole." : myStats ? "You'll record putts, fairways and greens on your scorecard." : "Off: you only enter your score. Turn on to record putts, fairways and greens."}</p>
      </div>}

      {playerScoringOpen && <div className={styles.competition}>
        <section className={notificationStyles.category} aria-label="What players enter">
          <h2 className={notificationStyles.categoryTitle}>What players enter</h2>
          {PLAYER_SCORING_FIELDS.map(field => {
            const on = !scoringFieldsOff.has(field);
            // Putts, Fairway and Greens are stats: only asked for while Player Stats is on.
            const stat = field !== "Opponent's score";
            return <Fragment key={field}>
              {field === "Putts" && <div className={notificationStyles.row}>
                <span className={notificationStyles.label}>Player Stats</span>
                <button type="button" role="switch" aria-checked={playerStats} aria-label="Player Stats required" className={toggleStyles.toggle} onClick={() => setPlayerStats(!playerStats)}>
                  <span>{playerStats ? "On" : "Off"}</span><span className={toggleStyles.track} data-on={playerStats}><span className={toggleStyles.thumb} /></span>
                </button>
              </div>}
              <div className={`${notificationStyles.row} ${stat ? styles.statRow : ""}`} data-off={stat && !playerStats}>
                <span className={notificationStyles.label}>{field === "Opponent's score" ? "Attesting" : field}</span>
                <button type="button" role="switch" aria-checked={on} aria-label={field === "Opponent's score" ? "Attesting" : field} className={toggleStyles.toggle} disabled={stat && !playerStats}
                  onClick={() => setScoringFieldsOff(current => { const next = new Set(current); if (on) next.add(field); else next.delete(field); return next; })}>
                  <span>{on ? "On" : "Off"}</span><span className={toggleStyles.track} data-on={on}><span className={toggleStyles.thumb} /></span>
                </button>
              </div>
            </Fragment>;
          })}
        </section>
        {livePanels ? livePanels.scoring : <OrganizerScores tripId={scoringTripId} roundNumbers={rounds.map(round => round.number)} organizerId={simulator?.state.viewAs ?? DEFAULT_DEV_ACCOUNT}
          scheduledToday={simulator?.state.roundStatus === "live" || simulator?.state.roundStatus === "roundEnd"} />}
      </div>}

      {!placeholder && !competitionOpen && !gamesOpen && !roundsOpen && !playersOpen && !playerScoringOpen && !scorecardViewOpen && !historyOpen && !predictOpen && !skinsOpen && !matchesOpen && !scorecardOpen && <div className={styles.settingsSections}>
        {/* Scorecards: every round from Golf Schedule, by day (same Day N + date header and cream round box). Tap a round
            to open its players page. */}
        {section === "Scorecards" ? livePanels?.scorecards ?? <div className={`${tripStyles.events} ${styles.scorecardDays}`}>
          {Array.from({ length: golfDayCount }, (_, day) => {
            const date = golfIso(day);
            return <section key={day} className={tripStyles.infoSection} aria-label={`Day ${day + 1}`}>
              <div className={styles.roundDayHeader}>
                <h2>Day {day + 1}</h2>
                <time dateTime={date}>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</time>
              </div>
              {Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => {
                const round = scheduleSlot(day, slot);
                return <div key={slot} className={`${styles.compRoundRow} ${styles.scheduleRoundCard}`}>
                    <button type="button" className={styles.roundCardButton} aria-label={`Round ${round.number}: ${round.course}. Players`} onClick={() => setScorecardRound({ day, slot })}>
                      <span className={tripStyles.eventInfo}>
                        <span className={tripStyles.eventHost}>Round {round.number}</span>
                        <span className={tripStyles.eventTitle}>{round.course}</span>
                        {round.place && <span className={styles.roundCardPlace}>{round.place}</span>}
                      </span>
                      <span className={styles.roundCardState}>{roundStatus(round.key, round.number)}</span>
                    </button>
                  </div>;
              })}
            </section>;
          })}
        </div> : cardSections.map(group => <section key={group.title ?? "General"} aria-label={group.title ?? "General settings"}>
          {group.title && <h2 className={styles.settingsSectionHeading}>{group.title}</h2>}
          <div className={styles.grid}>
        {section === "General" && livePanels && livePanels.members}
        {group.cards.map((title, index) => {
          if (title === "Delete Trip") return <Link key={index} href={livePanels?.deleteHref ?? "/dev/tournament/delete-trip"} className={`${styles.card} ${styles.cardButton}`}><h2>Delete Trip</h2></Link>;
          if (title === "Individual Competition" || title === "Team Competition") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`}
            onClick={() => { setOverviewType(title === "Team Competition" ? "team" : "individual"); setCompetitionSection("Overview"); setCompetitionOpen(true); }}>
            <h2>{title.replace("Competition", "Comp")}</h2>
          </button>;
          if (title === "Players") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setPlayersOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Match Selection") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => { setMatchesOpen(true); setMatchRound(null); }}>
            <h2>{title}</h2>
          </button>;
          if (title === "Golf Schedule") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setRoundsOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Scorecard View") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setScorecardViewOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Player Scoring") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setPlayerScoringOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Skins") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setSkinsOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Predict") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setPredictOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "History") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setHistoryOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Games") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => { setGamesOpen(true); setSelectedGameId(null); }}>
            <h2>{title}</h2>
          </button>;
          return <button type="button" onClick={() => setPlaceholder(section === "General" ? index + 1 : index + 3)} key={index} className={`${styles.card} ${styles.cardButton}`} aria-label={title}>
            <h2>{title}</h2>
          </button>;
        })}
          </div>
        </section>)}
      </div>}
    </div>
  </main>;
}

/** "08:30" → "8:30 AM" (a tee time from the course pop-up). */
/** Names longer than 17 characters (spaces count) show their first 17 and a small "…" so each row stays one line. */
function ShortName({ name }: { name: string }) {
  return <span className={`${leaderboardStyles.golferName} ${styles.typePlayerName}`} title={name} aria-label={name}>
    {name.length > 17 ? <>{name.slice(0, 17)}<small className={styles.typePlayerMore}>…</small></> : name}
  </span>;
}

/** Settings as text, to tell whether anything changed: Sets as sorted lists, object keys in order (so the order things
 *  were set in doesn't count as a change). */
function settingsKey(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item instanceof Set ? [...item].sort()
    : item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

function teeTimeLabel(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}
