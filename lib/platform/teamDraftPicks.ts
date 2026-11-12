/**
 * Saved Team Draft (project_specs.md "Team Draft: picks are saved and final"): the one place that turns a trip's members,
 * captains and saved picks into the draft board — the teams, who is still available, whose turn it is, and whether a pick
 * is allowed. The Draft Room and the server route both use it, so they always agree. Pure: no React, no database.
 *
 * A drafted player belongs to that team for good: there is no undo and no moving. Captains sit in spot 1 of their team.
 */
import { teamDraftSize, teamDraftTeamCount, teamDraftTurn } from "./teamDraft.ts";

/** A trip member who can be drafted (accepted, signed-in account), in the trip's member order. */
export type DraftMember = { profileId: string; name: string; avatarUrl?: string | null; username?: string | null };
/** One saved pick. Pick numbers run 1, 2, 3… with no gaps. */
export type DraftPick = { pickNumber: number; profileId: string; team: number; pickedBy: string; pickedAt: string };
export type DraftSettings = { teamType: string | null; order: "Snake" | "Straight"; method: "Captain's Picks" | "Duck Race" };
/** Captain per team: team number ("0" = Team A) → profile id. */
export type DraftCaptains = Record<string, string>;

export type DraftBoard = {
  teamCount: number;
  /** Players per team (Infinity for 2 Teams). */
  capacity: number;
  /** Profile ids per team: captain first, then picks in the order they were made. */
  teams: string[][];
  available: string[];
  /** The team picking now; null when the draft is over. */
  turn: number | null;
  done: boolean;
  /** Teams that still need a captain (Captain's Picks can't run until there are none). */
  missingCaptains: number[];
};

