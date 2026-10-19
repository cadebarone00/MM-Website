import type { TemplateValues } from "../template.ts";

/**
 * Builds placeholder values from what actually happened. Pure. Every name comes from the event's own sides / players —
 * never one arbitrary golfer copied into every slot. Missing facts stay missing, so a wording that needs them is
 * skipped instead of half-rendered.
 */

export interface Side {
  /** The team's name ("Team Maroon"); null for a match without teams. */
  team: string | null;
  /** The golfers on this side, in order (1 for singles, 2 for pairs formats). */
  players: string[];
}

/** "Cam" · "Cam and Cade" · "Cam, Drew, and Cade". */
export function formatList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
/** One match side as a single name: "Cam" or "Cam & Cade". */
export const sideName = (side: Side) => side.players.join(" & ");

/**
 * A match or team moment. `sideA` is the side the moment is about (the one that won the hole, leads, came back…);
 * `sideB` is the other side. {Player} / {Team} mean side A; {Opponent} means side B.
 */
export function matchValues(sideA: Side, sideB: Side): TemplateValues {
  const values: TemplateValues = { Player: sideName(sideA), Opponent: sideB.team ?? sideName(sideB) };
  sideA.players.slice(0, 2).forEach((name, i) => { values[`Player ${i + 1}, Team A`] = name; });
  sideB.players.slice(0, 2).forEach((name, i) => { values[`Player ${i + 1}, Team B`] = name; });
  if (sideA.team) { values.Team = sideA.team; values["Team A"] = sideA.team; }
  if (sideB.team) values["Team B"] = sideB.team;
  return values;
}

/** A moment several golfers share (e.g. HL-049 / HL-053 shared birdies): {Players} and {Player 1}…{Player 3}. */
export function groupValues(players: string[]): TemplateValues {
  const values: TemplateValues = { Players: formatList(players) };
  players.slice(0, 3).forEach((name, i) => { values[`Player ${i + 1}`] = name; });
  if (players.length === 1) values.Player = players[0];
  return values;
}

/** A team-standings moment (no individual match): {Team} / {Team A} = the team it's about, {Team B} = the other. */
export function teamValues(team: string, otherTeam: string | null): TemplateValues {
  return { Team: team, "Team A": team, ...(otherTeam ? { "Team B": otherTeam, Opponent: otherTeam } : {}) };
}
