import { normalizeTripScenario } from "./tripScenario";
import { TOURNEY_PREVIEWS, type TourneyPreview } from "./sampleTourney";
import { isLivePreview, isLiveSurface, isTvGroup, isTvKind, isTvTeams, type LivePreview, type LiveSurface, type TvGroup, type TvKind, type TvTeams } from "./livePreviews";
import { ROUND_MOMENTS, type RoundMoment } from "./sampleRoundGames";
import { GAMES, type GameId } from "@/lib/platform/roundGames";
import { isTvPhase, type TvPhase } from "@/lib/platform/liveTv";
import type { GpsMode } from "@/lib/platform/golfGps/types";
import { GOLF_TRIP_TABS, GOLF_TRIP_SECTIONS, type GolfTripNavigation } from "@/lib/platform/golfTripNavigation";
import { DEFAULT_DEV_ACCOUNT, DEV_ACCOUNTS } from "./devAccounts";
import { PROFILE_PREVIEWS, type ProfilePreview } from "./sampleProfile";
import { isMockPersonId, type MockPersonId } from "./mockPeople";
import { WIDGET_PHONES, WIDGET_SIZES, WIDGET_STATES, type WidgetPhone, type WidgetSampleState, type WidgetSize } from "./sampleWidget";
import { WIDGET_IPHONES, type WidgetIphone } from "@/lib/notifications/widgetDesign";
import { ALL_NOTIFICATION_PREVIEWS, NOTIFICATION_TYPE_CHOICES, NOTIFICATION_WORDINGS, type NotificationPreview, type NotificationTypeChoice, type NotificationWording } from "./sampleNotifications";
import { parseHighlightSim, type HighlightSim } from "./highlightScenarios";
import { validDraftSim, type DraftSimState } from "./draftSim";
import { MOCK_DRAFT_PRESET_IDS, validMockViewer, type MockDraftPresetId, type MockViewer } from "./mockDraft";
import { MATCH_SEL_VIEWERS, MOCK_MATCH_PRESET_IDS, type MatchSelViewer, type MockMatchPresetId } from "./mockMatchSelection";
import { HOME_COMPETITION_STAGES, HOME_INVITE_STAGES, HOME_MOMENTUM_STAGES, HOME_OVERVIEW_STAGES, HOME_PLAYERS_STAGES, HOME_UPCOMING_STAGES, type HomeCompetitionStage, type HomeInviteStage, type HomeMomentumStage, type HomeOverviewStage, type HomePlayersStage, type HomeUpcomingStage } from "./homeSections";

// Portrait CSS pixels, not panel pixels. Safe insets are editable test inputs.
// Dimensions/provenance and browser-emulation limits: docs/dev-simulator-review.md.
export const SIMULATOR_DEVICES = [
  { id: "iphone16", label: "iPhone 16", width: 393, height: 852, top: 59, bottom: 34 },
  { id: "iphone16pro", label: "iPhone 16 Pro", width: 402, height: 874, top: 62, bottom: 34 },
  { id: "iphone16promax", label: "iPhone 16 Pro Max", width: 440, height: 956, top: 62, bottom: 34 },
  { id: "iphone17", label: "iPhone 17", width: 402, height: 874, top: 62, bottom: 34 },
  { id: "iphone17pro", label: "iPhone 17 Pro", width: 402, height: 874, top: 62, bottom: 34 },
  { id: "iphone17promax", label: "iPhone 17 Pro Max", width: 440, height: 956, top: 62, bottom: 34 },
  { id: "pixel9", label: "Google Pixel (9)", width: 412, height: 924, top: 24, bottom: 24 },
  { id: "pixel9pro", label: "Google Pixel Pro (9 Pro)", width: 412, height: 918, top: 24, bottom: 24 },
  // Apple Watch + CarPlay (project_specs.md "Simulator: Apple Watch + CarPlay devices"). Width × height = our app's area;
  // the CarPlay side bar (80 px) and the Dashboard's pretend map are drawn around it by the simulator.
  { id: "applewatch", label: "Apple Watch (46mm)", width: 208, height: 248, top: 0, bottom: 0 },
  { id: "carplay", label: "CarPlay · Full screen", width: 720, height: 480, top: 0, bottom: 0 },
  // Dashboard: the right column holds two stacked cards; our app gets one of them (top or bottom), never the whole column.
  { id: "carplaydashtop", label: "CarPlay · Dashboard · top card", width: 300, height: 237, top: 0, bottom: 0 },
  { id: "carplaydashbottom", label: "CarPlay · Dashboard · bottom card", width: 300, height: 237, top: 0, bottom: 0 },
  { id: "desktop", label: "Desktop browser", width: 1440, height: 900, top: 0, bottom: 0 },
  { id: "tv", label: "TV", width: 1920, height: 1080, top: 0, bottom: 0 },
  { id: "custom", label: "Custom viewport", width: 402, height: 874, top: 0, bottom: 0 },
] as const;

