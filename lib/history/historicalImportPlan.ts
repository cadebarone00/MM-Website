import { validateHistoricalPackage, type HistoricalPackage, type PackageCheck } from "./historicalPackage";

/**
 * Dry run: what importing a package would create, per participant and per year — computed from the package alone,
 * writing nothing anywhere. (supabase/historical_import.sql's import_historical_package(..., dry_run => true) is the
 * database-side dry run: same import, rolled back.) Participants always start unlinked; nobody is matched to a profile.
 */
export interface ImportPlan {
  check: PackageCheck;
  dataset: string | null;
  editions: { key: string; year: number; rounds: number; individualRounds: number; scores: number; matches: number; winnerTeam: string | null }[];
  participants: { key: string; name: string; years: number[]; scoredRounds: number; linked: false }[];
  flags: { uncertain: number; excluded: number };
}

export function planHistoricalImport(input: unknown): ImportPlan {
  const check = validateHistoricalPackage(input);
  const empty: ImportPlan = { check, dataset: null, editions: [], participants: [], flags: { uncertain: 0, excluded: 0 } };
  if (!check.ok) return empty;
  const pkg = input as HistoricalPackage;
  const years = new Map<string, Set<number>>();
  const scored = new Map<string, number>();
  for (const e of pkg.editions) {
    for (const r of e.roster) (years.get(r.participant) ?? years.set(r.participant, new Set()).get(r.participant)!).add(e.year);
    for (const round of e.rounds) for (const s of round.scores) if (s.total !== null) scored.set(s.participant, (scored.get(s.participant) ?? 0) + 1);
  }
  return {
    check,
    dataset: pkg.dataset.key,
    editions: pkg.editions.map((e) => ({
      key: e.key, year: e.year, rounds: e.rounds.length, individualRounds: e.rounds.filter((r) => r.scoring === "individual").length,
      scores: e.rounds.reduce((n, r) => n + r.scores.length, 0), matches: e.matches.length, winnerTeam: e.results.winnerTeam,
    })),
    participants: pkg.participants.map((p) => ({ key: p.key, name: p.name, years: [...(years.get(p.key) ?? [])].sort(), scoredRounds: scored.get(p.key) ?? 0, linked: false as const })),
    flags: { uncertain: pkg.flags.filter((f) => f.level === "uncertain").length, excluded: pkg.flags.filter((f) => f.level === "excluded").length },
  };
}
