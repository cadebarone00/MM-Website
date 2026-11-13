/**
 * Match Selection, saved and final (project_specs.md "Match Selection: rebuilt room, captains, saved and final").
 * The one place that runs a round's selection: who may act, whose turn it is, the timers, what each person may see, and
 * when the round is done. The server route, the Match Selection Room and the simulator's Mock match selection all use it,
 * so they always agree. Pure: no React, no database. Time comes in as `now` (ms); randomness as `random`.
 *
 * Owner decisions (2026-11-12): each team's captain sets their own team (the organizer can step in for either team);
 * Response groups are shown to the other team once submitted; Ranks stay hidden from the other team until locked;
 * nothing can be undone once submitted / revealed.
 */
import { teamLetter } from "./teamDraft.ts";

export type SelectionType = "Response" | "Ranks" | "Randomized";
export type Side = 0 | 1;
export type SelectionRound = {
  key: string; number: number; course: string; format: string; type: SelectionType;
  matches: number; perSide: number; rankMinutes: number; putForwardMinutes: number; responseMinutes: number;
};
/** A placed player. `submitted` = final and visible to everyone (Response: the group was submitted; Ranks: revealed). */
export type SelectionSpot = { match: number; team: Side; slot: number; profileId: string; placedBy: string | null; placedAt: string; submitted: boolean };
export type SelectionState = {
  startedAt: string;
  /** When the current turn (Response) or the ranking window (Ranks) ends; null = no timer. */
  deadline: string | null;
  /** Ranks: when each team locked in. */
  locked: [string | null, string | null];
  completedAt: string | null;
  spots: SelectionSpot[];
};
/** Each team's players (profile ids). */
export type SelectionRosters = [string[], string[]];
export type SelectionViewer = { profileId: string; isOrganizer: boolean; captainOf: Side | null; team: Side | null };
export type SelectionAction =
  | { action: "start" }
  | { action: "place"; match: number; team: Side; slot: number; player: string }
  | { action: "remove"; match: number; team: Side; slot: number }
  | { action: "submit" }
  | { action: "lock"; team: Side }
  | { action: "randomize" };
export type SelectionEvent = { who: string; text: string; ok: boolean };

/** Timer minutes from Settings (1–120; 10 when unset). */
export const selectionMinutes = (value: unknown) => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 120 ? value as number : 10;
const iso = (ms: number) => new Date(ms).toISOString();
const sideName = (team: Side) => `Team ${teamLetter(team)}`;
const total = (round: SelectionRound) => round.matches * round.perSide;

/** Response: the group to fill next — matches in order, Team A puts forward first in Match 1, Team B in Match 2, … */
export function responseTurn(round: SelectionRound, spots: SelectionSpot[]): { match: number; team: Side; opening: boolean } | null {
  for (let match = 0; match < round.matches; match++) {
    const order: Side[] = match % 2 ? [1, 0] : [0, 1];
    for (const [index, team] of order.entries()) {
      if (spots.filter(spot => spot.match === match && spot.team === team && spot.submitted).length < round.perSide) return { match, team, opening: index === 0 };
    }
  }
  return null;
}

/** Why this round can't start (teams too small for its matches), or null. */
export function selectionStartError(round: SelectionRound, rosters: SelectionRosters): string | null {
  if (!round.matches) return "This round has no matches to set.";
  for (const team of [0, 1] as const) if (rosters[team].length < total(round)) return `${sideName(team)} needs ${total(round)} players for this round (it has ${rosters[team].length}).`;
  return null;
}

/** May this viewer place for that team? The team's captain, or the organizer. */
export const mayActFor = (viewer: SelectionViewer, team: Side) => viewer.isOrganizer || viewer.captainOf === team;

const shuffle = (ids: string[], random: () => number) => {
  const list = [...ids];
  for (let index = list.length - 1; index > 0; index--) { const other = Math.floor(random() * (index + 1)); [list[index], list[other]] = [list[other], list[index]]; }
  return list;
};
const done = (round: SelectionRound, spots: SelectionSpot[]) => spots.filter(spot => spot.submitted).length >= total(round) * 2;

