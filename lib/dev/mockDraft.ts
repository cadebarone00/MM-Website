/**
 * DEV ONLY: Mock draft test runs (project_specs.md "Dev simulator: Mock Draft + Mock Match Selection test runs").
 * A pretend Team Draft server that lives in browser storage and follows the SAME rules as the real route
 * (lib/platform/teamDraftPicks.ts): the phone's real Draft Room talks to it in live mode, and the simulator's test panel
 * reads the same store to show who's in control, what to do next, the checks and the log. Never touches the database.
 */
import { draftBoardFor, draftCaptainsFor, draftPickError, draftTeamsAsSetup, type DraftCaptains, type DraftMember, type DraftPick, type DraftSettings, type TeamDraftResponse } from "@/lib/platform/teamDraftPicks";
import { teamLetter } from "@/lib/platform/teamDraft";

export const MOCK_DRAFT_TRIP = "mock-team-draft";
export const MOCK_DRAFT_PRESETS = [
  { id: "2t-8-snake", label: "2 Teams · 8 players · Snake", teamType: "2 Teams", players: 8, order: "Snake" },
  { id: "2t-6-straight", label: "2 Teams · 6 players · Straight", teamType: "2 Teams", players: 6, order: "Straight" },
  { id: "pairs-8", label: "Pairs · 8 players (4 teams)", teamType: "Pairs", players: 8, order: "Snake" },
  { id: "3ball-12", label: "3-Ball · 12 players · Straight", teamType: "3-Ball", players: 12, order: "Straight" },
  { id: "4ball-16", label: "4-Ball · 16 players (4 teams)", teamType: "4-Ball", players: 16, order: "Snake" },
  // Wrong number of players (everyone must be on a team, every team the same size): the draft must refuse to start.
  { id: "2t-7", label: "Can't start · 2 Teams with 7 (odd)", teamType: "2 Teams", players: 7, order: "Snake", wrongCount: true },
  { id: "pairs-7", label: "Can't start · Pairs with 7", teamType: "Pairs", players: 7, order: "Snake", wrongCount: true },
  { id: "3ball-10", label: "Can't start · 3-Ball with 10", teamType: "3-Ball", players: 10, order: "Snake", wrongCount: true },
  { id: "4ball-10", label: "Can't start · 4-Ball with 10", teamType: "4-Ball", players: 10, order: "Snake", wrongCount: true },
  { id: "no-captain", label: "2 Teams · a team has no captain", teamType: "2 Teams", players: 8, order: "Snake", missingCaptain: true },
] as const;
export type MockDraftPresetId = (typeof MOCK_DRAFT_PRESETS)[number]["id"];
export const MOCK_DRAFT_PRESET_IDS = MOCK_DRAFT_PRESETS.map(preset => preset.id) as MockDraftPresetId[];
/** Who is holding the phone: the organizer, a team's captain ("captain-0" = Team A), or a player who can only watch. */
export type MockViewer = "organizer" | "player" | `captain-${number}`;
export const validMockViewer = (value: unknown): value is MockViewer => value === "organizer" || value === "player" || (typeof value === "string" && /^captain-([0-9]|[1-5][0-9]|6[0-3])$/.test(value));

const NAMES = ["Cade", "Alex", "Jordan", "Sam", "Casey", "Riley", "Jamie", "Drew", "Morgan", "Taylor", "Avery", "Parker", "Quinn", "Reese", "Blake", "Hayden"];
export type MockLogEntry = { at: number; who: string; text: string; ok: boolean; kind: "start" | "pick" | "refused" | "complete" | "reset" | "probe" };
export type MockDraftStore = {
  preset: MockDraftPresetId;
  members: DraftMember[];
  captains: DraftCaptains;
  settings: DraftSettings;
  organizer: string;
  draft: { startedAt: string | null; completedAt: string | null; picks: DraftPick[] };
  submittedTeams: number[][] | null;
  log: MockLogEntry[];
};

