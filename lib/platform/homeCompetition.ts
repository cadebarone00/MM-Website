/**
 * Trip Home → Competition: everything the trip's competition is, from its real settings (owner, 2026-11-10):
 * type (Individual / Team / Team & Individual), team format (2 Teams, Pairs, 3 Ball, 4 Ball), individual format,
 * number of golf days and rounds, each round's format, total team points and points needed to win.
 * Pure logic, safe to import anywhere.
 */
import type { RoundScoring } from "./golfTripPreviewFixture";

export type HomeCompetitionSummary = {
  type: "Team & Individual" | "Team" | "Individual";
  /** "2 Teams", "Pairs", "3 Ball", "4 Ball"; null without a team competition. */
  teamFormat: string | null;
  /** "Stroke Play", "Points Based"; null without an individual competition. */
  individualFormat: string | null;
  days: number;
  /** Each round: its format and course. */
  rounds: { number: number; format: string; course: string }[];
  /** Filled in on Home: your team name (2 Teams) or your teammates' last names (3 Ball / 4 Ball / Pairs). */
  yourTeam?: string | null;
  /** Team points across every competition round, and what wins it (more than half); null without team points. */
  totalPoints: number | null;
  toWin: number | null;
};

/** "3-Ball" → "3 Ball" (how the owner says it); everything else as saved. */
const teamFormatLabel = (team: string) => team.replace(/^(\d)-Ball$/, "$1 Ball");

/**
 * Null when the trip has no competition. `types` = Settings → Competition's Individual / Team choices (null = that part
 * is off); `rounds` = every planned round (day and format); `scoring` = each competition round's points settings.
 */
export function homeCompetitionSummary(input: {
  types: { individual: string | null; team: string | null };
  rounds: { number: number; dayNumber: number; format?: string; course?: string }[];
  scoring?: RoundScoring[];
}): HomeCompetitionSummary | null {
  const { individual, team } = input.types;
  if (!individual && !team) return null;
  const type = individual && team ? "Team & Individual" : team ? "Team" : "Individual";
  const days = new Set(input.rounds.map(round => round.dayNumber)).size;
  const rounds = input.rounds.map(round => ({ number: round.number, format: round.format?.trim() || "Format not set", course: round.course?.trim() || "Course TBD" }));
  const total = team ? (input.scoring ?? []).reduce((sum, round) => sum + (round.pointsAvailable ?? 0), 0) : 0;
  return {
    type, teamFormat: team ? teamFormatLabel(team) : null, individualFormat: individual ?? null, days, rounds,
    totalPoints: total > 0 ? total : null, toWin: total > 0 ? total / 2 + 0.5 : null,
  };
}

/**
 * "Your team" for the Competition card: with 2 Teams, your team's name; with groups (3 Ball, 4 Ball, Pairs), your
 * teammates' last names ("Latto · Weisser"). Null when you're not on a team yet (or the viewer isn't known).
 * `players` = the trip's players in roster order; `groups` = each team's player indexes (Settings → Players → teams).
 */
export function yourTeam(input: { teamFormat: string | null; me: string | null | undefined; players: string[]; groups: number[][] | null; teamNames?: string[] }): string | null {
  const { teamFormat, me, players, groups } = input;
  if (!teamFormat || !me || !groups?.length) return null;
  const normal = (name: string) => name.trim().toLowerCase();
  const myIndex = players.findIndex(name => normal(name) === normal(me));
  if (myIndex < 0) return null;
  const team = groups.findIndex(group => group.includes(myIndex));
  if (team < 0) return null;
  if (teamFormat === "2 Teams") return input.teamNames?.[team]?.trim() || `Team ${team + 1}`;
  const lastName = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;
  const mates = groups[team].filter(index => index !== myIndex && players[index]).map(index => lastName(players[index]));
  return mates.length ? mates.join(" · ") : null;
}

/** A team list from Settings: the submitted teams, or else the organizer's picks (player index → team). */
export function teamGroups(submitted: number[][] | null | undefined, picks: Record<number, number> | undefined): number[][] | null {
  if (submitted?.length) return submitted;
  if (!picks) return null;
  const groups: number[][] = [];
  for (const [player, team] of Object.entries(picks)) (groups[team] ??= []).push(Number(player));
  return groups.length ? groups.map(group => group ?? []) : null;
}
