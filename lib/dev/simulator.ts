import type { GpsMode } from "@/lib/platform/golfGps/types";
import { GOLF_TRIP_TABS, GOLF_TRIP_SECTIONS, type GolfTripNavigation } from "@/lib/platform/golfTripNavigation";
import { DEFAULT_DEV_ACCOUNT, DEV_ACCOUNTS } from "./devAccounts";

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
  { id: "custom", label: "Custom viewport", width: 402, height: 874, top: 0, bottom: 0 },
] as const;

export const SIMULATOR_SOURCES = [
  { id: "maroon", label: "Real development golf trip data" },
  { id: "mock", label: "Mock golf trip data" },
  { id: "empty", label: "Just created (onboarding finished)" },
  { id: "busy", label: "Populated / busy-state data" },
] as const;
export type SimulatorSource = (typeof SIMULATOR_SOURCES)[number]["id"];
export type SimulatorConditional = { id: string; label: string; source?: SimulatorSource; state?: Partial<SimulatorState>; playerCount?: boolean };
export type SimulatorPage = { id: string; label: string; path: string; navigation?: GolfTripNavigation; fixtures: boolean; group?: string; parentId?: string; section?: string; conditions?: SimulatorConditional[] };
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
};
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
  return typeof path === "string" && /^\/[a-zA-Z0-9/_-]*$/.test(path) && !path.startsWith("//") && path !== "/dev";
}
export function parseSimulatorLocation(value: unknown): SimulatorLocation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isSimulatorPath(record.path)) return null;
  const navigation = record.navigation as GolfTripNavigation | undefined;
  if (navigation !== undefined && (!navigation || !GOLF_TRIP_TABS.includes(navigation.tab) || (navigation.golfSection !== undefined && !GOLF_TRIP_SECTIONS.includes(navigation.golfSection)))) return null;
  if (navigation?.settingsView !== undefined && !/^(player|organizer|players|schedule|competition|competition-rounds|game-[a-z0-9-]+|games|history|placeholder-[1-8]|round-[a-z0-9-]+)$/.test(navigation.settingsView)) return null;
  return { path: record.path, navigation };
}

/** The discovered page descriptors are the mapping in BOTH directions. */
export function simulatorPageForLocation(pages: SimulatorPage[], location: SimulatorLocation, currentId?: string): SimulatorPage | undefined {
  const candidates = pages.filter(page => page.path === location.path);
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
  if (state.playerCount !== null && (typeof state.playerCount !== "number" || !Number.isInteger(state.playerCount) || state.playerCount < 1 || state.playerCount > 64)) return null;
  const navigation = record.navigation as GolfTripNavigation | undefined;
  if (navigation && (!GOLF_TRIP_TABS.includes(navigation.tab) || (navigation.golfSection && !GOLF_TRIP_SECTIONS.includes(navigation.golfSection)) || (navigation.command !== undefined && !Number.isSafeInteger(navigation.command)))) return null;
  if (!parseSimulatorLocation({ path: "/dev/tournament/settings", navigation })) return null;
  return { source: record.source as SimulatorSource, state: { ...(state as SimulatorState), viewAs: (state.viewAs as string | undefined) ?? DEFAULT_DEV_ACCOUNT }, navigation };
}