/** A fresh test run: member 0 is the organizer (also draftable); members 1..teams are the captains. */
export function newMockDraft(id: MockDraftPresetId): MockDraftStore {
  const preset = MOCK_DRAFT_PRESETS.find(item => item.id === id) ?? MOCK_DRAFT_PRESETS[0];
  const members = NAMES.slice(0, preset.players).map((name, index) => ({ profileId: `mock-${index}`, name: index === 0 ? `${name} (organizer)` : name }));
  const settings: DraftSettings = { teamType: preset.teamType, order: preset.order, method: "Captain's Picks" };
  const teams = draftBoardFor(members, {}, settings, []).teamCount;
  const captains: DraftCaptains = Object.fromEntries(Array.from({ length: teams }, (_, team) => [String(team), members[team + 1].profileId])
    .filter(([team]) => !("missingCaptain" in preset && preset.missingCaptain && team === String(teams - 1))));
  return { preset: preset.id, members, captains, settings, organizer: members[0].profileId, draft: { startedAt: null, completedAt: null, picks: [] }, submittedTeams: null, log: [] };
}

/** The profile id behind a viewer (the "player" is the last member who isn't a captain or the organizer). */
export function mockViewerId(store: MockDraftStore, viewer: MockViewer): string {
  if (viewer === "organizer") return store.organizer;
  if (viewer === "player") {
    const special = new Set([store.organizer, ...Object.values(store.captains)]);
    return [...store.members].reverse().find(member => !special.has(member.profileId))?.profileId ?? store.organizer;
  }
  return store.captains[viewer.slice("captain-".length)] ?? `no-captain-${viewer}`;
}
export function mockViewerLabel(store: MockDraftStore, viewer: MockViewer): string {
  if (viewer === "organizer") return "Organizer";
  const id = mockViewerId(store, viewer);
  const name = store.members.find(member => member.profileId === id)?.name ?? "nobody";
  return viewer === "player" ? `Player (${name})` : `Team ${teamLetter(Number(viewer.slice(8)))} captain (${name})`;
}
export function mockViewers(store: MockDraftStore): MockViewer[] {
  const teams = draftBoardFor(store.members, store.captains, store.settings, []).teamCount;
  return ["organizer", ...Array.from({ length: teams }, (_, team) => `captain-${team}` as MockViewer), "player"];
}

const boardOf = (store: MockDraftStore) => draftBoardFor(store.members, store.captains, store.settings, store.draft.picks);
const nameOf = (store: MockDraftStore, id: string) => store.members.find(member => member.profileId === id)?.name ?? id;
const log = (store: MockDraftStore, entry: Omit<MockLogEntry, "at">): MockDraftStore => ({ ...store, log: [...store.log, { ...entry, at: store.log.length + 1 }] });

/** What GET /api/golf-trips/[tripId]/team-draft would answer for this viewer. */
export function mockRead(store: MockDraftStore, viewer: MockViewer): TeamDraftResponse {
  const id = mockViewerId(store, viewer);
  const captains = draftCaptainsFor(store.captains, store.members, boardOf(store).teamCount);
  const captainOf = captains.indexOf(id);
  return { members: store.members, captains, settings: store.settings, draft: store.draft, viewer: { profileId: id, isOrganizer: id === store.organizer, captainOf: captainOf < 0 ? null : captainOf } };
}

/** What POST { action: "start" } would do (same checks as the route + database). */
export function mockStart(store: MockDraftStore, viewer: MockViewer, kind: MockLogEntry["kind"] = "start"): { store: MockDraftStore; error: string | null } {
  const who = mockViewerLabel(store, viewer);
  const refuse = (error: string) => ({ store: log(store, { who, text: `Start refused: ${error}`, ok: false, kind: kind === "probe" ? "probe" : "refused" }), error });
  if (mockViewerId(store, viewer) !== store.organizer) return refuse("Only the organizer can start the draft.");
  if (boardOf(store).countError) return refuse(boardOf(store).countError!);
  if (boardOf(store).missingCaptains.length) return refuse("Every team needs a captain first (Settings → Players).");
  if (store.draft.startedAt) return { store, error: null };
  return { store: log({ ...store, draft: { ...store.draft, startedAt: new Date(Date.UTC(2027, 3, 20, 18)).toISOString() } }, { who, text: "Started the draft", ok: true, kind: "start" }), error: null };
}

