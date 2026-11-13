/**
 * DEV ONLY: a pretend Match Selection server in browser storage (project_specs.md "Match Selection: rebuilt room,
 * captains, saved and final" → Mock match selection). It runs the SAME rules as the real route
 * (lib/platform/matchSelection.ts) with its own clock (so "Jump the clock" can test timers), and powers:
 *   - the simulator's Mock match selection test run (setups, controller, checks, log), and
 *   - Match Selection on simulator samples and dev trips that aren't saved trips (no database there).
 */
import { applySelection, catchUpSelection, responseTurn, selectionResponse, selectionResults, visibleSpots, type SelectionAction, type SelectionMember, type SelectionRosters, type SelectionRound, type SelectionState, type SelectionViewer } from "@/lib/platform/matchSelection";
import type { MatchSelectionTransport } from "@/lib/platform/useMatchSelection";

export type MatchSelViewer = "organizer" | "captain-0" | "captain-1" | "player";
export const MATCH_SEL_VIEWERS: MatchSelViewer[] = ["organizer", "captain-0", "captain-1", "player"];
export type MatchLogEntry = { at: number; who: string; text: string; ok: boolean; probe?: boolean };
export type MatchSelStore = {
  key: string;
  members: SelectionMember[];
  rosters: SelectionRosters;
  captains: [string | null, string | null];
  teamNames: [string, string];
  organizer: string;
  rounds: Record<string, { round: SelectionRound; locked?: boolean; state: SelectionState | null }>;
  /** Added to the real clock (Jump the clock). */
  clockOffset: number;
  log: MatchLogEntry[];
  /** The panel saw the other team's unsubmitted / unlocked picks hidden (a check). */
  hiddenVerified?: boolean;
};

const NAMES = ["Alex", "Jordan", "Sam", "Casey", "Riley", "Jamie", "Drew", "Morgan", "Taylor", "Avery", "Parker", "Quinn", "Reese", "Blake", "Hayden", "Rowan"];
const round = (type: SelectionRound["type"], perSide: number, matches: number, extra: Partial<SelectionRound> = {}): SelectionRound =>
  ({ key: "1-0", number: 2, course: "Troon North · Monument", format: perSide === 2 ? "Fourball" : "Singles", type, matches, perSide, rankMinutes: 10, putForwardMinutes: 5, responseMinutes: 3, ...extra });

export const MOCK_MATCH_PRESETS = [
  { id: "response-singles", label: "Response · Singles 4 v 4", round: round("Response", 1, 4), perTeam: 4 },
  { id: "response-pairs", label: "Response · Pairs (2 v 2), 4 per team", round: round("Response", 2, 2), perTeam: 4 },
  { id: "ranks-singles", label: "Ranks · Singles 4 v 4", round: round("Ranks", 1, 4), perTeam: 4 },
  { id: "ranks-pairs", label: "Ranks · Pairs (2 v 2), 4 per team", round: round("Ranks", 2, 2), perTeam: 4 },
  { id: "randomized", label: "Randomized · Singles 4 v 4", round: round("Randomized", 1, 4), perTeam: 4 },
  { id: "response-timeout", label: "Response · a turn times out (use Jump the clock)", round: round("Response", 1, 4, { putForwardMinutes: 1, responseMinutes: 1 }), perTeam: 4, timeout: true },
  { id: "ranks-timeout", label: "Ranks · the window times out (use Jump the clock)", round: round("Ranks", 1, 4, { rankMinutes: 1 }), perTeam: 4, timeout: true },
  { id: "locked", label: "Round already played (locked)", round: round("Response", 1, 4), perTeam: 4, locked: true },
  { id: "short-teams", label: "Teams too small (can't start)", round: round("Response", 1, 4), perTeam: 3 },
] as const;
export type MockMatchPresetId = (typeof MOCK_MATCH_PRESETS)[number]["id"];
export const MOCK_MATCH_PRESET_IDS = MOCK_MATCH_PRESETS.map(preset => preset.id) as MockMatchPresetId[];