/** Fill a team's empty spots (in the given matches) at random from its players not yet placed; keeps what's there. */
function fillEmpty(round: SelectionRound, rosters: SelectionRosters, spots: SelectionSpot[], team: Side, matches: number[], at: string, random: () => number): SelectionSpot[] {
  const used = new Set(spots.filter(spot => spot.team === team).map(spot => spot.profileId));
  const pool = shuffle(rosters[team].filter(id => !used.has(id)), random);
  const added: SelectionSpot[] = [];
  for (const match of matches) for (let slot = 0; slot < round.perSide; slot++) {
    if (!spots.some(spot => spot.match === match && spot.team === team && spot.slot === slot) && pool.length) added.push({ match, team, slot, profileId: pool.shift()!, placedBy: null, placedAt: at, submitted: false });
  }
  return [...spots, ...added];
}

/**
 * Timers: every turn / window whose time has run out is finished at its own deadline (even if nobody had the room open):
 * Response fills the empty spots of the group on turn at random from that team and submits it; Ranks fills each team's
 * empty spots at random and reveals both. Returns the new state and what happened (for the log).
 */
export function catchUpSelection(round: SelectionRound, rosters: SelectionRosters, state: SelectionState, now: number, random: () => number = Math.random): { state: SelectionState; events: SelectionEvent[] } {
  let next = state;
  const events: SelectionEvent[] = [];
  if (next.completedAt || !next.deadline) return { state: next, events };
  if (round.type === "Response") {
    for (let guard = 0; guard < round.matches * 2 + 2 && next.deadline && Date.parse(next.deadline) <= now; guard++) {
      const turn = responseTurn(round, next.spots);
      if (!turn) break;
      const at = next.deadline;
      const filled = fillEmpty(round, rosters, next.spots, turn.team, [turn.match], at, random)
        .map(spot => spot.match === turn.match && spot.team === turn.team ? { ...spot, submitted: true } : spot);
      events.push({ who: "Timer", text: `${sideName(turn.team)}'s time ran out — Match ${turn.match + 1} filled at random and submitted`, ok: true });
      const following = responseTurn(round, filled);
      next = { ...next, spots: filled, deadline: following ? iso(Date.parse(at) + selectionMinutes(following.opening ? round.putForwardMinutes : round.responseMinutes) * 60000) : null };
    }
  } else if (round.type === "Ranks" && Date.parse(next.deadline) <= now) {
    const matches = Array.from({ length: round.matches }, (_, match) => match);
    let spots = fillEmpty(round, rosters, next.spots, 0, matches, next.deadline, random);
    spots = fillEmpty(round, rosters, spots, 1, matches, next.deadline, random).map(spot => ({ ...spot, submitted: true }));
    events.push({ who: "Timer", text: "Ranking time ran out — empty spots filled at random, both teams' ranks revealed", ok: true });
    next = { ...next, spots, deadline: null, locked: [next.locked[0] ?? next.deadline, next.locked[1] ?? next.deadline] };
  }
  if (!next.completedAt && done(round, next.spots)) next = { ...next, completedAt: iso(now), deadline: null };
  return { state: next, events };
}

/**
 * One action, as the server applies it (after catchUpSelection). Returns the new state, or the reason it's refused.
 * `state` null = not started yet.
 */
