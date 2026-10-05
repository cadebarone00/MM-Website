/** Local UI configuration only; these formats do not implement scoring rules. */
export const COMPETITION_FORMATS = ["Singles", "Best Ball", "Alternate Shot", "Scramble", "Shamble", "Chapman", "Stableford"] as const;
export type CompetitionFormat = (typeof COMPETITION_FORMATS)[number];
export type CompetitionRound = {
  id: string;
  date: string;
  number: number;
  course: string;
  format: CompetitionFormat;
  nassau: boolean;
  handicap: boolean;
  status: "started" | "scheduled";
};
export type CompetitionRoundChange = Partial<Pick<CompetitionRound, "format" | "nassau" | "handicap">>;

/** Fictional dates/statuses are fixed so the preview always includes a locked round. */
export const GOLF_TRIP_COMPETITION_PREVIEW: CompetitionRound[] = [
  { id: "round-1", date: "2027-04-22", number: 1, course: "Desert Pines GC", format: "Singles", nassau: true, handicap: true, status: "started" },
  { id: "round-2", date: "2027-04-23", number: 2, course: "Canyon Ridge (Front)", format: "Best Ball", nassau: false, handicap: true, status: "scheduled" },
  { id: "round-3", date: "2027-04-23", number: 3, course: "Canyon Ridge (Back)", format: "Alternate Shot", nassau: true, handicap: false, status: "scheduled" },
  { id: "round-4", date: "2027-04-24", number: 4, course: "Saguaro Links", format: "Scramble", nassau: false, handicap: false, status: "scheduled" },
];

/** Shared guard for individual and bulk preview updates. */
export function updateCompetitionRounds(rounds: CompetitionRound[], change: CompetitionRoundChange, id?: string): CompetitionRound[] {
  return rounds.map(round => round.status === "started" || (id !== undefined && round.id !== id) ? round : { ...round, ...change });
}

/** Adds a scheduled round at the end of `date`, then renumbers every round 1..n in day order. */
export function addCompetitionRound(rounds: CompetitionRound[], date: string, id: string): CompetitionRound[] {
  const lastOnOrBefore = rounds.reduce((last, round, index) => round.date <= date ? index : last, -1);
  const next: CompetitionRound = { id, date, number: 0, course: "Course TBD", format: "Singles", nassau: false, handicap: false, status: "scheduled" };
  const inserted = [...rounds.slice(0, lastOnOrBefore + 1), next, ...rounds.slice(lastOnOrBefore + 1)];
  return inserted.map((round, index) => ({ ...round, number: index + 1 }));
}

/** Removes a scheduled round, then renumbers every round 1..n. Started rounds are locked and stay. */
export function removeCompetitionRound(rounds: CompetitionRound[], id: string): CompetitionRound[] {
  return rounds.filter(round => round.id !== id || round.status === "started").map((round, index) => ({ ...round, number: index + 1 }));
}