/** The Device section's View list (project_specs.md "Simulator: one Device section for every view"). */
export const SIMULATOR_VIEWS = [["app", "App"], ["mobileweb", "Mobile website"], ["desktop", "Desktop"], ["tv", "TV"], ["carplay", "CarPlay"], ["watch", "Apple Watch"]] as const;
export type SimulatorView = (typeof SIMULATOR_VIEWS)[number][0];

/** The device presets a view offers (more than one = the second dropdown: phones, or CarPlay's screens). */
export function simulatorViewDevices(view: SimulatorView): string[] {
  if (view === "app" || view === "mobileweb") return SIMULATOR_DEVICES.filter(item => item.id.startsWith("iphone") || item.id.startsWith("pixel")).map(item => item.id);
  if (view === "carplay") return SIMULATOR_DEVICES.filter(item => item.id.startsWith("carplay")).map(item => item.id);
  return [view === "watch" ? "applewatch" : view];
}

/** Which version of a The Maroon Live screen a view draws (the old Website desktop / Website mobile / App switch). */
export function liveSurfaceForView(view: SimulatorView): "app" | "mobile" | "desktop" {
  return view === "mobileweb" ? "mobile" : view === "desktop" || view === "tv" ? "desktop" : "app";
}

/** Trip Builder preview stages (simulator Conditionals). */
export const TRIP_BUILDER_STAGES = ["join-signed-out", "join-open", "join-member", "join-expired", "join-invalid", "tour-first", "tour-seen", "tips-organizer", "tips-member", "tips-seen"] as const;

export const SIMULATOR_SOURCES = [
  { id: "maroon", label: "Real development golf trip data" },
  { id: "mock", label: "Mock golf trip data" },
  { id: "empty", label: "Just created (onboarding finished)" },
  { id: "busy", label: "Populated / busy-state data" },
  { id: "masters", label: "The Maroon Masters (official)" },
] as const;
export type SimulatorSource = (typeof SIMULATOR_SOURCES)[number]["id"];
export type SimulatorConditional = { id: string; label: string; source?: SimulatorSource; state?: Partial<SimulatorState>; playerCount?: boolean;
  /** A heading the panel shows above this card when it starts a new group (e.g. Golf Trip → Home's sections). */
  section?: string };
export type SimulatorPage = { id: string; label: string; path: string; navigation?: GolfTripNavigation; fixtures: boolean; group?: string; parentId?: string; section?: string; conditions?: SimulatorConditional[]; viewport?: "desktop" | "mobile"; standalone?: boolean;
  /** Another LOCAL development server that serves this page (e.g. http://localhost:3002). No simulator bridge reaches it. */
  origin?: string;
  /** Feature groups (Golf Trips, Tourneys, Leagues, Play) only: which of the three switches it sits under. */
  stage?: SimulatorStage;
  /** Set when the page is picked (e.g. Tourneys → Onboarding → Create opens the sample on its create screen). */
  state?: Partial<SimulatorState> };
