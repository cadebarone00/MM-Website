/**
 * Turns a trip's saved setup into what Match Selection needs (pure; used by the server route and the simulator):
 * the round's settings, the two teams' players, the captains and team names, and the finished matches back into the
 * setup's member positions. Teams come from the team draft / Settings → Teams (submittedTeams, member positions).
 */
import type { MatchDraftRound } from "./matchDraft.ts";
import { selectionMinutes, type SelectionRosters, type SelectionRound } from "./matchSelection.ts";

const TYPES = ["Response", "Ranks", "Randomized"] as const;

/** A Match Draft round from Settings as a Match Selection round; null when its type isn't picked yet. */
export function selectionRoundFrom(round: MatchDraftRound): SelectionRound | null {
  const type = TYPES.find(item => item === round.type);
  if (!type) return null;
  return { key: round.key, number: round.number, course: round.course, format: round.format, type, matches: round.matches, perSide: round.perSide ?? 1,
    rankMinutes: selectionMinutes(round.rankMinutes), putForwardMinutes: selectionMinutes(round.putForwardMinutes), responseMinutes: selectionMinutes(round.responseMinutes) };
}

/** The two teams (profile ids) from submittedTeams; null unless it's exactly two non-empty teams of known members. */
export function selectionTeamsFrom(values: Record<string, unknown>, memberIds: string[]): { rosters: SelectionRosters; captains: [string | null, string | null]; teamNames: [string, string] } | null {
  const teams = values.submittedTeams;
  if (!Array.isArray(teams) || teams.length !== 2) return null;
  const rosters = teams.map(team => Array.isArray(team) ? team.map(index => memberIds[index as number]).filter((id): id is string => !!id) : []) as SelectionRosters;
  if (rosters.some(team => !team.length)) return null;
  const captains = values.draftCaptains && typeof values.draftCaptains === "object" ? values.draftCaptains as Record<string, unknown> : {};
  const captainOf = (team: 0 | 1) => typeof captains[String(team)] === "string" && rosters[team].includes(captains[String(team)] as string) ? captains[String(team)] as string : null;
  const names = Array.isArray(values.teamNames) ? values.teamNames as unknown[] : [];
  const name = (team: 0 | 1) => typeof names[team] === "string" && (names[team] as string).trim() ? (names[team] as string).trim() : `Team ${team ? "B" : "A"}`;
  return { rosters, captains: [captainOf(0), captainOf(1)], teamNames: [name(0), name(1)] };
}

/** The finished matches as the setup stores them (member positions). */
export function resultsAsPositions(results: { a: string[]; b: string[] }[], memberIds: string[]): { a: number[]; b: number[] }[] {
  const position = (id: string) => memberIds.indexOf(id);
  return results.map(match => ({ a: match.a.map(position).filter(index => index >= 0), b: match.b.map(position).filter(index => index >= 0) }));
}