/** What POST { action: "pick" } would do: route checks, database checks, and saving the teams after the last pick. */
export function mockPick(store: MockDraftStore, viewer: MockViewer, player: string, pickNumber: number, kind: MockLogEntry["kind"] = "pick"): { store: MockDraftStore; error: string | null } {
  const id = mockViewerId(store, viewer);
  const who = mockViewerLabel(store, viewer);
  const board = boardOf(store);
  const error = draftPickError(board, store.captains, store.members, { viewer: id, isOrganizer: id === store.organizer, started: !!store.draft.startedAt,
    completed: !!store.draft.completedAt, settings: store.settings, player, pickNumber, picksSoFar: store.draft.picks.length });
  if (error) return { store: log(store, { who, text: `Tried to draft ${nameOf(store, player)} — refused: ${error}`, ok: false, kind: kind === "probe" ? "probe" : "refused" }), error };
  const pick: DraftPick = { pickNumber, profileId: player, team: board.turn!, pickedBy: id, pickedAt: new Date(Date.UTC(2027, 3, 20, 18, pickNumber)).toISOString() };
  let next = log({ ...store, draft: { ...store.draft, picks: [...store.draft.picks, pick] } }, { who, text: `Drafted ${nameOf(store, player)} → Team ${teamLetter(board.turn!)}`, ok: true, kind: "pick" });
  const after = boardOf(next);
  if (after.done) next = log({ ...next, submittedTeams: draftTeamsAsSetup(after, next.members), draft: { ...next.draft, completedAt: new Date(Date.UTC(2027, 3, 20, 19)).toISOString() } },
    { who: "Server", text: `Draft complete — teams saved (${after.teams.map((team, index) => `${teamLetter(index)}: ${team.map(member => nameOf(next, member)).join(", ")}`).join(" · ")})`, ok: true, kind: "complete" });
  return { store: next, error: null };
}

/** The viewer who should act now, and who shouldn't (for probes and "Next pick automatically"). */
export function mockTurn(store: MockDraftStore): { onClock: MockViewer | null; wrong: MockViewer | null } {
  const board = boardOf(store);
  if (board.turn === null || !store.draft.startedAt || store.draft.completedAt) return { onClock: null, wrong: null };
  const onClock = `captain-${board.turn}` as MockViewer;
  const wrong = mockViewers(store).find(viewer => viewer.startsWith("captain-") && viewer !== onClock) ?? "player";
  return { onClock, wrong };
}