/** The four main features, in bottom-menu order. Each one splits its pages into Main · Active · Onboarding. */
export const SIMULATOR_FEATURES = ["Golf Trips", "Tourneys", "Leagues", "Play"] as const;
export const SIMULATOR_STAGES = ["Main", "Active", "Onboarding"] as const;
export type SimulatorStage = (typeof SIMULATOR_STAGES)[number];
/** Old group names (bookmarked /dev?group=… links) → the feature group and stage they moved to. */
export const LEGACY_SIMULATOR_GROUPS: Record<string, [string, SimulatorStage]> = {
  "Golf Trip Active": ["Golf Trips", "Active"], "Golf Trip Onboarding": ["Golf Trips", "Onboarding"],
  "Tournament Active": ["Tourneys", "Active"], "Mock people": ["Golf Trips", "Main"], "Invitations": ["Golf Trips", "Onboarding"],
};
export const SIMULATOR_STATES = [
  { id: "competition", label: "Trip / tournament status", kind: "select", options: [["source", "From data source"], ["yes", "Competitive trip"], ["no", "Social golf trip"]] },
  { id: "format", label: "Golf format", kind: "format" },
  { id: "playerCount", label: "Player count", kind: "number" },
  { id: "roundStatus", label: "Round state", kind: "select", options: [["source", "From data source"], ["scheduled", "Pre-tournament / before round 1"], ["live", "Live round"], ["roundEnd", "End of round, scores not submitted"], ["between", "Between rounds (round 3 done, round 4 next)"], ["complete", "Trip complete"]] },
  { id: "loading", label: "Loading state", kind: "select", options: [["off", "Normal"], ["weather", "Weather loading (Venue)"]] },
  { id: "opponentCard", label: "Opponent's scorecard", kind: "select", options: [["match", "Matches mine"], ["mismatch", "Has a mismatch"]] },
  { id: "role", label: "User role", kind: "pending", note: "Uses the current session; role simulation adapter pending." },
  { id: "notifications", label: "Notifications state", kind: "pending", note: "No notification-state adapter yet." },
] as const;
export type SimulatorState = {
  /** Team colors used only by fictional trip scenarios. */
  scenarioTeamAColor?: string;
  scenarioTeamBColor?: string;
  tripLength?: number;
  tripMoment?: "30-days" | "day-before" | "during" | "complete";
  tripDay?: number;
  tripRoundsPerDay?: number;
  tripRoundSlot?: number;
  draftProgress?: "team-draft" | "match-draft" | "ready";
  competition: "source" | "yes" | "no";
  format: string;
  playerCount: number | null;
  /** scheduled = pre-tournament (before round 1); live = a round in progress; roundEnd = the current round just
   *  finished, with my scorecard filled in but not submitted yet; between = round 3 done, waiting for round 4;
   *  complete = every round played. */
  roundStatus: "source" | "scheduled" | "live" | "roundEnd" | "between" | "complete";
  loading: "off" | "weather";
  /** The preview has no second scorer, so this stands in for whether the opponent's own card agrees with mine. */
  opponentCard: "match" | "mismatch";
  /** Which mock account the preview is signed in as (player-rounds preview: trip submit, dev profile, History links). */
  viewAs: string;
  /** Mock data: "Randomize data" picks a new seed; the same seed always builds the same made-up trip. Unset = the default mock trip. */
  seed?: number;
  /** Busy data: which competitions the trip has (no competition, individual only, match / team only, or both). Unset = from the data. */
  competitionSetup?: CompetitionSetup;
  /** Profile: show made-up rounds (lib/dev/sampleProfileRounds.ts) on my own profile, plus a sample golfer in Compare. */
  sampleStats?: boolean;
  /** Golf → Stats: a made-up trip's rounds (lib/dev/sampleTripRounds.ts) instead of the saved cards. */
  sampleTripStats?: boolean;
  /** Golf → Games: sample games partway through the round (lib/dev/sampleTripGames.ts) instead of this device's saved games. */
  sampleGames?: boolean;
  /** Profile preview (/dev/profile): whose sample profile shows and with how many rounds. Unset = "sample". */
  profilePreview?: ProfilePreview;
  /** Profile preview: the search bar open with nothing typed (friend requests), with results, or with no results. Unset = closed. */
  profileSearch?: "empty" | "results" | "none" | "friends" | "suggested";
  /** Settings preview (/dev/profile/settings): default, every notification off, an organizer offer waiting, or a content admin. */
  settingsPreview?: "default" | "allOff" | "offer" | "admin";
  /** The on-screen phone keyboard drawn when a text field is tapped (set by the simulator from the device preset). */
  keyboard?: "ios" | "android" | "off";
  dualDraftMomentum?: boolean;
  playerRoleViewer?: "organizer" | "captain-a" | "captain-b" | "player";
  matchDraftPreview?: "off" | "Response" | "Ranks" | "Randomized";
  /** Notifications group: which preview screen shows (lib/dev/sampleNotifications.ts). Unset = the page's first one. */
  notificationPreview?: NotificationPreview;
  /** Notifications group (Phone, In-app, All types): which type every screen draws (lib/notifications/catalog.ts). Unset / "mixed" = the design samples. */
  notificationType?: NotificationTypeChoice;
  /** Notifications group: which wording version (V1–V3) is the newest note. Unset = V1. */
  notificationWording?: NotificationWording;
  /** Notifications group (Phone, In-app): the Highlights scenario panel — engine output instead of the design samples. Unset = design samples. */
  highlightSim?: HighlightSim;
  /** Notifications group: lock / home screen wallpaper. Unset = the default (brighter maroon). */
  wallpaper?: "default" | "dark" | "light";
  /** Notifications → Home screen widget: size, sample state and phone (lib/dev/sampleWidget.ts). Unset = small, coming up, iPhone. */
  widgetSize?: WidgetSize;
  widgetState?: WidgetSampleState;
  widgetPhone?: WidgetPhone;
  /** Home screen widget: which iPhone's widget sizes (lib/notifications/widgetDesign.ts). Unset = pro. */
  widgetIphone?: WidgetIphone;
  brandStyle?: "clean" | "gold";
  brandStage?: "drawing" | "finished" | "reduced";
  brandDuration?: number;
  brandReplay?: number;
  /** Authentication → Profile Photo: No photo yet / phone picker look-alikes / Move and scale (cropper on a sample) / Photo chosen. Unset = "empty". */
  photoStage?: "empty" | "crop" | "chosen" | "ios-menu" | "ios-library" | "android-picker";
  /** Trip Builder dev previews (join page states, tips, tour). Unset = each preview's first state. */
  tripBuilderStage?: (typeof TRIP_BUILDER_STAGES)[number];
  /** Golf Trip → Venue (place recommendations design): which state shows. Unset = "list". */
  venueStage?: "list" | "loading" | "category" | "saved" | "empty" | "no-destination";
  /** Golf Trip → Home: the "How was yesterday?" after-visit rating prompt. Unset = "off". */
  ratingStage?: "off" | "prompt" | "one" | "done";
  /** Golf Trip → Home sections (lib/dev/homeSections.ts). Unset = that section shows the trip's own data. */
  homeOverview?: HomeOverviewStage;
  homeMomentum?: HomeMomentumStage;
  homeUpcoming?: HomeUpcomingStage;
  /** none = "No competition"; empty = competition, nothing scheduled yet. The draft cards use dualDraftMomentum / matchDraftPreview. */
  homeCompetition?: HomeCompetitionStage;
  homeInvite?: HomeInviteStage;
  homePlayers?: HomePlayersStage;
  /** Authentication → Birthday: boxes empty / the shared calendar open / a birthday filled in. Unset = "empty". */
  birthdayStage?: "empty" | "calendar" | "picked";
  /** Authentication → Sign up: the plain screen, or the "There's already an account with this email." state. Unset = "empty". */
  signUpStage?: "empty" | "account-exists";
  /** Authentication → Sign-up simulation: which practice case runs (lib/dev/signupSim.ts SIM_CASES). Unset = the picker. */
  signUpSimCase?: "new" | "exists" | "under13" | "wrong-code";
  /** Tourneys group (/dev/tourney): which sample tournament screen shows (lib/dev/sampleTourney.ts). Unset = "player". */
  tourneyPreview?: TourneyPreview;
  /** The Maroon Live group (/dev/live/…): which sample screen shows (lib/dev/livePreviews.ts). Unset = each page's first. */
  livePreview?: LivePreview;
  /** The Maroon Live group: the toggle above the simulator (Website desktop / Website mobile / App). Unset = "app". */
  liveSurface?: LiveSurface;
  /** The Maroon Live → TV mode: the stage (before / during / between rounds / completed) and the event kind. Unset = live, trip. */
  tvPhase?: TvPhase;
  tvKind?: TvKind;
  /** TV mode: the team structure (2 Teams / Pairs / 3-Ball / 4-Ball) and players per tee time. Unset = 2 Teams, groups of 2. */
  tvTeams?: TvTeams;
  tvGroup?: TvGroup;
  /** Play → Games mid round (/dev/round?game=…, lib/dev/sampleRoundGames.ts): group size, moment and options. Unset = ROUND_SAMPLE_DEFAULTS. */
  roundPlayers?: number;
  roundThru?: RoundMoment;
  roundNet?: boolean;
  roundBirdies?: "off" | "birdies" | "eagles";
  roundMoney?: boolean;
  roundDoubled?: boolean;
  roundCarry?: boolean;
  roundPress?: boolean;
  roundSide?: boolean;
  roundViewer?: "host" | "player";
  /** Golf Trip → Games sample: just this game (unset = every game) and whether games have started (unset = started). */
  sampleGame?: GameId;
  sampleGamesStarted?: boolean;
  /** Mock people group (/dev/people/…): which of the 5 pretend people is "signed in" (lib/dev/mockPeople.ts). Unset = Cade. */
  mockPerson?: MockPersonId;
  /** Home → Team Draft → Mock draft (test run): which setup runs ("off" = none) and who is holding the phone. */
  mockDraft?: MockDraftPresetId | "off";
  mockDraftViewer?: MockViewer;
  /** Home → Match Selection → Mock match selection (test run): which setup runs ("off" = none) and who holds the phone. */
  mockMatch?: MockMatchPresetId | "off";
  mockMatchViewer?: MatchSelViewer;
  /** Home → Team Draft / Match Selection sub-pages: the draft sample shown (lib/dev/draftSim.ts). */
} & DraftSimState;
export const COMPETITION_SETUPS = [["none", "No competition"], ["individual", "Individual only"], ["team", "Match only"], ["both", "Individual + match"]] as const;
export type CompetitionSetup = (typeof COMPETITION_SETUPS)[number][0];
/** The Individual / Team types a setup stands for (Settings → Competition). */
export function competitionSetupTypes(setup: CompetitionSetup): { individual: string | null; team: string | null } {
  return { individual: setup === "individual" || setup === "both" ? "Stroke Play" : null, team: setup === "team" || setup === "both" ? "2 Teams" : null };
}
export const DEFAULT_SIMULATOR_STATE: SimulatorState = { competition: "source", format: "source", playerCount: null, roundStatus: "source", loading: "off", opponentCard: "match", viewAs: DEFAULT_DEV_ACCOUNT };
export type SimulatorConfig = { source: SimulatorSource; state: SimulatorState; navigation?: GolfTripNavigation };
export const SIMULATOR_CHANNEL = "maroon-dev-simulator-v1";