/** A fresh test run for a setup: Team A's first player and Team B's first player are the captains; the organizer runs it. */
export function newMockMatch(id: MockMatchPresetId): MatchSelStore {
  const preset = MOCK_MATCH_PRESETS.find(item => item.id === id) ?? MOCK_MATCH_PRESETS[0];
  const members: SelectionMember[] = [{ profileId: "mm-org", name: "Cade (organizer)" }, ...NAMES.slice(0, preset.perTeam * 2).map((name, index) => ({ profileId: `mm-${index}`, name, handicap: 4 + index }))];
  const rosters: SelectionRosters = [members.slice(1, 1 + preset.perTeam).map(m => m.profileId), members.slice(1 + preset.perTeam).map(m => m.profileId)];
  return { key: `mock:${id}`, members, rosters, captains: [rosters[0][0], rosters[1][0]], teamNames: ["Maroon", "White"], organizer: "mm-org",
    rounds: { [preset.round.key]: { round: preset.round, locked: "locked" in preset && preset.locked, state: null } }, clockOffset: 0, log: [] };
}

/** A pretend store for a simulator sample / dev trip: its own players, teams and rounds; the first player per team captains. */
export function newLocalMatch(key: string, members: SelectionMember[], rosters: SelectionRosters, teamNames: [string, string], rounds: { round: SelectionRound; locked?: boolean }[]): MatchSelStore {
  return { key, members, rosters, captains: [rosters[0][0] ?? null, rosters[1][0] ?? null], teamNames, organizer: "local-organizer",
    rounds: Object.fromEntries(rounds.map(item => [item.round.key, { round: item.round, locked: item.locked, state: null }])), clockOffset: 0, log: [] };
}

export function matchViewer(store: MatchSelStore, viewer: MatchSelViewer): SelectionViewer {
  if (viewer === "organizer") return { profileId: store.organizer, isOrganizer: true, captainOf: null, team: null };
  if (viewer === "player") {
    const id = [...store.rosters[1]].reverse().find(member => member !== store.captains[1]) ?? store.rosters[1][0];
    return { profileId: id, isOrganizer: false, captainOf: null, team: 1 };
  }
  const team = viewer === "captain-0" ? 0 : 1;
  return { profileId: store.captains[team] ?? `no-captain-${team}`, isOrganizer: false, captainOf: store.captains[team] ? team : null, team };
}
export function matchViewerLabel(store: MatchSelStore, viewer: MatchSelViewer): string {
  if (viewer === "organizer") return "Organizer";
  const id = matchViewer(store, viewer).profileId;
  const name = store.members.find(member => member.profileId === id)?.name ?? "nobody";
  return viewer === "player" ? `Player (${name}, ${store.teamNames[1]})` : `${store.teamNames[viewer === "captain-0" ? 0 : 1]} captain (${name})`;
}

const now = (store: MatchSelStore) => Date.now() + store.clockOffset;
const add = (store: MatchSelStore, entry: Omit<MatchLogEntry, "at">): MatchSelStore => ({ ...store, log: [...store.log, { ...entry, at: store.log.length + 1 }] });

/** Finish expired timers in every round (as the server does on each request). */
export function catchUpMock(store: MatchSelStore, random: () => number = Math.random): MatchSelStore {
  let next = store;
  for (const [key, item] of Object.entries(store.rounds)) {
    if (!item.state) continue;
    const { state, events } = catchUpSelection(item.round, store.rosters, item.state, now(store), random);
    if (state === item.state) continue;
    next = { ...next, rounds: { ...next.rounds, [key]: { ...item, state } } };
    for (const event of events) next = add(next, event);
    if (state.completedAt && !item.state.completedAt) next = add(next, { who: "Server", text: "All matches set — the round's selection is complete and saved", ok: true });
  }
  return next;
}

/** What the real route answers for this viewer. */
export function mockMatchRead(store: MatchSelStore, roundKey: string, viewer: MatchSelViewer) {
  const item = store.rounds[roundKey];
  if (!item) return { ok: false as const, error: "This round isn't set up for match selection." };
  return { ok: true as const, body: selectionResponse({ round: item.round, members: store.members, rosters: store.rosters, captains: store.captains, teamNames: store.teamNames, state: item.state, viewer: matchViewer(store, viewer), now: now(store) }) };
}