export function applySelection(round: SelectionRound, rosters: SelectionRosters, state: SelectionState | null, viewer: SelectionViewer, input: SelectionAction, now: number, random: () => number = Math.random): { state: SelectionState | null; error: string | null; event: string } {
  const refuse = (error: string) => ({ state, error, event: "" });
  const at = iso(now);
  if (input.action === "start" || input.action === "randomize") {
    if (!viewer.isOrganizer) return refuse(input.action === "start" ? "Only the organizer can start match selection." : "Only the organizer can randomize the matches.");
    if (state) return refuse(state.completedAt ? "This round's matches are already set." : "Match selection has already started.");
    const problem = selectionStartError(round, rosters);
    if (problem) return refuse(problem);
    if (round.type === "Randomized" ? input.action !== "randomize" : input.action !== "start") return refuse(round.type === "Randomized" ? "Randomized rounds are drawn with Randomize." : "Start match selection first.");
    if (round.type === "Randomized") {
      const spots: SelectionSpot[] = ([0, 1] as const).flatMap(team => shuffle(rosters[team], random).slice(0, total(round))
        .map((profileId, index) => ({ match: Math.floor(index / round.perSide), team, slot: index % round.perSide, profileId, placedBy: viewer.profileId, placedAt: at, submitted: true })));
      return { state: { startedAt: at, deadline: null, locked: [at, at], completedAt: at, spots }, error: null, event: "Randomized the matches" };
    }
    const minutes = round.type === "Ranks" ? selectionMinutes(round.rankMinutes) : selectionMinutes(round.putForwardMinutes);
    return { state: { startedAt: at, deadline: iso(now + minutes * 60000), locked: [null, null], completedAt: null, spots: [] }, error: null, event: `Started match selection (${round.type})` };
  }
  if (!state) return refuse("Match selection hasn't started yet.");
  if (state.completedAt) return refuse("This round's matches are already set.");

  if (input.action === "place" || input.action === "remove") {
    const { match, team, slot } = input;
    if (![0, 1].includes(team) || !Number.isInteger(match) || match < 0 || match >= round.matches || !Number.isInteger(slot) || slot < 0 || slot >= round.perSide) return refuse("That spot doesn't exist.");
    if (!mayActFor(viewer, team)) return refuse(`Only ${sideName(team)}'s captain (or the organizer) can set ${sideName(team)}.`);
    if (round.type === "Response") {
      const turn = responseTurn(round, state.spots);
      if (!turn || turn.match !== match || turn.team !== team) return refuse(turn ? `It's ${sideName(turn.team)}'s turn on Match ${turn.match + 1}.` : "Every match is set.");
    }
    if (round.type === "Ranks" && state.locked[team]) return refuse(`${sideName(team)} has locked in its ranks.`);
    const current = state.spots.find(spot => spot.match === match && spot.team === team && spot.slot === slot);
    if (current?.submitted) return refuse("That spot is already final.");
    if (input.action === "remove") {
      if (!current) return refuse("That spot is empty.");
      return { state: { ...state, spots: state.spots.filter(spot => spot !== current) }, error: null, event: `Cleared ${sideName(team)} Match ${match + 1}` };
    }
    if (!rosters[team].includes(input.player)) return refuse(`That player isn't on ${sideName(team)}.`);
    const elsewhere = state.spots.find(spot => spot.profileId === input.player);
    if (elsewhere?.submitted) return refuse("That player is already in a match.");
    // Moving a player within their own team (not final yet) is fine: they leave their old spot.
    const spots = [...state.spots.filter(spot => spot !== current && spot !== elsewhere), { match, team, slot, profileId: input.player, placedBy: viewer.profileId, placedAt: at, submitted: false }];
    return { state: { ...state, spots }, error: null, event: `${round.type === "Ranks" ? "Ranked" : "Placed"} a player for ${sideName(team)} · ${round.type === "Ranks" ? "Rank" : "Match"} ${match + 1}` };
  }

  if (input.action === "submit") {
    if (round.type !== "Response") return refuse("Only Response rounds submit groups.");
    const turn = responseTurn(round, state.spots);
    if (!turn) return refuse("Every match is set.");
    if (!mayActFor(viewer, turn.team)) return refuse(`It's ${sideName(turn.team)}'s turn.`);
    const group = state.spots.filter(spot => spot.match === turn.match && spot.team === turn.team);
    if (group.length < round.perSide) return refuse(round.perSide === 1 ? "Choose a player first." : `Choose ${round.perSide} players first.`);
    const spots = state.spots.map(spot => spot.match === turn.match && spot.team === turn.team ? { ...spot, submitted: true } : spot);
    const following = responseTurn(round, spots);
    const completedAt = following ? null : at;
    return { state: { ...state, spots, completedAt, deadline: following ? iso(now + selectionMinutes(following.opening ? round.putForwardMinutes : round.responseMinutes) * 60000) : null },
      error: null, event: `${sideName(turn.team)} ${turn.opening ? "put forward" : "responded"} on Match ${turn.match + 1}` };
  }

  // Lock in ranks.
  if (round.type !== "Ranks") return refuse("Only Ranks rounds lock in.");
  if (!mayActFor(viewer, input.team)) return refuse(`Only ${sideName(input.team)}'s captain (or the organizer) can lock in ${sideName(input.team)}.`);
  if (state.locked[input.team]) return refuse(`${sideName(input.team)} has already locked in.`);
  if (state.spots.filter(spot => spot.team === input.team).length < total(round)) return refuse("Rank every spot first.");
  const locked: [string | null, string | null] = input.team === 0 ? [at, state.locked[1]] : [state.locked[0], at];
  const reveal = !!(locked[0] && locked[1]);
  return { state: { ...state, locked, spots: reveal ? state.spots.map(spot => ({ ...spot, submitted: true })) : state.spots, deadline: reveal ? null : state.deadline, completedAt: reveal ? at : null },
    error: null, event: `${sideName(input.team)} locked in its ranks${reveal ? " — both revealed" : ""}` };
}