/**
 * GPS test (simulator panel ↔ the app's GPS screen). The app reports its GPS state ("gps-state", null when no GPS screen is
 * open); the panel sends commands ("gps-command"): switch Real / Mock, step the mock player, or reset it to the tee.
 */
export type SimulatorGpsState = { mode: GpsMode; source: GpsMode | null; accuracyMeters: number | null };
export type SimulatorGpsCommand = { mode: GpsMode } | { move: { north: -1 | 0 | 1; east: -1 | 0 | 1 } } | { reset: true };
const isMode = (value: unknown): value is GpsMode => value === "real" || value === "mock";
const isStep = (value: unknown): value is -1 | 0 | 1 => value === -1 || value === 0 || value === 1;

/** Messages are untrusted: anything that isn't exactly a known command is dropped. */
export function parseGpsCommand(value: unknown): SimulatorGpsCommand | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if ("mode" in record) return isMode(record.mode) ? { mode: record.mode } : null;
  if ("reset" in record) return record.reset === true ? { reset: true } : null;
  if ("move" in record && record.move && typeof record.move === "object") {
    const { north, east } = record.move as Record<string, unknown>;
    return isStep(north) && isStep(east) && (north !== 0 || east !== 0) ? { move: { north, east } } : null;
  }
  return null;
}

