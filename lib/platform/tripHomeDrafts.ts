import { matchDraftTimeError } from "./draftSchedule";
import { homeDraftHasSchedule, homeDraftTeamsReady, homeMatchRounds, homeRoundRobinSides, homeTeamGroupsReady } from "./homeDraft";
import { homeMatchSelection, matchDraftRounds, type MatchDraftPlayer } from "./matchDraft";
import type { MomRound } from "./momNotifications";
import { draftBoard, draftWhenLabel, type TeamDraft } from "./teamDraft";

/**
 * Trip Home → Drafts (project_specs.md Golf Trips part 2c), for a saved trip: what the Team Draft and Match Selection
 * cards say, worked out the same way as the website's TripDraftWidget (components/platform/TripMomentum.tsx) does for
 * a real trip. Plain data: each screen draws it. The rooms themselves are Golf Trips part 2e.
 */

export type DraftCountdown = { when: string | null; target: string | null; scheduled: boolean };
export type HomeTeamDraftCard =
  | { kind: "board"; countdown: DraftCountdown; method: string; order: string }
  | { kind: "status"; text: "Teams complete" | "Set up team selection"; action: "View teams" | "Set up teams" };
export type HomeMatchCard = {
  noRounds: boolean;
  robin: null | { ready: true; sides: { name: string }[]; courses: string[] } | { ready: false; message: "Complete team assignments first." | "Add at least two players first." };
  next: null | { round: number; course: string; format: string; countdown: DraftCountdown; selected: boolean; blocked: string | null };
  status: null | { text: "Match selection complete" | "Complete team assignments first." | "Set up match selection" };
};
export type HomeDrafts = { team: HomeTeamDraftCard | null; match: HomeMatchCard | null; noDrafts: boolean };

/** The saved team draft settings (Settings → Competition), the same way the website's saved trip reads them. */
export function savedTeamDraft(setup: Record<string, unknown>, teamType: string | null): TeamDraft {
  return { teamType, selection: (setup.teamSelection as TeamDraft["selection"]) ?? null, date: String(setup.draftDate ?? ""), time: String(setup.draftTime ?? ""),
    type: setup.draftType === "Straight" ? "Straight" : "Snake", method: setup.draftMethod === "Duck Race" ? "Duck Race" : "Captain's Picks" };
}

export function homeDrafts(input: {
  setup: Record<string, unknown>; competitionTypes: { individual: string | null; team: string | null } | null;
  team: TeamDraft | undefined; players: { name: string; handicap?: number; team?: "A" | "B" }[];
  rounds: MomRound[]; playedThrough: number; teamNames: string[]; now: string | null;
}): HomeDrafts {
  const { setup, competitionTypes: types, team, rounds, playedThrough, now } = input;
  let players: { name: string; handicap?: number; team?: "A" | "B"; id?: string }[] = input.players;
  const assignments = setup.teamPicks as Record<number, number> | undefined;
  const submitted = setup.submittedTeams as number[][] | undefined;
  const matchPlayers: MatchDraftPlayer[] = players.flatMap((player, index) => {
    const picked = submitted ? submitted.findIndex((t) => t.includes(index)) : assignments ? assignments[index] : player.team === "A" ? 0 : player.team === "B" ? 1 : -1;
    return picked === 0 || picked === 1 ? [{ ...player, id: String(index), team: picked === 0 ? "A" as const : "B" as const }] : [];
  });
  players = players.map((p) => ({ ...p }));
  const matchRounds = matchDraftRounds(setup, rounds, players.length, playedThrough);
  const teamsReady = homeDraftTeamsReady(players.length, matchPlayers);
  const board = !teamsReady && team?.teamType && team.selection === "Draft"
    ? draftBoard(team, now) ?? { when: team.date ? draftWhenLabel(team.date, team.time) : null, target: team.date ? `${team.date}T${team.time || "00:00"}` : null } : null;
  const next = homeMatchSelection(matchRounds);
  const blocked = !teamsReady ? "Complete the team draft first." : next && !next.locked ? matchDraftTimeError(team ?? {}, next.date, next.time) : null;
  const names = (setup.teamNames as string[] | undefined) ?? input.teamNames;
  const teamType = types ? types.team : team?.teamType ?? null;
  const groups = submitted ?? (assignments ? Array.from({ length: Math.max(-1, ...Object.values(assignments)) + 1 }, (_, i) => players.flatMap((_, p) => assignments[p] === i ? [p] : []))
    : teamsReady ? (["A", "B"] as const).map((side) => players.flatMap((player, index) => matchPlayers.some((m) => m.team === side && (m.id === String(index) || m.name === player.name)) ? [index] : [])) : null);
  const allTeamsReady = teamType === "2 Teams" ? teamsReady || homeTeamGroupsReady(players.length, groups, teamType) : homeTeamGroupsReady(players.length, groups, teamType);
  const applicable = homeMatchRounds({ ...setup, localCompetitionType: types ?? { individual: null, team: teamType } }, rounds, players.length);
  const robinRounds = applicable.filter((round) => round.method === "Round Robin");
  const sides = homeRoundRobinSides(players, teamType, groups, names);
  // Owner 2026-11-12: once the teams are set, Team Draft goes away and Home's Players becomes Teams.
  const showTeam = !!teamType && !allTeamsReady;
  const configuredChoice = setup.matchPerRound
    ? Object.values((setup.matchSelections as Record<string, { method?: string }>) ?? {}).some((choice) => !!choice.method)
    : !!(setup.allRoundsMatch as { method?: string } | undefined)?.method;
  const showMatch = applicable.length > 0 || !!next || (!rounds.length && (types?.individual === "Match Play" || configuredChoice));
  const countdown = (date: string, time: string, b: { when: string | null; target: string | null }): DraftCountdown => ({ ...b, scheduled: homeDraftHasSchedule(date, time) });

  const teamCard: HomeTeamDraftCard | null = !showTeam ? null : board && team && !allTeamsReady
    ? { kind: "board", countdown: countdown(team.date, team.time, board), method: team.method ?? "Captain's Picks", order: team.type }
    : { kind: "status", text: allTeamsReady ? "Teams complete" : "Set up team selection", action: allTeamsReady ? "View teams" : "Set up teams" };
  const matchCard: HomeMatchCard | null = !showMatch ? null : {
    noRounds: !rounds.length,
    robin: robinRounds.length ? sides.length >= 2 ? { ready: true, sides, courses: robinRounds.map((r) => r.course) } : { ready: false, message: teamType ? "Complete team assignments first." : "Add at least two players first." } : null,
    next: next && teamType === "2 Teams" ? { round: next.number, course: next.course.replace(/\s*·\s*/g, " "), format: next.format, selected: !!next.locked, blocked,
      countdown: countdown(next.date ?? "", next.time ?? "", { when: next.when, target: next.date ? `${next.date}T${next.time || "00:00"}` : null }) } : null,
    status: next && teamType === "2 Teams" ? null : applicable.some((round) => round.method !== "Round Robin")
      ? { text: applicable.every((round) => round.number <= playedThrough || (Array.isArray(setup.completedMatchDrafts) && setup.completedMatchDrafts.includes(round.key))) ? "Match selection complete"
        : teamType && !allTeamsReady ? "Complete team assignments first." : "Set up match selection" } : null,
  };
  return { team: teamCard, match: matchCard, noDrafts: !teamCard && !matchCard };
}
