"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeftRight, Check, ChevronLeft, GripVertical, Minus, Plus, Trash2, X } from "lucide-react";
import { GolfGameScoringSettings } from "./GolfGameScoringSettings";
import { SIDE_GAME_REGISTRY } from "@/lib/platform/golfTripGames";
import type { CompetitionRound } from "@/lib/platform/golfTripCompetitionPreview";
import styles from "./GolfTripSettingsPreview.module.css";
import tripStyles from "./GolfTripHome.module.css";
import leaderboardStyles from "./GolfTripMatch.module.css";
import { GolfTripCompetition } from "./GolfTripCompetition";
import { GolfTripDatePicker } from "./GolfTripDatePicker";
import { TripScheduleCoursePicker, type PickedCourse } from "./TripScheduleCoursePicker";
import { TeeTimePicker } from "./TeeTimePicker";
import { RoundCompetitionSettings } from "./RoundCompetitionSettings";
import { defaultRoundComp, matchesPerTeeTime, playersPerSide, roundMatches, teeTimesNeeded, type RoundCompSettings } from "@/lib/platform/roundCompetition";
import { GolfTripHistory, type HistoryLinking } from "./GolfTripHistory";
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEFAULT_DEV_ACCOUNT, DEV_ACCOUNTS, devAccount } from "@/lib/dev/devAccounts";
import { OrganizerScores } from "./OrganizerScores";
import { historyLinkInput, linkStatus } from "@/lib/platform/historyLinks";
import gamesStyles from "./GolfTripGames.module.css";
import { samplePastTrips, type PastTrip } from "@/lib/platform/golfTripHistory";
import toggleStyles from "./GolfTripCompetition.module.css";
import notificationStyles from "./GolfTripNotifications.module.css";
import { SCORING_VIEWS, setScoringView, useScoringView } from "@/lib/platform/scoringViewPreference";
import { useGolfTripCompetitionPreview } from "./GolfTripCompetitionPreviewProvider";

import { useSimulator, useSimulatorNavigationReporter } from "@/components/dev/SimulatorBridge";
import { usePersistedState } from "@/lib/dev/justCreatedStore";
import { setPlayerStats, usePlayerStats } from "@/lib/platform/playerStatsSetting";
import { useRoundRsvps } from "@/lib/platform/roundRsvp";

const GENERAL_CARDS = ["Scorecard View", ...Array.from({ length: 5 }, () => "Place holder")];
const ORGANIZER_CARDS = ["Players", "Golf Schedule", "Competition", "Games", "Allowed", "Player Scoring", "History"];
const GAME_GROUPS = {
  Individual: [{ id: "skins", name: "Skins", description: "Play for the lowest net score on the hole or the round.", players: "1-4 players" }],
  Matches: SIDE_GAME_REGISTRY.filter(game => game.id !== "skins").map(game => ({ id: game.id, name: game.name, description: game.description, players: `${game.supportedGroupSizes.join(" / ")} players` })),
} as const;
const COMPETITION_TYPES = [
  { key: "individual", title: "Individual", options: ["Stroke Play", "Points Based"] },
  { key: "team", title: "Team", options: ["2 Teams", "Pairs", "3-Ball", "4-Ball"] },
] as const;
const MAX_DAYS = 14;
const MAX_PLAYERS = 100;
// Allowed: the trip's house rules, grouped like the Competition Rounds tab. Preview only; resets on reload.
export type AllowedRule = { id: string; section: string; name: string; detail: string };
const ALLOWED_SECTIONS = ["On the course", "Scoring", "Equipment"];
export const ALLOWED_PRESET: AllowedRule[] = [
  { id: "mulligans", section: "On the course", name: "Mulligans", detail: "1 per nine · Not on the 18th" },
  { id: "gimmes", section: "On the course", name: "Gimmes", detail: "Inside the leather" },
  { id: "breakfast-ball", section: "On the course", name: "Breakfast ball", detail: "First tee only" },
  { id: "max-score", section: "Scoring", name: "Max score", detail: "Pick up at double par" },
  { id: "winter-rules", section: "Scoring", name: "Winter rules", detail: "Lift, clean & place in the fairway" },
  { id: "hazard-drop", section: "Scoring", name: "Hazard drop", detail: "One-stroke penalty" },
  { id: "rangefinders", section: "Equipment", name: "Rangefinders", detail: "Slope off" },
  { id: "golf-carts", section: "Equipment", name: "Golf carts", detail: "Cart path only when posted" },
  { id: "music", section: "Equipment", name: "Music", detail: "Low volume · Off on the greens" },
];
// Player Scoring: what players fill in on the Scoring sheet for each hole. Preview only; resets on reload.
const PLAYER_SCORING_FIELDS = ["Opponent's score", "Putts", "Fairway", "Greens in regulation"];
const GAME_LOOKUP = [...GAME_GROUPS.Individual, ...GAME_GROUPS.Matches];