/** One action as the real route applies it (catch up timers, check the rules, save). */
export function mockMatchAct(store: MatchSelStore, roundKey: string, viewer: MatchSelViewer, input: SelectionAction, options: { probe?: boolean; random?: () => number } = {}): { store: MatchSelStore; error: string | null } {
  let next = catchUpMock(store, options.random);
  const item = next.rounds[roundKey];
  const who = matchViewerLabel(next, viewer);
  if (!item) return { store: next, error: "This round isn't set up for match selection." };
  const describe = (text: string) => input.action === "place" ? `${text} (${next.members.find(m => m.profileId === input.player)?.name ?? input.player})` : text;
  if (item.locked && !item.state?.completedAt) {
    const error = "This round has been played — its matches are locked.";
    return { store: add(next, { who, text: describe(`Tried to ${input.action} — refused: ${error}`), ok: false, probe: options.probe }), error };
  }
  const result = applySelection(item.round, next.rosters, item.state, matchViewer(next, viewer), input, now(next), options.random);
  if (result.error) return { store: add(next, { who, text: describe(`Tried to ${input.action} — refused: ${result.error}`), ok: false, probe: options.probe }), error: result.error };
  next = add({ ...next, rounds: { ...next.rounds, [roundKey]: { ...item, state: result.state } } }, { who, text: describe(result.event), ok: true });
  if (result.state?.completedAt) next = add(next, { who: "Server", text: `All matches set — saved: ${selectionResults(item.round, result.state).map((m, i) => `M${i + 1} ${m.a.map(id => nameOf(next, id)).join("+")} v ${m.b.map(id => nameOf(next, id)).join("+")}`).join(" · ")}`, ok: true });
  // The check "the other team can't see unsubmitted / unlocked picks": look at it from the other captain's side.
  const hiddenNow = (result.state?.spots ?? []).filter(spot => !spot.submitted);
  if (hiddenNow.length && hiddenNow.every(spot => visibleSpots(result.state, matchViewer(next, spot.team === 0 ? "captain-1" : "captain-0")).some(v => v.match === spot.match && v.team === spot.team && v.slot === spot.slot && v.hidden))) next = { ...next, hiddenVerified: true };
  return { store: next, error: null };
}
const nameOf = (store: MatchSelStore, id: string) => store.members.find(member => member.profileId === id)?.name ?? id;

export type MatchCheck = { id: string; label: string; state: "pass" | "fail" | "pending" };
export function mockMatchChecks(store: MatchSelStore, presetId: MockMatchPresetId): MatchCheck[] {
  const preset = MOCK_MATCH_PRESETS.find(item => item.id === presetId)!;
  const item = Object.values(store.rounds)[0];
  const refused = (pattern: RegExp) => store.log.some(entry => !entry.ok && pattern.test(entry.text));
  const state = item.state;
  const complete = !!state?.completedAt;
  if ("locked" in preset && preset.locked) return [{ id: "locked", label: "A played round can't be changed", state: refused(/locked/) ? "pass" : state ? "fail" : "pending" }];
  if (preset.perTeam < preset.round.matches * preset.round.perSide) return [{ id: "short", label: "Can't start when a team is too small for the round", state: refused(/needs \d+ players/) ? "pass" : state ? "fail" : "pending" }];
  const unique = !state || new Set(state.spots.map(spot => spot.profileId)).size === state.spots.length;
  const sidesOk = !state || state.spots.every(spot => store.rosters[spot.team].includes(spot.profileId));
  const base: MatchCheck[] = preset.round.type === "Randomized" ? [
    { id: "org-only", label: "Only the organizer can randomize", state: refused(/Only the organizer can randomize/) ? "pass" : "pending" },
    { id: "draw", label: "The draw uses every player once, each on their own team", state: complete ? (unique && sidesOk && state!.spots.length === preset.round.matches * preset.round.perSide * 2 ? "pass" : "fail") : "pending" },
  ] : [
    { id: "right-captain", label: "Only the right captain (or the organizer) can place", state: refused(/Only .* captain|turn on Match/) ? "pass" : "pending" },
    { id: "hidden", label: preset.round.type === "Ranks" ? "The other team can't see ranks until they're locked" : "The other team can't see a pick until it's submitted", state: store.hiddenVerified ? "pass" : "pending" },
    { id: "no-double", label: "A player can't be in two matches", state: !unique ? "fail" : refused(/already in a match/) || complete ? "pass" : "pending" },
  ];
  const timeout = "timeout" in preset && preset.timeout;
  return [...base,
    ...(timeout ? [{ id: "timer", label: "When time runs out, only empty spots are filled, from that team", state: store.log.some(entry => entry.who === "Timer") ? (sidesOk && unique ? "pass" : "fail") : "pending" } as MatchCheck] : []),
    { id: "saved", label: "When every match is set, the round is complete and the matches are saved", state: complete ? (unique && sidesOk ? "pass" : "fail") : "pending" },
  ];
}