/** A spot as a viewer sees it: the player, or "hidden" (the other team's unsubmitted Response pick / unrevealed rank). */
export type VisibleSpot = Omit<SelectionSpot, "profileId" | "placedBy"> & { profileId: string | null; hidden: boolean };
/**
 * What this viewer may see. Their own team (and the organizer, who runs it) sees everything; everyone else sees only
 * final spots — Response groups once submitted, Ranks once revealed. Hidden spots still show as taken, without the name.
 */
export function visibleSpots(state: SelectionState | null, viewer: SelectionViewer): VisibleSpot[] {
  return (state?.spots ?? []).map(full => {
    const spot = { match: full.match, team: full.team, slot: full.slot, placedAt: full.placedAt, submitted: full.submitted };
    const mine = viewer.isOrganizer || viewer.team === full.team || viewer.captainOf === full.team;
    return mine || full.submitted ? { ...spot, profileId: full.profileId, hidden: false } : { ...spot, profileId: null, hidden: true };
  });
}

/** The finished matches: per match, Team A's and Team B's players (profile ids). */
export function selectionResults(round: SelectionRound, state: SelectionState): { a: string[]; b: string[] }[] {
  return Array.from({ length: round.matches }, (_, match) => ({
    a: state.spots.filter(spot => spot.match === match && spot.team === 0).sort((x, y) => x.slot - y.slot).map(spot => spot.profileId),
    b: state.spots.filter(spot => spot.match === match && spot.team === 1).sort((x, y) => x.slot - y.slot).map(spot => spot.profileId),
  }));
}

/** What GET / POST /api/golf-trips/[tripId]/match-selection answer with (and what the Match Selection Room shows). */
export type SelectionMember = { profileId: string; name: string; avatarUrl?: string | null; username?: string | null; handicap?: number };
export type MatchSelectionResponse = {
  round: SelectionRound;
  members: SelectionMember[];
  rosters: SelectionRosters;
  captains: [string | null, string | null];
  teamNames: [string, string];
  started: boolean; completed: boolean;
  deadline: string | null;
  locked: [boolean, boolean];
  spots: VisibleSpot[];
  turn: { match: number; team: Side; opening: boolean } | null;
  viewer: SelectionViewer;
  /** Why it can't start (teams too small), or null. */
  startError: string | null;
  /** Server clock when answering (the room counts down from it). */
  now: string;
};
export function selectionResponse(input: { round: SelectionRound; members: SelectionMember[]; rosters: SelectionRosters; captains: [string | null, string | null]; teamNames: [string, string]; state: SelectionState | null; viewer: SelectionViewer; now: number }): MatchSelectionResponse {
  const { round, state } = input;
  return {
    round: input.round, members: input.members, rosters: input.rosters, captains: input.captains, teamNames: input.teamNames,
    started: !!state, completed: !!state?.completedAt, deadline: state?.deadline ?? null, locked: [!!state?.locked[0], !!state?.locked[1]],
    spots: visibleSpots(state, input.viewer), turn: round.type === "Response" && state && !state.completedAt ? responseTurn(round, state.spots) : null,
    viewer: input.viewer, startError: selectionStartError(round, input.rosters), now: iso(input.now),
  };
}

/** The saved state as stored (golf_trip_match_selection.state), checked. Null = nothing usable. */
export function selectionStateFromJson(value: unknown): SelectionState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = (item: unknown) => typeof item === "string" ? item : null;
  if (!text(raw.startedAt)) return null;
  const locked = Array.isArray(raw.locked) ? raw.locked : [];
  const spots = Array.isArray(raw.spots) ? raw.spots.flatMap(item => {
    const spot = item as Record<string, unknown>;
    return Number.isInteger(spot.match) && (spot.team === 0 || spot.team === 1) && Number.isInteger(spot.slot) && typeof spot.profileId === "string"
      ? [{ match: spot.match as number, team: spot.team as Side, slot: spot.slot as number, profileId: spot.profileId, placedBy: text(spot.placedBy), placedAt: text(spot.placedAt) ?? "", submitted: spot.submitted === true }] : [];
  }) : [];
  return { startedAt: raw.startedAt as string, deadline: text(raw.deadline), locked: [text(locked[0]), text(locked[1])], completedAt: text(raw.completedAt), spots };
}