export function parseGpsState(value: unknown): SimulatorGpsState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isMode(record.mode) || (record.source !== null && !isMode(record.source))) return null;
  if (record.accuracyMeters !== null && (typeof record.accuracyMeters !== "number" || !Number.isFinite(record.accuracyMeters) || record.accuracyMeters < 0)) return null;
  return { mode: record.mode, source: record.source as GpsMode | null, accuracyMeters: record.accuracyMeters as number | null };
}

export type SimulatorLocation = { path: string; navigation?: GolfTripNavigation };
export function isSimulatorPath(path: unknown): path is string {
  // A plain query is allowed too (/dev/round?game=wolf).
  return typeof path === "string" && /^\/[a-zA-Z0-9/_-]*(\?[a-zA-Z0-9=&_-]*)?$/.test(path) && !path.startsWith("//") && path !== "/dev";
}
export function parseSimulatorLocation(value: unknown): SimulatorLocation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isSimulatorPath(record.path)) return null;
  const navigation = record.navigation as GolfTripNavigation | undefined;
  if (navigation !== undefined && (!navigation || !GOLF_TRIP_TABS.includes(navigation.tab) || (navigation.golfSection !== undefined && !GOLF_TRIP_SECTIONS.includes(navigation.golfSection)))) return null;
  if (navigation?.settingsView !== undefined && !/^(player|organizer|players|schedule|match-selection|match-draft-room|competition|competition-rounds|skins|game-[a-z0-9-]+|games|history|placeholder-[1-8]|round-[a-z0-9-]+)$/.test(navigation.settingsView)) return null;
  return { path: record.path, navigation };
}