export function mockMatchInstruction(store: MatchSelStore, presetId: MockMatchPresetId, viewer: MatchSelViewer): string {
  const preset = MOCK_MATCH_PRESETS.find(item => item.id === presetId)!;
  const item = Object.values(store.rounds)[0];
  const state = item.state;
  const label = matchViewerLabel(store, viewer);
  if (state?.completedAt) return "Done — every match is set and saved. Press Reset or pick another setup.";
  if (item.locked) return "This round has been played. Try anything (or press \"Try a wrong move\") — it must be refused.";
  if (preset.perTeam < preset.round.matches * preset.round.perSide) return "A team is too small for this round. As the Organizer, try Start — it must be refused.";
  if (!state) return viewer === "organizer" ? (preset.round.type === "Randomized" ? "Tap Randomize in the phone (try it as a captain first — it should be refused)." : "Tap Start in the phone.") : `You're ${label}: nothing to do until the organizer starts. Switch to Organizer.`;
  const timeout = "timeout" in preset && preset.timeout;
  if (preset.round.type === "Response") {
    const turn = responseTurn(item.round, state.spots)!;
    const who = store.teamNames[turn.team];
    const verb = turn.opening ? "put forward" : "respond";
    if (timeout) return `${who} is on the clock to ${verb} for Match ${turn.match + 1}. Press "Jump the clock" to let the time run out — the empty spot should be filled at random from ${who}.`;
    return viewer === `captain-${turn.team}` || viewer === "organizer"
      ? `Your turn (${who}) to ${verb} for Match ${turn.match + 1}: tap the glowing box, pick ${item.round.perSide === 1 ? "a player" : `${item.round.perSide} players`}, then Submit.`
      : `${who} captain is on the clock. As ${label} you can't place for them, and you shouldn't see their pick until it's submitted. Switch to ${who} captain.`;
  }
  if (timeout) return "Rank a spot or two, then press \"Jump the clock\": the empty ranks should fill at random and both teams be revealed.";
  const mineTeam = viewer === "captain-0" ? 0 : viewer === "captain-1" ? 1 : null;
  if (mineTeam === null) return viewer === "organizer" ? "Switch to each captain to rank their team (the organizer can too). The other captain shouldn't see them until both lock in." : `As ${label} you can't see either team's ranks until both lock in.`;
  return state.locked[mineTeam] ? `${store.teamNames[mineTeam]} is locked in. Switch to the other captain — they still shouldn't see your ranks.` : `Rank ${store.teamNames[mineTeam]}: tap each Rank box and pick a player, then Lock in ranks.`;
}

/** "Jump the clock": move the pretend clock just past the current turn / window's deadline (the timer then runs out). */
export function jumpMockClock(store: MatchSelStore): MatchSelStore {
  const deadline = Object.values(store.rounds).map(item => item.state?.deadline).find(Boolean);
  if (!deadline) return store;
  const jumped = { ...store, clockOffset: store.clockOffset + Math.max(0, Date.parse(deadline) - now(store)) + 1000 };
  return catchUpMock(add(jumped, { who: "Test panel", text: "Jumped the clock past the deadline", ok: true }));
}

/** The person who should act next and the action (for "Next step automatically"); null when nothing is left. */
export function mockMatchNext(store: MatchSelStore): { viewer: MatchSelViewer; input: SelectionAction } | null {
  const [roundKey, item] = Object.entries(store.rounds)[0];
  void roundKey;
  const state = item.state;
  if (item.locked || state?.completedAt) return null;
  if (!state) return { viewer: "organizer", input: item.round.type === "Randomized" ? { action: "randomize" } : { action: "start" } };
  const free = (team: 0 | 1) => store.rosters[team].filter(id => !state.spots.some(spot => spot.profileId === id));
  if (item.round.type === "Response") {
    const turn = responseTurn(item.round, state.spots)!;
    const viewer = `captain-${turn.team}` as MatchSelViewer;
    for (let slot = 0; slot < item.round.perSide; slot++) if (!state.spots.some(spot => spot.match === turn.match && spot.team === turn.team && spot.slot === slot))
      return { viewer, input: { action: "place", match: turn.match, team: turn.team, slot, player: free(turn.team)[0] } };
    return { viewer, input: { action: "submit" } };
  }
  for (const team of [0, 1] as const) {
    if (state.locked[team]) continue;
    const viewer = `captain-${team}` as MatchSelViewer;
    for (let match = 0; match < item.round.matches; match++) for (let slot = 0; slot < item.round.perSide; slot++)
      if (!state.spots.some(spot => spot.match === match && spot.team === team && spot.slot === slot)) return { viewer, input: { action: "place", match, team, slot, player: free(team)[0] } };
    return { viewer, input: { action: "lock", team } };
  }
  return null;
}

