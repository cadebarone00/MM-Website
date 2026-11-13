export type HomeRosterPlayer = { name: string; avatarUrl?: string | null; username?: string | null };
export type HomeRosterTeam = { name: string; players: HomeRosterPlayer[] };

export function sortHomeRoster<T extends HomeRosterPlayer>(players: T[]): T[] {
  const first = (name: string) => name.trim().split(/\s+/)[0];
  return [...players].sort((a, b) => first(a.name).localeCompare(first(b.name), "en", { sensitivity: "base" })
    || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** Only replace Players once both teams uniquely cover the entire loaded roster. */
export function homeTeamRoster(input: {
  teamCompetition: boolean; players: HomeRosterPlayer[]; assignmentNames: string[];
  groups: number[][] | null; teamNames?: string[];
}): HomeRosterTeam[] | null {
  const { players, assignmentNames, groups } = input;
  // Any number of teams (2 Teams, Pairs, 3-Ball, 4-Ball), as long as every player is on exactly one.
  if (!input.teamCompetition || !players.length || !groups || groups.length < 2 || groups.some(group => !group.length)) return null;
  const indexes = groups.flat();
  if (indexes.length !== assignmentNames.length || new Set(indexes).size !== assignmentNames.length
    || indexes.some(index => !Number.isInteger(index) || index < 0 || index >= assignmentNames.length)) return null;
  const normalized = (name: string) => name.trim().toLowerCase();
  const byName = new Map(players.map(player => [normalized(player.name), player]));
  if (byName.size !== players.length || players.length !== assignmentNames.length
    || new Set(assignmentNames.map(normalized)).size !== assignmentNames.length
    || assignmentNames.some(name => !byName.has(normalized(name)))) return null;
  return groups.map((group, index) => ({
    name: input.teamNames?.[index]?.trim() || `Team ${index + 1}`,
    players: sortHomeRoster(group.map(player => byName.get(normalized(assignmentNames[player]))!)),
  }));
}