/** The captain of each team that is a real member (others are ignored). */
export function draftCaptainsFor(captains: DraftCaptains | undefined, members: DraftMember[], teamCount: number): (string | null)[] {
  const ids = new Set(members.map(member => member.profileId));
  const seen = new Set<string>();
  return Array.from({ length: teamCount }, (_, team) => {
    const id = captains?.[String(team)];
    if (!id || !ids.has(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  });
}

export function draftBoardFor(members: DraftMember[], captains: DraftCaptains | undefined, settings: DraftSettings, picks: DraftPick[]): DraftBoard {
  const teamCount = teamDraftTeamCount(settings.teamType, members.length);
  const capacity = teamDraftSize(settings.teamType) ?? Infinity;
  const captainIds = draftCaptainsFor(captains, members, teamCount);
  const ordered = [...picks].sort((a, b) => a.pickNumber - b.pickNumber);
  const teams = captainIds.map((captain, team) => [...(captain ? [captain] : []), ...ordered.filter(pick => pick.team === team).map(pick => pick.profileId)]);
  const taken = new Set(teams.flat());
  const available = members.map(member => member.profileId).filter(id => !taken.has(id));
  const start = captainIds.map(captain => captain ? 1 : 0);
  const turn = available.length ? teamDraftTurn(settings.order, teams.map(team => team.length), start, capacity) : null;
  return { teamCount, capacity, teams, available, turn, done: turn === null, missingCaptains: captainIds.flatMap((captain, team) => captain ? [] : [team]) };
}

/**
 * Why this pick can't be made, or null when it can. `started` = the organizer opened the draft. The organizer can pick
 * for whichever team is on the clock; a captain only for their own team.
 */
export function draftPickError(board: DraftBoard, captains: DraftCaptains | undefined, members: DraftMember[], input: {
  viewer: string; isOrganizer: boolean; started: boolean; completed: boolean; settings: DraftSettings; player: string; pickNumber: number; picksSoFar: number;
}): string | null {
  if (input.settings.method !== "Captain's Picks") return "This draft type doesn't use picks.";
  if (input.completed || board.done || board.turn === null) return "The draft is over.";
  if (!input.started) return "The draft hasn't started yet.";
  if (board.missingCaptains.length) return "Every team needs a captain first (Settings → Players).";
  if (input.pickNumber !== input.picksSoFar + 1) return "That pick was already made.";
  if (!board.available.includes(input.player)) return "That player is already on a team.";
  const captainOfTurn = draftCaptainsFor(captains, members, board.teamCount)[board.turn];
  if (!input.isOrganizer && captainOfTurn !== input.viewer) return "It's not your pick.";
  return null;
}

/** The finished teams as Settings saves them (submittedTeams): each team's players as positions in the member list. */
export function draftTeamsAsSetup(board: DraftBoard, members: DraftMember[]): number[][] {
  const position = new Map(members.map((member, index) => [member.profileId, index]));
  return board.teams.map(team => team.map(id => position.get(id)!).filter(index => index !== undefined));
}

/** The draft as the database returns it (get_golf_trip_team_draft), checked. Null = not readable. */
export type SavedDraft = { startedAt: string | null; completedAt: string | null; picks: DraftPick[] };
export function savedDraftFromJson(value: unknown): SavedDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = (item: unknown) => typeof item === "string" ? item : null;
  const picks = Array.isArray(raw.picks) ? raw.picks.flatMap(item => {
    const p = item as Record<string, unknown>;
    return Number.isInteger(p.pickNumber) && typeof p.profileId === "string" && Number.isInteger(p.team)
      ? [{ pickNumber: p.pickNumber as number, profileId: p.profileId, team: p.team as number, pickedBy: text(p.pickedBy) ?? "", pickedAt: text(p.pickedAt) ?? "" }] : [];
  }) : [];
  return { startedAt: text(raw.startedAt), completedAt: text(raw.completedAt), picks };
}

/** The Team Draft part of a trip's saved setup. `isDraft` = teams are picked by draft. */
export function draftSetupFrom(values: Record<string, unknown>): { isDraft: boolean; settings: DraftSettings; captains: DraftCaptains } {
  const types = values.localCompetitionType as { team?: unknown } | undefined;
  const captains = values.draftCaptains && typeof values.draftCaptains === "object" && !Array.isArray(values.draftCaptains)
    ? Object.fromEntries(Object.entries(values.draftCaptains as Record<string, unknown>).filter(([, id]) => typeof id === "string")) as DraftCaptains : {};
  return {
    isDraft: values.teamSelection === "Draft",
    settings: { teamType: typeof types?.team === "string" ? types.team : "2 Teams", order: values.draftType === "Straight" ? "Straight" : "Snake", method: values.draftMethod === "Duck Race" ? "Duck Race" : "Captain's Picks" },
    captains,
  };
}

/** What GET / POST /api/golf-trips/[tripId]/team-draft answer with (and what the Draft Room shows). */
export type TeamDraftResponse = {
  members: DraftMember[];
  /** Captain per team (null = none yet). */
  captains: (string | null)[];
  settings: DraftSettings;
  draft: SavedDraft;
  viewer: { profileId: string; isOrganizer: boolean; captainOf: number | null };
};

/** A saved draft as the Draft Room's players: captains and picks placed on their teams (in pick order), then everyone left. */
export function draftRoomPlayersFrom(res: TeamDraftResponse): { id: string; name: string; avatarUrl?: string | null; username?: string | null; teamIndex?: number; captain?: boolean }[] {
  const captains = Object.fromEntries(res.captains.flatMap((id, team) => id ? [[String(team), id]] : [])) as DraftCaptains;
  const board = draftBoardFor(res.members, captains, res.settings, res.draft.picks);
  const byId = new Map(res.members.map(member => [member.profileId, member]));
  const placed = board.teams.flatMap((team, teamIndex) => team.map((id, spot) => ({ id, teamIndex, captain: spot === 0 && captains[String(teamIndex)] === id })));
  return [...placed, ...board.available.map(id => ({ id, teamIndex: undefined, captain: false }))].map(({ id, teamIndex, captain }) => {
    const member = byId.get(id)!;
    return { id, name: member.name, avatarUrl: member.avatarUrl, username: member.username, ...(teamIndex === undefined ? {} : { teamIndex, captain }) };
  });
}