/** A move that must be refused right now (for "Try a wrong move"): the wrong person, or a player already in a match. */
export function mockMatchWrongMove(store: MatchSelStore): { viewer: MatchSelViewer; input: SelectionAction } {
  const item = Object.values(store.rounds)[0];
  const state = item.state;
  if (item.locked || !state) return item.round.type === "Randomized" && !item.locked ? { viewer: "captain-0", input: { action: "randomize" } } : { viewer: item.locked ? "organizer" : "captain-0", input: item.round.type === "Randomized" ? { action: "randomize" } : { action: "start" } };
  const finalSpot = state.spots.find(spot => spot.submitted);
  if (item.round.type === "Response") {
    const turn = responseTurn(item.round, state.spots);
    if (turn && finalSpot && finalSpot.team === turn.team) return { viewer: `captain-${turn.team}` as MatchSelViewer, input: { action: "place", match: turn.match, team: turn.team, slot: 0, player: finalSpot.profileId } };
    if (turn) return { viewer: `captain-${turn.team === 0 ? 1 : 0}` as MatchSelViewer, input: { action: "place", match: turn.match, team: turn.team, slot: 0, player: store.rosters[turn.team][0] } };
  }
  const team = state.locked[0] ? 1 : 0;
  return { viewer: `captain-${team === 0 ? 1 : 0}` as MatchSelViewer, input: { action: "place", match: 0, team, slot: 0, player: store.rosters[team][0] } };
}

// --- Browser storage (shared by the simulator panel and the phone) ----------------------------------------------------
const PREFIX = "maroon-mock-match:";
export const MOCK_MATCH_EVENT = "maroon-mock-match";
export function readMockMatch(key: string, fresh: () => MatchSelStore): MatchSelStore {
  try { const saved = JSON.parse(window.localStorage.getItem(PREFIX + key) ?? "null") as MatchSelStore | null; if (saved?.key === key && saved.rounds) return saved; } catch { /* start fresh */ }
  return writeMockMatch(fresh());
}
export function writeMockMatch(store: MatchSelStore): MatchSelStore {
  try { window.localStorage.setItem(PREFIX + store.key, JSON.stringify(store)); } catch { /* this tab only */ }
  window.dispatchEvent(new Event(MOCK_MATCH_EVENT));
  return store;
}
export function subscribeMockMatch(change: () => void): () => void {
  const storage = (event: StorageEvent) => { if (event.key?.startsWith(PREFIX)) change(); };
  window.addEventListener("storage", storage); window.addEventListener(MOCK_MATCH_EVENT, change);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(MOCK_MATCH_EVENT, change); };
}
export const mockMatchRaw = (key: string) => { try { return window.localStorage.getItem(PREFIX + key) ?? ""; } catch { return ""; } };

/** The Match Selection Room talks to this instead of /api/golf-trips/[tripId]/match-selection. */
export function mockMatchTransport(key: string, fresh: () => MatchSelStore, viewer: MatchSelViewer): MatchSelectionTransport {
  return {
    subscribe: subscribeMockMatch,
    load: async roundKey => {
      const before = readMockMatch(key, fresh);
      const store = catchUpMock(before);
      if (store !== before) writeMockMatch(store);
      const read = mockMatchRead(store, roundKey, viewer);
      return read.ok ? { ok: true, body: read.body } : { ok: false, body: { error: read.error } };
    },
    send: async (roundKey, payload) => {
      const result = mockMatchAct(readMockMatch(key, fresh), roundKey, viewer, payload as unknown as SelectionAction);
      writeMockMatch(result.store);
      if (result.error) return { ok: false, body: { error: result.error } };
      const read = mockMatchRead(result.store, roundKey, viewer);
      return read.ok ? { ok: true, body: read.body } : { ok: false, body: { error: read.error } };
    },
  };
}