export type MockCheck = { id: string; label: string; state: "pass" | "fail" | "pending" };
/** The checks the test panel shows, worked out from the log and the saved state. */
export function mockChecks(store: MockDraftStore): MockCheck[] {
  const refused = (match: RegExp) => store.log.some(entry => !entry.ok && match.test(entry.text));
  const board = boardOf(store);
  const preset = MOCK_DRAFT_PRESETS.find(item => item.id === store.preset)!;
  if ("wrongCount" in preset && preset.wrongCount) return [
    { id: "no-start", label: "The draft can't start with the wrong number of players", state: refused(/multiples of|even number|at least/) ? "pass" : store.draft.startedAt ? "fail" : "pending" },
    { id: "no-pick", label: "Nobody can pick", state: store.draft.picks.length ? "fail" : refused(/refused/) ? "pass" : "pending" },
  ];
  if ("missingCaptain" in preset && preset.missingCaptain) return [
    { id: "no-start", label: "The draft can't start while a team has no captain", state: refused(/captain first/) ? "pass" : store.draft.startedAt ? "fail" : "pending" },
    { id: "no-pick", label: "Nobody can pick", state: store.draft.picks.length ? "fail" : refused(/refused/) ? "pass" : "pending" },
  ];
  // Replay the saved picks: each must have gone to the team the rules said was on the clock.
  let orderOk = true;
  for (let index = 0; index < store.draft.picks.length; index++) {
    const before = draftBoardFor(store.members, store.captains, store.settings, store.draft.picks.slice(0, index));
    if (before.turn !== store.draft.picks[index].team) orderOk = false;
  }
  const pickedBeforeStart = store.draft.picks.some(pick => store.draft.startedAt && pick.pickedAt < store.draft.startedAt);
  return [
    { id: "before-start", label: "Picking can't start before Start team draft", state: pickedBeforeStart ? "fail" : refused(/hasn't started/) ? "pass" : "pending" },
    { id: "on-clock", label: "Only the captain on the clock (or the organizer) can pick", state: refused(/not your pick/) ? "pass" : "pending" },
    { id: "order", label: `Pick order follows ${store.settings.order}${Number.isFinite(board.capacity) ? ", skipping full teams" : ""}`, state: !orderOk ? "fail" : store.draft.picks.length >= 2 ? "pass" : "pending" },
    { id: "no-double", label: "A drafted player can't be drafted again", state: refused(/already on a team/) ? "pass" : "pending" },
    { id: "full", label: `Every team ends with exactly ${board.capacity} players (no team goes over)`, state: board.teams.some(team => team.length > board.capacity) ? "fail" : board.done ? (board.teams.every(team => team.length === board.capacity) ? "pass" : "fail") : "pending" },
    { id: "saved", label: "The last pick finishes the draft, everyone is on a team, and the teams are saved", state: store.draft.completedAt ? (store.submittedTeams?.flat().length === store.members.length ? "pass" : "fail") : "pending" },
  ];
}

/** One plain instruction: what the person testing should do next. */
export function mockInstruction(store: MockDraftStore, viewer: MockViewer): string {
  const board = boardOf(store);
  const label = mockViewerLabel(store, viewer);
  if (store.draft.completedAt) return "Draft complete — the teams are saved. Press Reset, or pick another setup.";
  if (board.countError) return `Wrong number of players: ${board.countError} As the Organizer, try Start team draft (or press "Try a wrong move") — it should be refused.`;
  if (board.missingCaptains.length) return `Team ${teamLetter(board.missingCaptains[0])} has no captain. As the Organizer, try Start team draft (or press "Try a wrong move") — it should be refused.`;
  if (!store.draft.startedAt) return viewer === "organizer"
    ? "You're the Organizer. Tap Start team draft in the phone. (Optional first: press \"Try a wrong move\" — an early pick should be refused.)"
    : `You're ${label}: you should see "Waiting for the organizer to start the draft" and no Draft buttons. Switch to Organizer to start.`;
  const { onClock } = mockTurn(store);
  const clockLabel = mockViewerLabel(store, onClock!);
  if (viewer === onClock) return `You're on the clock (Team ${teamLetter(board.turn!)}). Open Players in the phone and tap Draft on anyone.`;
  if (viewer === "organizer") return `${clockLabel} is on the clock. As the Organizer you can pick for them too — or switch to ${clockLabel}.`;
  return `${clockLabel} is on the clock. You're ${label}: you shouldn't see any Draft buttons. Switch to ${clockLabel} to pick.`;
}

// --- Browser storage (shared by the simulator panel and the phone, same origin) ---------------------------------------
const KEY = "maroon-mock-team-draft";
export const MOCK_DRAFT_EVENT = "maroon-mock-team-draft";
export function readMockDraft(preset: MockDraftPresetId): MockDraftStore {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as MockDraftStore | null;
    if (saved?.preset === preset && Array.isArray(saved.members)) return saved;
  } catch { /* unreadable: start fresh */ }
  return writeMockDraft(newMockDraft(preset));
}
export function writeMockDraft(store: MockDraftStore): MockDraftStore {
  try { window.localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked: this tab only */ }
  window.dispatchEvent(new Event(MOCK_DRAFT_EVENT));
  return store;
}
/** Calls `change` when the test run changes in this document or the other one (phone ↔ panel). */
export function subscribeMockDraft(change: () => void): () => void {
  const storage = (event: StorageEvent) => { if (event.key === KEY) change(); };
  window.addEventListener("storage", storage);
  window.addEventListener(MOCK_DRAFT_EVENT, change);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(MOCK_DRAFT_EVENT, change); };
}

/** The phone's Draft Room talks to this instead of /api/golf-trips/[tripId]/team-draft. */
export function mockDraftTransport(preset: MockDraftPresetId, viewer: MockViewer) {
  return {
    load: async () => ({ ok: true, body: mockRead(readMockDraft(preset), viewer) as unknown }),
    send: async (payload: Record<string, unknown>) => {
      const store = readMockDraft(preset);
      const result = payload.action === "start" ? mockStart(store, viewer) : mockPick(store, viewer, String(payload.player), Number(payload.pickNumber));
      writeMockDraft(result.store);
      return result.error ? { ok: false, body: { error: result.error } as unknown } : { ok: true, body: mockRead(result.store, viewer) as unknown };
    },
    subscribe: subscribeMockDraft,
  };
}
