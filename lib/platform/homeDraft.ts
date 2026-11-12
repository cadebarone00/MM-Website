import type { MatchDraftPlayer } from "./matchDraft";
import { teamDraftSize } from "./teamDraft";
import { ROUND_FORMATS, defaultRoundComp, type RoundCompSettings } from "./roundCompetition";

export type HomeCompetitionTypes = { individual: string | null; team: string | null };
export type HomeMatchRound = { key: string; number: number; course: string; settings: RoundCompSettings; method: string | null };

export function homeRoundRobinSides(players: { id?: string; name: string }[], teamType: string | null, groups: number[][] | null | undefined, names: string[]) {
  if (!teamType) return players.map((player, index) => ({ id: `side-${index}`, name: player.name }));
  if (!homeTeamGroupsReady(players.length, groups, teamType)) return [];
  return groups!.map((group, index) => ({ id: `side-${index}`, name: names[index]?.trim() || group.map(player => players[player].name).join(" & ") }));
}

/** All assigned sides, including pairs/3-ball/4-ball, must cover the roster exactly once. */
export function homeTeamGroupsReady(count: number, groups: number[][] | null | undefined, teamType: string | null): boolean {
  if (!teamType || !groups || groups.length < 2 || count < 2) return false;
  const members = groups.flat(), size = teamDraftSize(teamType);
  return members.length === count && new Set(members).size === count && members.every(index => Number.isInteger(index) && index >= 0 && index < count)
    && groups.every(group => group.length > 0 && (!size || group.length === size)) && (size !== null || groups.length === 2);
}

/** Applicability is independent of selection method, date, course readiness and completion. */
export function homeMatchRounds(setup: Record<string, unknown>, rounds: { number: number; date: string; course: string; format?: string }[], count: number): HomeMatchRound[] {
  const counts = setup.roundsPerDay as Record<string, number> | undefined;
  const formats = setup.compFormats as Record<string, RoundCompSettings> | undefined;
  const enabled = setup.compRounds as Record<string, boolean> | undefined;
  const choices = setup.matchSelections as Record<string, { method?: string }> | undefined;
  const types = setup.localCompetitionType as HomeCompetitionTypes | undefined;
  const days = [...new Set(rounds.map(round => round.date))];
  return rounds.flatMap((round, index) => {
    let day = 0, slot = index;
    if (counts) { while (day < 64 && slot >= (counts[day] ?? 1)) { slot -= counts[day] ?? 1; day++; } }
    else { day = days.indexOf(round.date); slot = rounds.slice(0, index).filter(item => item.date === round.date).length; }
    const key = `${day}-${slot}`, choice = setup.matchPerRound ? choices?.[key] : setup.allRoundsMatch as { method?: string } | undefined;
    const name = round.format === "Best Ball" ? "Fourball" : round.format;
    const format = ROUND_FORMATS.find(item => item.name === name)?.name;
    const scoreOnly = format === "Stroke Play" || format === "Stableford" || !!types && !types.team && types.individual !== "Match Play" && !choice?.method;
    const settings = formats?.[key] ?? (format ? { ...defaultRoundComp(count), format, matchType: scoreOnly ? "Stroke Play" as const : "Match Play" as const } : types?.team || types?.individual === "Match Play" || choice?.method ? defaultRoundComp(count) : null);
    return enabled?.[key] === false || settings?.matchType !== "Match Play" ? [] : [{ key, number: round.number, course: round.course, settings, method: choice?.method ?? null }];
  });
}

/** A match draft needs the entire loaded roster assigned, uniquely, across both teams. */
export function homeDraftTeamsReady(playerCount: number, players: MatchDraftPlayer[]): boolean {
  return playerCount > 1 && players.length === playerCount
    && new Set(players.map(player => player.id ?? player.name)).size === playerCount
    && players.some(player => player.team === "A") && players.some(player => player.team === "B");
}

/** Both fields are needed before Home treats a draft as scheduled. */
export function homeDraftHasSchedule(date: string, time: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}