/** The discovered page descriptors are the mapping in BOTH directions. */
export function simulatorPageForLocation(pages: SimulatorPage[], location: SimulatorLocation, currentId?: string): SimulatorPage | undefined {
  // Pages can carry a query (/dev/round?game=wolf); the phone reports only its path, so the current page stays picked.
  const candidates = pages.filter(page => page.path.split("?")[0] === location.path);
  if (location.navigation) {
    const { tab, golfSection, settingsView } = location.navigation;
    if (settingsView) return candidates.find(page => page.navigation?.settingsView === settingsView);
    return candidates.find(page => page.navigation?.tab === tab && (tab !== "Golf" || (page.navigation.golfSection ?? "Overview") === (golfSection ?? "Overview")));
  }
  return candidates.find(page => page.id === currentId) ?? candidates.find(page => !page.navigation) ?? candidates[0];
}

export function sameSimulatorNavigation(left?: GolfTripNavigation, right?: GolfTripNavigation) {
  return left?.tab === right?.tab && left?.golfSection === right?.golfSection && left?.settingsView === right?.settingsView && left?.command === right?.command;
}

/** Remember in-app navigation so a fixture remount restores the visible page, without issuing a new command. */
export function syncSimulatorNavigation(current: GolfTripNavigation | undefined, reported: GolfTripNavigation | undefined): GolfTripNavigation | undefined {
  if (!reported) return current;
  const next = { ...reported, command: current?.command };
  return sameSimulatorNavigation(current, next) ? current : next;
}

