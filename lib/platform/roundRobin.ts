export type RoundRobinSide = { id: string; name: string };
export type RoundRobinMatch = { id: string; home: string; away: string };
export type RoundRobinRotation = { matches: RoundRobinMatch[]; bye: string | null };
export type RoundRobinOutcome = "home" | "away" | "tie";
export type RoundRobinResults = { roster: string; outcomes: Record<string, RoundRobinOutcome> };

/** One leg: every side meets every other once, with no side playing twice in a rotation. */
export function roundRobinSchedule(ids: string[]): RoundRobinRotation[] {
  if (ids.length < 2 || ids.length > 64 || new Set(ids).size !== ids.length) return [];
  const ring: (string | null)[] = [...ids];
  if (ring.length % 2) ring.push(null);
  const rotations: RoundRobinRotation[] = [];
  for (let turn = 0; turn < ring.length - 1; turn++) {
    const matches: RoundRobinMatch[] = [];
    let bye: string | null = null;
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i], b = ring[ring.length - 1 - i];
      if (a === null || b === null) { bye = a ?? b; continue; }
      const [home, away] = turn % 2 ? [b, a] : [a, b];
      matches.push({ id: JSON.stringify([a, b].sort()), home, away });
    }
    rotations.push({ matches, bye });
    ring.splice(1, 0, ring.pop()!);
  }
  return rotations;
}

/** Byes/unplayed matches earn nothing. Equal percentages share rank; names only order their display. */
export function roundRobinStandings(sides: RoundRobinSide[], schedule: RoundRobinRotation[], outcomes: Record<string, RoundRobinOutcome>) {
  const rows = new Map(sides.map(side => [side.id, { ...side, played: 0, wins: 0, losses: 0, ties: 0, percentage: 0, rank: 0 }]));
  for (const match of schedule.flatMap(rotation => rotation.matches)) {
    const home = rows.get(match.home), away = rows.get(match.away), result = outcomes[match.id];
    if (!home || !away || !["home", "away", "tie"].includes(result)) continue;
    home.played++; away.played++;
    if (result === "tie") { home.ties++; away.ties++; }
    else { const winner = result === "home" ? home : away, loser = result === "home" ? away : home; winner.wins++; loser.losses++; }
  }
  const sorted = [...rows.values()].map(row => ({ ...row, percentage: row.played ? (row.wins + row.ties / 2) / row.played : 0 }))
    .sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  sorted.forEach((row, i) => { row.rank = i && row.percentage === sorted[i - 1].percentage ? sorted[i - 1].rank : i + 1; });
  return sorted;
}

export function validRoundRobinResults(value: unknown): value is RoundRobinResults {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every(key => ["roster", "outcomes"].includes(key)) && typeof v.roster === "string" && v.roster.length <= 16000
    && !!v.outcomes && typeof v.outcomes === "object" && !Array.isArray(v.outcomes) && Object.keys(v.outcomes).length <= 2016
    && Object.entries(v.outcomes).every(([key, result]) => key.length <= 300 && ["home", "away", "tie"].includes(String(result)));
}