/** Reference layout with local game scoring settings in the site's maroon palette. */
export function GolfTripSettingsPreview({ tripName, backHref = "/dev/tournament", playerCount = 0, players = [], tripRounds, pastTrips: tripHistory, houseRules, dataKey = "default", competitionSetup }: {
  tripName: string; backHref?: string; playerCount?: number; players?: string[];
  /** The chosen trip's past trips and house rules; without them, the samples. */
  pastTrips?: PastTrip[]; houseRules?: AllowedRule[];
  /** Which trip data this is (dev): the Individual / Team picks are kept per trip, shared with its Golf tab. */
  dataKey?: string;
  /** The trip's competition as it already stands (the real tournament: its Individual / Team types and its two teams by
   *  roster position, submitted). Picks made in Settings take over from it. */
  competitionSetup?: { types: { individual: string | null; team: string | null }; teamNames: string[]; teams: number[][] };
  /** The trip's own rounds (from the chosen data: mock, busy, empty or the real tournament). Without it, the shared sample rounds. */
  tripRounds?: CompetitionRound[];
}) {
  // Dev "Just created" trip: everything set up here is saved as you go (lib/dev/justCreatedStore) until Reset.
  const persist = dataKey === "empty";
  const [section, setSection] = useState("General");
  const [competitionOpen, setCompetitionOpen] = useState(false);
  const [competitionSection, setCompetitionSection] = useState("Overview");
  const [gamesOpen, setGamesOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [allowedOpen, setAllowedOpen] = useState(false);
  const [playerScoringOpen, setPlayerScoringOpen] = useState(false);
  const [scorecardViewOpen, setScorecardViewOpen] = useState(false);
  // History: past trips the organizer entered. Preview only; one sample trip, resets on reload.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pastTrips, setPastTrips] = usePersistedState<PastTrip[]>(persist, "pastTrips", () => tripHistory ?? samplePastTrips(players));
  // History → Link to account (dev): requests go to the shared player-rounds store; the player answers on /dev/profile.
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
  // Players' Play / Sit out for each round (they choose on their Itinerary).
  const roundRsvps = useRoundRsvps(dataKey);
  const [scoringFieldsOff, setScoringFieldsOff] = usePersistedState<Set<string>>(persist, "scoringFieldsOff", new Set());
  const [allowedRules, setAllowedRules] = usePersistedState(persist, "allowedRules", houseRules ?? ALLOWED_PRESET);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<string | null>(null);
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
  const [unevenSizes, setUnevenSizes] = usePersistedState<[number, number]>(persist, "unevenSizes", [2, 2]);
  const uneven = unevenTeams && !groupSize;
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
  // Competition → Format: which Golf Schedule round slots count toward the competition (on unless switched off).
  const [compRounds, setCompRounds] = usePersistedState<Record<string, boolean>>(persist, "compRounds", {});
  // Competition → Format → tap a comp round: that round's competition settings (players, format, match type, points, Nassau, handicap), kept per round slot.
  const [compRoundSlot, setCompRoundSlot] = useState<{ day: number; slot: number } | null>(null);
  const [compFormats, setCompFormats] = usePersistedState<Record<string, RoundCompSettings>>(persist, "compFormats", {});
  // Turning a round's Comp switch off waits for this confirm (it removes the round's format).
  const [confirmCompOff, setConfirmCompOff] = useState<string | null>(null);
  const [coursePicker, setCoursePicker] = useState<{ key: string; label: string } | null>(null);
  // Golf Schedule: tap a round's tee time → the tee time sheet. Each group's time ("HH:MM") is kept per day/round slot.
  const [teeTimes, setTeeTimes] = usePersistedState<Record<string, string[]>>(persist, "teeTimes", {});
  const [teeTimePicker, setTeeTimePicker] = useState<{ key: string; course: string; date: string; round: number; fixedGroups?: number; startGroup?: number } | null>(null);
  // Golf Schedule → tap a round's box → that round's settings page (course, tee times).
  const [scheduleRound, setScheduleRound] = useState<{ day: number; slot: number } | null>(null);
  // Round settings → Players: up to 4 roster slots per tee time group, kept per round slot. A player can be in one group per round.
  const [teePlayers, setTeePlayers] = usePersistedState<Record<string, Record<number, number[]>>>(persist, "teePlayers", {});
  const [teePlayersGroup, setTeePlayersGroup] = useState<number | null>(null);
  // 2 Teams + a comp match-play round: the matchups, per round slot, by match number — each side's players (roster slots,
  // null = still open). The slot being filled (which match, which side, which spot) while its player list is open.
  const [teeMatches, setTeeMatches] = usePersistedState<Record<string, Record<number, { a: (number | null)[]; b: (number | null)[] }>>>(persist, "teeMatches", {});
  const [matchSlot, setMatchSlot] = useState<{ match: number; side: "a" | "b"; spot: number } | null>(null);
  // Course names carried by rounds that were dragged (they no longer line up with the sample schedule).
  const [slotCourseNames, setSlotCourseNames] = usePersistedState<Record<string, string>>(persist, "slotCourseNames", {});
  // Dragging a round by its grip: where it started, how far it moved, and where it would land.
  const [roundDrag, setRoundDrag] = useState<{ day: number; slot: number; startY: number; dy: number } | null>(null);
  const [roundDrop, setRoundDrop] = useState<{ day: number; index: number } | null>(null);
  // A drop onto another day waits for this confirm (it resets the round's settings).
  const [pendingMove, setPendingMove] = useState<{ from: { day: number; slot: number }; to: { day: number; index: number } } | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const baseDate = days[0] ?? today;
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
  // The trip dates popup sets both ends at once; the Day rows follow (1 to MAX_DAYS days).
  const setTripDates = (arrival: string, departure: string) => {
    setArrivalShift(daysBetween(baseDate, arrival));
    setDayCount(daysBetween(arrival, departure) + 1);
    setDatePickerOpen(false);
  };
  // Day N's date follows on from Arrival; "Date" until the trip has one.
  // Trip day N as "April 22, 2027" (Arrival / Departure pills, round labels).
  const dayDate = (index: number) => {
    if (!days[0]) return "Date";
    const date = new Date(`${days[0]}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + arrivalShift + index);
    return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  };
  const flagSummary = (field: "handicap" | "nassau") => {
    if (!rounds.length) return "Not configured";
    const enabled = rounds.filter(round => round[field]).length;
    return enabled === rounds.length ? "On · All rounds" : enabled === 0 ? "Off · All rounds" : `Mixed · On for ${enabled} of ${rounds.length} rounds`;
  };
  const overview: [string, ReactNode][] = [
    ["Points available", "Not configured"],
    ["Handicap", flagSummary("handicap")],
    ["Tiebreaker", "Not configured"],
    ["Status", `${rounds.filter(round => round.status === "started").length} started · ${rounds.filter(round => round.status === "scheduled").length} scheduled`],
  ];
  // Summary: a read-only recap of every competition choice, one row each.
  const chosenTypes = [competitionType.individual, competitionType.team].filter(Boolean).join(" · ");
  const summary: [string, ReactNode][] = [
    ["Type", chosenTypes || "Not chosen"],
    ["Rounds", rounds.length ? `${rounds.length} rounds · ${days.length} days` : "Not configured"],
    ...rounds.map((round): [string, ReactNode] => [`R${round.number}`, `${round.course} · ${round.format}`]),
    ...overview,
  ];
  // One Golf Schedule round slot: its key, number, course and every group's tee time.
  const scheduleSlot = (day: number, slot: number) => {
    const key = `${day}-${slot}`, picked = pickedCourses[key];
    const number = Array.from({ length: day }, (_, before) => roundsPerDay[before] ?? 1).reduce<number>((sum, count) => sum + count, 0) + slot + 1;
    const course = picked?.name ?? slotCourseNames[key] ?? rounds.filter(round => round.date === days[day])[slot]?.course ?? "Course TBD";
    const groupTimes = teeTimes[key] ?? (picked?.settings?.teeTime ? [picked.settings.teeTime] : []);
    // City, ST of a picked course (sample-schedule courses have none).
    const place = picked?.place ?? "";
    return { key, number, course, place, groupTimes, label: `Round ${number} · ${golfDate(day)}` };
  };
  // The open Format round: its slot, number and settings (defaults until changed: every trip player, Singles match play, 1 point, gross).
  const compRound = compRoundSlot ? (() => {
    const slot = scheduleSlot(compRoundSlot.day, compRoundSlot.slot);
    const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${golfIso(compRoundSlot.day)}T12:00:00Z`));
    return { id: slot.key, number: slot.number, course: slot.course, date, settings: compFormats[slot.key] ?? defaultRoundComp(playerTotal) };
  })() : undefined;
  // Moves a round to another place (max 2 a day). Same day: it keeps its settings. Another day: course, tee times, players and Comp go back to default.
  const moveRound = (from: { day: number; slot: number }, to: { day: number; index: number }) => {
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
  useEffect(() => {
    const request = simulator?.navigation;
    if (!request?.settingsView || request.command === appliedCommand.current) return;
    appliedCommand.current = request.command;
    const view = request.settingsView;
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
    setAllowedOpen(view === "allowed");
    setPlayerScoringOpen(view === "player-scoring");
    setScorecardViewOpen(view === "scorecard-view");
    setHistoryOpen(view === "history");
  }, [simulator?.navigation]);
  useEffect(() => {
    if (!reportNavigation) return;
    const settingsView = historyOpen ? "history" : scorecardViewOpen ? "scorecard-view" : playerScoringOpen ? "player-scoring" : allowedOpen ? "allowed" : playersOpen ? "players" : roundsOpen ? "schedule" : competitionOpen ? selectedRoundId ? `round-${selectedRoundId}` : competitionSection === "Format" ? "competition-rounds" : "competition" : gamesOpen ? expandedGameId ? `game-${expandedGameId}` : "games" : placeholder ? `placeholder-${placeholder}` : section === "General" ? "player" : "organizer";
    reportNavigation({ tab: "Home", settingsView }, rounds.map(({ id, number }) => ({ id, number })));
  }, [reportNavigation, historyOpen, scorecardViewOpen, playerScoringOpen, allowedOpen, playersOpen, roundsOpen, competitionOpen, competitionSection, gamesOpen, expandedGameId, placeholder, section, selectedRoundId, rounds]);
  const cards = section === "Organizer" ? ORGANIZER_CARDS : GENERAL_CARDS;
  // Back arrow and SAVE both step back one level; preview changes are already kept as you make them.
  const goBack = () => {
    if (selectedRound) setSelectedRoundId(null);
    else if (compRound) setCompRoundSlot(null);
    else if (selectedGame) setSelectedGameId(null);
    else if (scheduleRound) { setScheduleRound(null); setTeePlayersGroup(null); setMatchSlot(null); }
    else if (competitionOpen) setCompetitionOpen(false);
    else if (roundsOpen) setRoundsOpen(false);
    else if (playersOpen) setPlayersOpen(false);
    else if (allowedOpen) setAllowedOpen(false);
    else if (playerScoringOpen) setPlayerScoringOpen(false);
    else if (scorecardViewOpen) setScorecardViewOpen(false);
    else if (historyOpen) setHistoryOpen(false);
    else setGamesOpen(false);
  };

  return <main className={`${styles.page} ${competitionOpen || gamesOpen || roundsOpen || playersOpen || allowedOpen || playerScoringOpen || scorecardViewOpen || historyOpen ? styles.competitionPage : ""}`}>
    <div className={styles.content}>
      {(competitionOpen || gamesOpen || roundsOpen || playersOpen || allowedOpen || playerScoringOpen || scorecardViewOpen || historyOpen) ? <header className={styles.competitionHeader}>
        <button type="button" className={styles.close} aria-label={selectedRound || compRound ? "Back to competition rounds" : selectedGame ? "Back to games" : "Back to organizer settings"} onClick={goBack}><ChevronLeft size={28} aria-hidden /></button>
        <h1>{selectedRound ? "Round " + selectedRound.number + " Settings" : compRound ? `Round ${compRound.number} Competition` : selectedGame ? selectedGame.name : gamesOpen ? "Games" : roundsOpen ? scheduleRound ? `Round ${scheduleSlot(scheduleRound.day, scheduleRound.slot).number}` : "Golf Schedule" : playersOpen ? "Players" : allowedOpen ? "Allowed" : playerScoringOpen ? "Player Scoring" : scorecardViewOpen ? "Scorecard View" : historyOpen ? "History" : "Competition"}</h1>
        <motion.button type="button" className={styles.save} onClick={goBack} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>SAVE</motion.button>
      </header> : <header className={styles.header}>
      <Link href={backHref} className={styles.close} aria-label="Back to trip"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></Link>
      <div className={styles.heading}>
        <h1>{tripName}</h1>
        <p>Trip Settings</p>
      </div>
      </header>}

      {!competitionOpen && !gamesOpen && !roundsOpen && !playersOpen && !allowedOpen && !playerScoringOpen && !scorecardViewOpen && !historyOpen && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Settings sections preview">
        {["General", "Organizer"].map((name) => <button key={name} type="button" aria-pressed={section === name}
          className={`${tripStyles.tab} ${section === name ? tripStyles.tabActive : ""} ${styles.tab}`}
          onClick={() => { setSection(name); setPlaceholder(null); setCompetitionOpen(false); setGamesOpen(false); setRoundsOpen(false); setPlayersOpen(false); }}>{name}</button>)}
      </div>}

      {competitionOpen && competition ? <div className={styles.competition}>
        {!selectedRound && !compRound && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Competition sections">
          {["Overview", "Format", "Summary"].map(name => <button key={name} type="button" aria-pressed={competitionSection === name}
            className={`${tripStyles.tab} ${competitionSection === name ? tripStyles.tabActive : ""} ${styles.tab}`}
            onClick={() => setCompetitionSection(name)}>{name}</button>)}
        </div>}
        {selectedRound ? <GolfTripCompetition rounds={[selectedRound]} onChange={change => competition.change(change, selectedRound.id)} showBulk={false} />
          : compRound ? <RoundCompetitionSettings key={compRound.id} course={compRound.course} date={compRound.date} round={compRound.number} settings={compRound.settings} maxPlayers={playerTotal}
            onSubmit={next => { setCompFormats(current => ({ ...current, [compRound.id]: next })); setCompRoundSlot(null); }} />
          : <div className={tripStyles.events}>
            {competitionSection === "Overview" && <section className={tripStyles.infoSection} aria-label="Overview">
              {/* Individual / Team pill slider (the Gross / Net style); each shows only its own type page. */}
              <div className={`${leaderboardStyles.scoring} ${styles.overviewSwitch}`} role="group" aria-label="Competition type page">
                {(["individual", "team"] as const).map(key => <button key={key} type="button" aria-pressed={overviewType === key} className={overviewType === key ? leaderboardStyles.scoringActive : ""} onClick={() => setOverviewType(key)}>{key === "individual" ? "INDIVIDUAL" : "TEAM"}</button>)}
              </div>
              <div className={styles.typePicker}>
                {COMPETITION_TYPES.filter(group => group.key === overviewType).map(group => <div key={group.key} className={styles.typeGroup} role="group" aria-label={group.title}>
                  <h4 className={styles.typeHeading}>{group.title}</h4>
                  <fieldset className={styles.compLock} disabled={lockedComp[group.key]}>
                  <div className={`${styles.typeChoices} ${styles.typeChoicesRow}`}>
                    {[...group.options, null].map(option => <button key={option ?? "none"} type="button" className={styles.typeChoice} aria-pressed={competitionType[group.key] === option}
                      onClick={() => {
                        // A different team type has different team sizes, so it starts from empty teams.
                        if (group.key === "team" && competitionType.team !== option) { setTeamPicks({}); setSubmittedTeams(null); setTeamTotalChoice(null); }
                        setCompetitionType(current => ({ ...current, [group.key]: option }));
                      }}>{option ?? "None"}</button>)}
                  </div>
                  {/* The trip's players under each type as checkboxes in two columns, filled down the left first (left gets the extra); Select all heads the list. */}
                  {group.key === "team" ? competitionType.team && <div className={styles.typePlayers}>
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
                    <div className={styles.teamColumns}>
                      {(submittedTeams ?? teamSplit).map((team, column) => <div key={column}>
                        {submittedTeams ? <div className={styles.typePlayersHeader}>{teamLabels[column]}</div>
                          : <input type="text" className={styles.teamNameInput} aria-label={`Team ${teamLetter(column)} name`} placeholder={`Team ${teamLetter(column)}`} value={teamNames[column] ?? ""}
                            onChange={event => setTeamNames(current => { const next = [...current]; next[column] = event.target.value; return next; })} />}
                        <ul className={styles.teamColumnList} aria-label={`${teamLabels[column]} players`}>
                          {team.map(index => <li key={index} className={styles.teamPlayerRow}>
                            <ShortName name={playerName(index)} />
                            {!submittedTeams && <button type="button" className={styles.swapButton} aria-haspopup="dialog" aria-label={`Move or swap ${playerName(index)}`} onClick={() => { setSwapTarget(null); setSwapFrom(index); }}><ArrowLeftRight size={14} strokeWidth={2.25} aria-hidden /></button>}
                          </li>)}
                          {/* One + Add Player row per open spot on this team. */}
                          {!submittedTeams && Array.from({ length: Math.max(0, teamSizes[column] - team.length) }, (_, open) => <li key={`open-${open}`}>
                            <button type="button" className={styles.addTeamPlayer} aria-haspopup="dialog" onClick={() => openAddPlayer(column)}><Plus size={14} strokeWidth={2.5} aria-hidden /> Add Player</button>
                          </li>)}
                        </ul>
                      </div>)}
                    </div>
                    {/* Submit teams lights up once every player is on a team; after submitting it becomes Undo & Change. */}
                    {submittedTeams ? <button type="button" className={`${styles.typeChoice} ${styles.selectTeams}`} onClick={() => setSubmittedTeams(null)}>Undo &amp; Change</button>
                      : <button type="button" className={`${styles.typeChoice} ${styles.selectTeams}`} disabled={!allPicked} onClick={() => setSubmittedTeams(teamSplit)}>Submit teams</button>}
                  </div> : competitionType.individual && (() => {
                    const checked = typePlayers[group.key];
                    const allChecked = playerTotal > 0 && Array.from({ length: playerTotal }, (_, index) => index).every(index => checked.has(index));
                    return <div className={styles.typePlayers}>
                      <div className={styles.typePlayersHeader}>
                        <label className={styles.typePlayer}>
                          <input type="checkbox" checked={allChecked} onChange={() => setTypePlayers(current => ({ ...current, [group.key]: new Set(allChecked ? [] : Array.from({ length: playerTotal }, (_, index) => index)) }))} />
                          <span>Select all</span>
                        </label>
                      </div>
                      <ul className={styles.typePlayerGrid} style={{ gridTemplateRows: `repeat(${Math.ceil(playerTotal / 2)}, auto)` }} aria-label={`${group.title} players`}>
                        {Array.from({ length: playerTotal }, (_, index) => <li key={index}>
                          <label className={styles.typePlayer}>
                            <input type="checkbox" checked={checked.has(index)} onChange={() => setTypePlayers(current => {
                              const next = new Set(current[group.key]);
                              if (!next.delete(index)) next.add(index);
                              return { ...current, [group.key]: next };
                            })} />
                            <ShortName name={playerName(index)} />
                          </label>
                        </li>)}
                      </ul>
                    </div>;
                  })()}
                  </fieldset>
                  {/* Team: needs submitted teams first (or None). Individual: any time. */}
                  <button type="button" className={`${styles.typeChoice} ${styles.selectTeams} ${styles.compLockButton}`}
                    disabled={!lockedComp[group.key] && group.key === "team" && !!competitionType.team && !submittedTeams}
                    onClick={() => setLockedComp(current => ({ ...current, [group.key]: !current[group.key] }))}>
                    {lockedComp[group.key] ? "Undo and Change" : `Submit & Save ${group.title} Competition`}
                  </button>
                </div>)}
              </div>
            </section>}
            {competitionSection === "Summary" && <section className={tripStyles.infoSection} aria-label="Summary">
              <dl className={styles.overview}>
                {summary.map(([label, value]) => <div key={label} className={styles.overviewRow}>
                  <dt>{label}</dt><dd>{value}</dd>
                </div>)}
              </dl>
            </section>}
            {/* One section per trip day (Arrival to Departure): centered Day N, its date small underneath, then a line and that day's rounds. */}
            {/* Format: just the round boxes (no day headers). Each box: Date / Round # / course (+ format when on), with a Comp switch top right; tap a comp round for its competition settings. On = a competition round (box lit); off = not (box greyed). */}
            {competitionSection === "Format" && <div className={styles.formatRounds}>
              {Array.from({ length: golfDayCount }, (_, day) => Array.from({ length: roundsPerDay[day] ?? 1 }, (_, slot) => {
                const round = scheduleSlot(day, slot), inComp = compRounds[round.key] ?? true;
                return <div key={round.key} className={`${styles.compRoundRow} ${styles.scheduleRoundCard} ${styles.formatRoundCard}`} data-comp={inComp}>
                  {/* A comp round opens its competition settings; a non-comp round can't be opened. */}
                  <button type="button" className={styles.roundCardButton} disabled={!inComp} aria-label={`Round ${round.number}: ${round.course}. Competition settings`} onClick={() => setCompRoundSlot({ day, slot })}>
                    <span className={tripStyles.eventInfo}>
                      <span className={styles.roundCardPlace}>{golfDate(day)}</span>
                      <span className={tripStyles.eventHost}>Round {round.number}</span>
                      <span className={tripStyles.eventTitle}>{round.course}</span>
                      {inComp && <span className={styles.roundCardPlace}>{(compFormats[round.key] ?? defaultRoundComp(playerTotal)).format} · {(compFormats[round.key] ?? defaultRoundComp(playerTotal)).matchType}</span>}
                    </span>
                  </button>
                  <button type="button" role="switch" aria-checked={inComp} aria-label={`Round ${round.number} is a competition round`} className={styles.formatSwitch} onClick={() => inComp ? setConfirmCompOff(round.key) : setCompRounds(current => ({ ...current, [round.key]: true }))}>
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
          {Object.entries(GAME_GROUPS).map(([label, games]) => <section key={label} className={styles.gameGroup}>
            <h2 className={styles.gameHeading}>{label}</h2>
            {games.map(game => {
              const isExpanded = expandedGameId === game.id;
              return <div key={game.id} className={styles.gameRowWrapper}>
                <button type="button" className={styles.gameRow} aria-expanded={isExpanded} onClick={() => setExpandedGameId(isExpanded ? null : game.id)}>
                  <span className={styles.gameInfo}>
                    <span className={styles.gameLabel}>{game.name}</span>
                    <span className={styles.gameMeta}>{game.players}</span>
                  </span>
                  <span className={`${styles.gameToggle} ${isExpanded ? styles.gameToggleOpen : ""}`} aria-hidden>▾</span>
                </button>
                <div hidden={!isExpanded} className={styles.gameDropdown}>
                  <GolfGameScoringSettings game={game.id} />
                </div>
              </div>;
            })}
          </section>)}
        </div>}
      </div>}

      {teeTimePicker && <TeeTimePicker key={`${teeTimePicker.key}-${teeTimePicker.startGroup ?? 0}`} fixedGroups={teeTimePicker.fixedGroups} startGroup={teeTimePicker.startGroup} course={teeTimePicker.course} date={teeTimePicker.date} round={teeTimePicker.round} value={teeTimes[teeTimePicker.key] ?? (pickedCourses[teeTimePicker.key]?.settings?.teeTime ? [pickedCourses[teeTimePicker.key]!.settings!.teeTime] : undefined)}
        onClose={() => setTeeTimePicker(null)} onSave={times => { setTeeTimes(current => ({ ...current, [teeTimePicker.key]: times })); setTeeTimePicker(null); }} />}
      {coursePicker && <TripScheduleCoursePicker roundLabel={coursePicker.label} current={pickedCourses[coursePicker.key]} onClose={() => setCoursePicker(null)}
        onPick={(course) => { setPickedCourses(current => ({ ...current, [coursePicker.key]: course })); setCoursePicker(null); }} />}
      {datePickerOpen && <GolfTripDatePicker arrival={arrivalIso} departure={departureIso} maxDays={MAX_DAYS}
        onSubmit={setTripDates} onClose={() => setDatePickerOpen(false)} />}

      {roundsOpen && scheduleRound && (() => {
        // Round settings page: course + date header, then Tee Times | Players (tap a group's players to assign up to 4). + Add Tee Time opens the tee time sheet.
        const round = scheduleSlot(scheduleRound.day, scheduleRound.slot);
        const date = golfIso(scheduleRound.day);
        const groups = teePlayers[round.key] ?? {};
        const groupOf = (player: number) => Object.entries(groups).find(([, list]) => list.includes(player))?.[0];
        const togglePlayer = (group: number, player: number) => setTeePlayers(current => {
          const list = current[round.key]?.[group] ?? [];
          const next = list.includes(player) ? list.filter(value => value !== player) : list.length < 4 ? [...list, player] : list;
          return { ...current, [round.key]: { ...current[round.key], [group]: next } };
        });
        // Matches: a 2 Teams competition on a comp match-play round. The round's format sets the matches (players ÷ both
        // sides) and how many fit a tee time (two 1 v 1 or one 2 v 2), so the tee times are worked out, not added.
        const comp = compRounds[round.key] !== false ? compFormats[round.key] ?? defaultRoundComp(playerTotal) : null;
        const matchesMode = competitionType.team === "2 Teams" && comp !== null && comp.matchType === "Match Play" && roundMatches(comp) > 0;
        const perSide = comp ? playersPerSide(comp.format) : 1;
        const perGroup = comp ? matchesPerTeeTime(comp.format) : 1;
        const matchCount = comp ? roundMatches(comp) : 0;
        const groupCount = comp ? teeTimesNeeded(comp) : 0;
        const roundMatchups = teeMatches[round.key] ?? {};
        const sideOf = (match: number, side: "a" | "b") => roundMatchups[match]?.[side] ?? Array<number | null>(perSide).fill(null);
        // Who's already in a match this round (and which), so nobody plays twice.
        const matchOf = (player: number) => Object.entries(roundMatchups).find(([, sides]) => sides.a.includes(player) || sides.b.includes(player))?.[0];
        const fillSlot = (match: number, side: "a" | "b", spot: number, player: number | null) => setTeeMatches(current => {
          const sides = current[round.key]?.[match] ?? { a: Array<number | null>(perSide).fill(null), b: Array<number | null>(perSide).fill(null) };
          const nextSide = [...sides[side]];
          nextSide[spot] = player;
          return { ...current, [round.key]: { ...current[round.key], [match]: { ...sides, [side]: nextSide } } };
        });
        return <div className={styles.competition}>
          <div className={styles.roundDayHeader}>
            <h2>{round.course}</h2>
            <time dateTime={date}>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))} · Round {round.number}</time>
          </div>
          {matchesMode ? <section className={styles.teeTable} aria-label="Tee times and matches">
            {/* Tee Times | Team A | Team B: one row per tee time with its match(es); tap a spot to put a player there. */}
            <div className={`${styles.teeTableHeader} ${styles.matchHeader}`} aria-hidden="true"><span>Tee Times</span><span>{teamLabels[0]}</span><span>{teamLabels[1]}</span></div>
            {Array.from({ length: groupCount }, (_, group) => {
              const time = round.groupTimes[group];
              const matches = Array.from({ length: perGroup }, (_, offset) => group * perGroup + offset).filter(match => match < matchCount);
              return <div key={group} className={`${styles.teeTableRow} ${styles.matchRow}`}>
                <button type="button" className={`${styles.teeTableTime} ${styles.matchTime}`} aria-haspopup="dialog" aria-label={`Group ${group + 1} tee time: ${time ? teeTimeLabel(time) : "not set"}`}
                  onClick={() => setTeeTimePicker({ key: round.key, course: round.course, date: golfDate(scheduleRound.day), round: round.number, fixedGroups: groupCount, startGroup: group })}>
                  <small>Group {group + 1}</small>{time ? teeTimeLabel(time) : <span className={styles.teeTableAdd}>Set time</span>}
                </button>
                {matches.map(match => <div key={match} className={styles.matchLine} aria-label={`Match ${match + 1}`}>
                  {(["a", "b"] as const).map(side => <div key={side} className={styles.matchSide}>
                    {sideOf(match, side).map((player, spot) => <button key={spot} type="button" className={styles.matchSpot} data-filled={player !== null} aria-haspopup="dialog"
                      aria-label={`Match ${match + 1}, ${teamLabels[side === "a" ? 0 : 1]}: ${player !== null ? playerName(player) : "add player"}`} onClick={() => setMatchSlot({ match, side, spot })}>
                      {player !== null ? <ShortName name={playerName(player)} /> : <span className={styles.teeTableAdd}><Plus size={13} strokeWidth={2.5} aria-hidden /> Add player</span>}
                    </button>)}
                  </div>)}
                </div>)}
              </div>;
            })}
            <p className={styles.roundSettingsEmpty}>{matchCount} {matchCount === 1 ? "match" : "matches"} ({perSide} v {perSide}) · {groupCount} tee {groupCount === 1 ? "time" : "times"}</p>
          </section> : <section className={styles.teeTable} aria-label="Tee times and players">
            <div className={styles.teeTableHeader} aria-hidden="true"><span>Tee Times</span><span>Players</span></div>
            {round.groupTimes.length ? round.groupTimes.map((time, group) => {
              const names = (groups[group] ?? []).filter(player => player < playerTotal);
              return <div key={group} className={styles.teeTableRow}>
                <span className={styles.teeTableTime}><small>Group {group + 1}</small>{teeTimeLabel(time)}</span>
                <button type="button" className={styles.teeTablePlayers} aria-haspopup="dialog" aria-label={`Group ${group + 1} players: ${names.length ? names.map(playerName).join(", ") : "none"}`} onClick={() => setTeePlayersGroup(group)}>
                  {names.length ? names.map(player => <ShortName key={player} name={playerName(player)} />) : <span className={styles.teeTableAdd}><Plus size={13} strokeWidth={2.5} aria-hidden /> Add Players</span>}
                </button>
              </div>;
            }) : <p className={styles.roundSettingsEmpty}>No tee times yet.</p>}
            <button type="button" className={styles.addRound} aria-haspopup="dialog" onClick={() => setTeeTimePicker({ key: round.key, course: round.course, date: golfDate(scheduleRound.day), round: round.number })}><Plus size={14} strokeWidth={2.5} aria-hidden /> Add Tee Time</button>
          </section>}
          {/* A match spot's player list: only that team's players; anyone sitting out, or already in another match this round, is greyed. */}
          {matchesMode && matchSlot && (() => {
            const team = matchSlot.side === "a" ? 0 : 1;
            const current = sideOf(matchSlot.match, matchSlot.side)[matchSlot.spot];
            return <div className={`${styles.teamsDropdown} ${styles.addPlayerDropdown}`} role="dialog" aria-modal="false" aria-label={`Match ${matchSlot.match + 1} ${teamLabels[team]} player`}>
              <button type="button" className={tripStyles.sheetClose} aria-label="Close players" onClick={() => setMatchSlot(null)}><X size={18} strokeWidth={2.25} aria-hidden /></button>
              <h3 className={gamesStyles.sheetTitle}>Match {matchSlot.match + 1} · {teamLabels[team]}</h3>
              <ul className={styles.addPlayerList}>
                {teamSplit[team].map(player => {
                  const rsvp = roundRsvps[round.number]?.[playerName(player)];
                  const other = matchOf(player);
                  const taken = other !== undefined && player !== current;
                  const out = rsvp === "out" && player !== current;
                  return <li key={player} className={styles.addPlayerRow} data-selected={player === current} data-out={out || taken}>
                    <button type="button" className={styles.addPlayerName} disabled={out || taken} onClick={() => { fillSlot(matchSlot.match, matchSlot.side, matchSlot.spot, player); setMatchSlot(null); }}>
                      <span className={styles.teePlayerName}>{playerName(player)}{rsvp && <em className={styles.rsvpNote} data-rsvp={rsvp}>{rsvp === "in" ? "I'm in!" : "I'm out"}</em>}</span>
                    </button>
                    {taken && <small className={styles.matchTaken}>Match {Number(other) + 1}</small>}
                  </li>;
                })}
              </ul>
              {!teamSplit[team].length && <p className={gamesStyles.sheetHint}>No players on {teamLabels[team]} yet — add them in Competition → Overview → Team.</p>}
              {current !== null && current !== undefined && <button type="button" className={styles.addRound} onClick={() => { fillSlot(matchSlot.match, matchSlot.side, matchSlot.spot, null); setMatchSlot(null); }}>Remove {playerName(current)}</button>}
            </div>;
          })()}
          {/* Players drop-down for one group: tick up to 4; anyone already in another group this round is shown with that group and can't be picked. */}
          {teePlayersGroup !== null && <div className={`${styles.teamsDropdown} ${styles.addPlayerDropdown}`} role="dialog" aria-modal="false" aria-label={`Group ${teePlayersGroup + 1} players`}>
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
                const rsvp = roundRsvps[round.number]?.[playerName(player)];
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
      {roundsOpen && !scheduleRound && <div className={styles.competition}>
        <section className={tripStyles.infoSection} aria-label="Golf Schedule">
          <div className={styles.scheduleColumn}>
            <div className={styles.arrivalDeparture}>
              <div className={styles.typeGroup} role="group" aria-label="Arrival">
                <h4 className={styles.typeHeading}>Arrival</h4>
                <button type="button" className={styles.typeChoice} aria-haspopup="dialog" onClick={() => setDatePickerOpen(true)}>{dayDate(0)}</button>
              </div>
              <div className={styles.typeGroup} role="group" aria-label="Departure">
                <h4 className={styles.typeHeading}>Departure</h4>
                <button type="button" className={styles.typeChoice} aria-haspopup="dialog" onClick={() => setDatePickerOpen(true)}>{dayDate(dayCount - 1)}</button>
              </div>
            </div>
            <div className={styles.golfDaySettings}>
            {([["Golf on Arrival Day", golfOnArrival, setGolfOnArrival], ["Golf on Departure Day", golfOnDeparture, setGolfOnDeparture]] as const).map(([label, on, set]) => <div key={label} className={`${styles.totalPlayers} ${styles.golfDaySetting}`}>
              <span className={styles.typeHeading}>{label}</span>
              <button type="button" role="switch" aria-checked={on} aria-label={label} className={toggleStyles.toggle} onClick={() => set(!on)}>
                <span className={toggleStyles.track} data-on={on}><span className={toggleStyles.thumb} /></span><span>{on ? "On" : "Off"}</span>
              </button>
            </div>)}
            </div>
          </div>
        </section>
        {/* Day sections use the Competition → Format look: centered Day N + date over a line, each round as a cream box (tap for its settings page), then + Add Round. */}
        <div className={tripStyles.events}>
          {Array.from({ length: golfDayCount }, (_, index) => {
            const perDay = roundsPerDay[index] ?? 1;
            const date = golfIso(index);
            const dropLine = (at: number) => roundDrop?.day === index && roundDrop.index === at && <div className={styles.roundDropLine} aria-hidden />;
            return <section key={index} className={tripStyles.infoSection} aria-label={`Day ${index + 1}`} data-drop-day={index}>
              <div className={styles.roundDayHeader}>
                <h2>Day {index + 1}</h2>
                <time dateTime={date}>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</time>
              </div>
              {/* Each round is a raised cream box: grip on the left to drag it (within a day or to another day), tap the rest for its settings page. */}
              {Array.from({ length: perDay }, (_, slot) => {
                const round = scheduleSlot(index, slot);
                const dragging = roundDrag?.day === index && roundDrag.slot === slot;
                return <Fragment key={slot}>
                  {dropLine(slot)}
                  <div className={`${styles.compRoundRow} ${styles.scheduleRoundCard} ${dragging ? styles.roundDragging : ""}`} data-drop-day={index} data-drop-slot={slot}
                    style={dragging ? { transform: `translateY(${roundDrag.dy}px)` } : undefined}>
                    <span className={styles.roundGrip} aria-hidden
                      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setRoundDrag({ day: index, slot, startY: event.clientY, dy: 0 }); setRoundDrop(null); }}
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
              {perDay < 2 && <button type="button" className={styles.addRound} onClick={() => setRoundsPerDay(current => ({ ...current, [index]: (perDay + 1) as 1 | 2 }))}><Plus size={14} strokeWidth={2.5} aria-hidden /> Add Round</button>}
            </section>;
          })}
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

      {playersOpen && <div className={styles.competition}>
        <section className={leaderboardStyles.match} aria-label="Players">
            <div className={leaderboardStyles.lineupHeader} role="group" aria-label="Number of players">
              <h2 className={leaderboardStyles.headerTitle}>Players</h2>
              <div className={`${styles.typeChoice} ${styles.stepper}`}>
                <button type="button" aria-label="Fewer players" disabled={playerTotal <= Math.max(1, joinedPlayers.length)} onClick={() => setPlayerTotal(count => count - 1)}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
                <span aria-live="polite">{playerTotal}</span>
                <button type="button" aria-label="More players" disabled={playerTotal >= MAX_PLAYERS} onClick={() => setPlayerTotal(count => count + 1)}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
              </div>
            </div>
            <div>
              <div className={`${leaderboardStyles.single} ${leaderboardStyles.columns} ${styles.playerRow} ${styles.playerListRow}`} aria-hidden="true">
                <span className={leaderboardStyles.columnPlayer}>Player</span>
              </div>
              <ol className={leaderboardStyles.lineup}>
                {Array.from({ length: playerTotal }, (_, index) => <li key={index} className={`${leaderboardStyles.single} ${styles.playerRow} ${styles.playerListRow}`}>
                  <span className={leaderboardStyles.rank}>{index + 1}</span>
                  <div className={leaderboardStyles.golfer}>
                    <span className={leaderboardStyles.golferName}>{joinedPlayers[index]?.name ?? `Player ${index + 1}`}</span>
                    {!joinedPlayers[index] && <span className={leaderboardStyles.tee}>Open spot</span>}
                  </div>
                  {joinedPlayers[index] && <button type="button" className={styles.playerDelete} aria-label={`Delete ${joinedPlayers[index].name}`} onClick={() => setRemovedPlayers(previous => new Set([...previous, joinedPlayers[index].key]))}><Trash2 size={18} aria-hidden /></button>}
                </li>)}
              </ol>
              <button type="button" className={`${leaderboardStyles.single} ${styles.playerRow} ${styles.addPlayer}`} disabled={playerTotal >= MAX_PLAYERS} onClick={() => setPlayerTotal(count => count + 1)}>
                <span className={leaderboardStyles.rank}><Plus size={16} aria-hidden="true" /></span>
                <span className={leaderboardStyles.cardButton} aria-hidden="true">ADD</span>
                <span className={leaderboardStyles.golferName}>Add player</span>
              </button>
            </div>
        </section>
      </div>}

      {historyOpen && <div className={styles.competition}><GolfTripHistory trips={pastTrips} onChange={setPastTrips} tripPlayers={joinedPlayers.map(player => player.name)} linking={historyLinking} /></div>}

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
      </div>}

      {playerScoringOpen && <div className={styles.competition}>
        <section className={notificationStyles.category} aria-label="What players enter">
          <h2 className={notificationStyles.categoryTitle}>What players enter</h2>
          <div className={notificationStyles.row}><span className={notificationStyles.label}>Their own score</span><span className={styles.alwaysOn}>Always on</span></div>
          {PLAYER_SCORING_FIELDS.map(field => {
            const on = !scoringFieldsOff.has(field);
            // Putts, Fairway and Greens are stats: only asked for while Player Stats is on.
            const stat = field !== "Opponent's score";
            return <Fragment key={field}>
              {field === "Putts" && <div className={notificationStyles.row}>
                <span className={notificationStyles.label}>Player Stats</span>
                <button type="button" role="switch" aria-checked={playerStats} aria-label="Player Stats" className={toggleStyles.toggle} onClick={() => setPlayerStats(!playerStats)}>
                  <span className={toggleStyles.track} data-on={playerStats}><span className={toggleStyles.thumb} /></span><span>{playerStats ? "On" : "Off"}</span>
                </button>
              </div>}
              <div className={`${notificationStyles.row} ${stat ? styles.statRow : ""}`} data-off={stat && !playerStats}>
                <span className={notificationStyles.label}>{field}</span>
                <button type="button" role="switch" aria-checked={on && (!stat || playerStats)} aria-label={field} className={toggleStyles.toggle} disabled={stat && !playerStats}
                  onClick={() => setScoringFieldsOff(current => { const next = new Set(current); if (on) next.add(field); else next.delete(field); return next; })}>
                  <span className={toggleStyles.track} data-on={on && (!stat || playerStats)}><span className={toggleStyles.thumb} /></span><span>{on && (!stat || playerStats) ? "On" : "Off"}</span>
                </button>
              </div>
            </Fragment>;
          })}
          {!playerStats && <p className={styles.statNote}>Stats off: players only enter their score, and no stats are recorded.</p>}
        </section>
        <OrganizerScores roundNumbers={rounds.map(round => round.number)} organizerId={simulator?.state.viewAs ?? DEFAULT_DEV_ACCOUNT}
          scheduledToday={simulator?.state.roundStatus === "live" || simulator?.state.roundStatus === "roundEnd"} />
      </div>}

      {allowedOpen && <div className={styles.competition}>
        <div className={tripStyles.events}>
          {ALLOWED_SECTIONS.map(name => <section key={name} className={tripStyles.infoSection}>
            <div className={tripStyles.infoHeaderRow}>
              <h2 className={tripStyles.eventsHeading}>{name}</h2>
            </div>
            {allowedRules.filter(rule => rule.section === name).map(rule => <div key={rule.id} className={styles.roundRow}>
              <div className={`${tripStyles.infoEntry} ${styles.roundEntry} ${styles.allowedEntry}`}>
                <span className={tripStyles.eventInfo}>
                  <span className={tripStyles.eventHost}>Allowed</span>
                  <span className={tripStyles.eventTitle}>{rule.name}</span>
                  <span className={tripStyles.eventMeta}><Check size={14} aria-hidden /><span>{rule.detail}</span></span>
                </span>
              </div>
              <button type="button" className={`${tripStyles.entryDelete} ${styles.roundDelete}`} aria-label={`Delete ${rule.name}`} onClick={() => setConfirmDeleteRuleId(rule.id)}><Trash2 size={16} aria-hidden /></button>
            </div>)}
            <button type="button" className={tripStyles.addItemButton} onClick={() => setAllowedRules(current => [...current, { id: `rule-${Date.now()}`, section: name, name: "New rule", detail: "Details TBD" }])}><Plus size={16} strokeWidth={2.5} aria-hidden />Add rule</button>
          </section>)}
        </div>
        {confirmDeleteRuleId && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Delete rule confirmation">
          <div className={tripStyles.deleteDialog}>
            <p className={tripStyles.deletePrompt}>Are you sure?</p>
            <button type="button" className={tripStyles.cancelButton} onClick={() => setConfirmDeleteRuleId(null)}>Keep editing</button>
            <button type="button" className={tripStyles.deleteButton} onClick={() => { setAllowedRules(current => current.filter(rule => rule.id !== confirmDeleteRuleId)); setConfirmDeleteRuleId(null); }}>Delete</button>
          </div>
        </div>}
      </div>}

      {!placeholder && !competitionOpen && !gamesOpen && !roundsOpen && !playersOpen && !allowedOpen && !playerScoringOpen && !scorecardViewOpen && !historyOpen && <div className={styles.grid}>
        {cards.map((title, index) => {
          if (title === "Competition") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setCompetitionOpen(true)}>
            <h2>{title}</h2>
          </button>;
          if (title === "Players") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setPlayersOpen(true)}>
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
          if (title === "Allowed") return <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setAllowedOpen(true)}>
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

function teeTimeLabel(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}