/** Messages are untrusted, even from another same-origin frame. */
export function parseSimulatorConfig(value: unknown): SimulatorConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!SIMULATOR_SOURCES.some(source => source.id === record.source)) return null;
  if (!record.state || typeof record.state !== "object") return null;
  const state = record.state as Record<string, unknown>;
  if (!["source", "yes", "no"].includes(String(state.competition)) || !["source", "scheduled", "live", "roundEnd", "between", "complete"].includes(String(state.roundStatus)) || !["off", "weather"].includes(String(state.loading))) return null;
  if (state.opponentCard !== undefined && !["match", "mismatch"].includes(String(state.opponentCard))) return null;
  if (state.viewAs !== undefined && !DEV_ACCOUNTS.some((account) => account.id === state.viewAs)) return null;
  if (typeof state.format !== "string" || state.format.length > 32) return null;
  if (state.seed !== undefined && (typeof state.seed !== "number" || !Number.isSafeInteger(state.seed) || state.seed < 1 || state.seed > 2 ** 31)) return null;
  if (state.competitionSetup !== undefined && !COMPETITION_SETUPS.some(([id]) => id === state.competitionSetup)) return null;
  if (state.profilePreview !== undefined && !PROFILE_PREVIEWS.includes(state.profilePreview as ProfilePreview)) return null;
  if (state.profileSearch !== undefined && !["empty", "results", "none", "friends", "suggested"].includes(String(state.profileSearch))) return null;
  if (state.settingsPreview !== undefined && !["default", "allOff", "offer", "admin"].includes(String(state.settingsPreview))) return null;
  if (state.keyboard !== undefined && !["ios", "android", "off"].includes(String(state.keyboard))) return null;
  if (state.playerRoleViewer !== undefined && !["organizer","captain-a","captain-b","player"].includes(String(state.playerRoleViewer))) return null;
  if (state.matchDraftPreview !== undefined && !["off", "Response", "Ranks", "Randomized"].includes(String(state.matchDraftPreview))) return null;
  if (state.dualDraftMomentum !== undefined && typeof state.dualDraftMomentum !== "boolean") return null;
  if (!validDraftSim(state)) return null;
  if (state.mockDraft !== undefined && state.mockDraft !== "off" && !MOCK_DRAFT_PRESET_IDS.includes(state.mockDraft as MockDraftPresetId)) return null;
  if (state.mockDraftViewer !== undefined && !validMockViewer(state.mockDraftViewer)) return null;
  if (state.mockMatch !== undefined && state.mockMatch !== "off" && !MOCK_MATCH_PRESET_IDS.includes(state.mockMatch as MockMatchPresetId)) return null;
  if (state.mockMatchViewer !== undefined && !MATCH_SEL_VIEWERS.includes(state.mockMatchViewer as MatchSelViewer)) return null;
  if (state.notificationPreview !== undefined && !ALL_NOTIFICATION_PREVIEWS.includes(String(state.notificationPreview))) return null;
  if (state.notificationType !== undefined && !NOTIFICATION_TYPE_CHOICES.includes(state.notificationType as NotificationTypeChoice)) return null;
  if (state.notificationWording !== undefined && !NOTIFICATION_WORDINGS.includes(state.notificationWording as NotificationWording)) return null;
  if (state.wallpaper !== undefined && !["default", "dark", "light"].includes(String(state.wallpaper))) return null;
  if (state.widgetSize !== undefined && !(WIDGET_SIZES as readonly unknown[]).includes(state.widgetSize)) return null;
  if (state.widgetState !== undefined && !(WIDGET_STATES as readonly unknown[]).includes(state.widgetState)) return null;
  if (state.widgetPhone !== undefined && !(WIDGET_PHONES as readonly unknown[]).includes(state.widgetPhone)) return null;
  if (state.widgetIphone !== undefined && !(WIDGET_IPHONES as readonly unknown[]).includes(state.widgetIphone)) return null;
  if (state.highlightSim !== undefined && !parseHighlightSim(state.highlightSim)) return null;
  if (state.brandStyle !== undefined && !["clean", "gold"].includes(String(state.brandStyle))) return null;
  if (state.brandStage !== undefined && !["drawing", "finished", "reduced"].includes(String(state.brandStage))) return null;
  if (state.brandDuration !== undefined && (typeof state.brandDuration !== "number" || !Number.isFinite(state.brandDuration) || state.brandDuration < 600 || state.brandDuration > 2400)) return null;
  if (state.tourneyPreview !== undefined && !TOURNEY_PREVIEWS.includes(state.tourneyPreview as TourneyPreview)) return null;
  if (state.livePreview !== undefined && !isLivePreview(state.livePreview)) return null;
  if (state.liveSurface !== undefined && !isLiveSurface(state.liveSurface)) return null;
  if (state.tvPhase !== undefined && !isTvPhase(state.tvPhase)) return null;
  if (state.tvKind !== undefined && !isTvKind(state.tvKind)) return null;
  if (state.tvTeams !== undefined && !isTvTeams(state.tvTeams)) return null;
  if (state.tvGroup !== undefined && !isTvGroup(state.tvGroup)) return null;
  if (state.mockPerson !== undefined && !isMockPersonId(state.mockPerson)) return null;
  if (state.roundPlayers !== undefined && ![2, 3, 4, 5].includes(state.roundPlayers as number)) return null;
  if (state.roundThru !== undefined && !ROUND_MOMENTS.some(([thru]) => thru === state.roundThru)) return null;
  for (const key of ["roundNet", "roundMoney", "roundDoubled", "roundCarry", "roundPress", "roundSide", "sampleGamesStarted"] as const) if (state[key] !== undefined && typeof state[key] !== "boolean") return null;
  if (state.roundBirdies !== undefined && !["off", "birdies", "eagles"].includes(String(state.roundBirdies))) return null;
  if (state.roundViewer !== undefined && !["host", "player"].includes(String(state.roundViewer))) return null;
  if (state.sampleGame !== undefined && !GAMES.some((g) => g.id === state.sampleGame)) return null;
  if (state.ratingStage !== undefined && !["off", "prompt", "one", "done"].includes(String(state.ratingStage))) return null;
  if (state.venueStage !== undefined && !["list", "loading", "category", "saved", "empty", "no-destination"].includes(String(state.venueStage))) return null;
  for (const [key, allowed] of [["homeOverview", HOME_OVERVIEW_STAGES], ["homeMomentum", HOME_MOMENTUM_STAGES], ["homeUpcoming", HOME_UPCOMING_STAGES], ["homeCompetition", HOME_COMPETITION_STAGES], ["homeInvite", HOME_INVITE_STAGES], ["homePlayers", HOME_PLAYERS_STAGES]] as const)
    if (state[key] !== undefined && !(allowed as readonly unknown[]).includes(state[key])) return null;
  if (state.birthdayStage !== undefined && !["empty", "calendar", "picked"].includes(String(state.birthdayStage))) return null;
  if (state.signUpStage !== undefined && !["empty", "account-exists"].includes(String(state.signUpStage))) return null;
  if (state.signUpSimCase !== undefined && !["new", "exists", "under13", "wrong-code"].includes(String(state.signUpSimCase))) return null;
  if (state.tripBuilderStage !== undefined && !(TRIP_BUILDER_STAGES as readonly unknown[]).includes(state.tripBuilderStage)) return null;
  if (state.photoStage !== undefined && !["empty", "crop", "chosen", "ios-menu", "ios-library", "android-picker"].includes(String(state.photoStage))) return null;
  if (state.brandReplay !== undefined && (typeof state.brandReplay !== "number" || !Number.isSafeInteger(state.brandReplay) || state.brandReplay < 0)) return null;
  if (state.playerCount !== null && (typeof state.playerCount !== "number" || !Number.isInteger(state.playerCount) || state.playerCount < 1 || state.playerCount > 64)) return null;
  for (const key of ["tripLength", "tripDay"] as const) if(state[key]!==undefined && (typeof state[key]!=="number" || !Number.isInteger(state[key]) || state[key]<1 || state[key]>14)) return null;
  for (const key of ["tripRoundsPerDay", "tripRoundSlot"] as const) if(state[key]!==undefined && ![1,2].includes(state[key] as number)) return null;
  if(state.tripMoment!==undefined && !["30-days","day-before","during","complete"].includes(String(state.tripMoment))) return null;
  if(state.draftProgress!==undefined && !["team-draft","match-draft","ready"].includes(String(state.draftProgress))) return null;
  const navigation = record.navigation as GolfTripNavigation | undefined;
  if (navigation && (!GOLF_TRIP_TABS.includes(navigation.tab) || (navigation.golfSection && !GOLF_TRIP_SECTIONS.includes(navigation.golfSection)) || (navigation.command !== undefined && !Number.isSafeInteger(navigation.command)))) return null;
  if (!parseSimulatorLocation({ path: "/dev/tournament/settings", navigation })) return null;
  return { source: record.source as SimulatorSource, state: record.source === "mock" || record.source === "busy" ? normalizeTripScenario({ ...(state as SimulatorState), viewAs: (state.viewAs as string | undefined) ?? DEFAULT_DEV_ACCOUNT }) : { ...(state as SimulatorState), viewAs: (state.viewAs as string | undefined) ?? DEFAULT_DEV_ACCOUNT }, navigation };
}
