export type Team = "maroon" | "white";

export interface PlayerProfile {
  id: string;
  slug: string;
  fullName: string;
  avatarSrc: string | null;
  bio: string;
  history: string[];
  instagram?: string;
  linkedin?: string;
  nickname?: string;
  classYear?: string;
  major?: string;
  occupation?: string;
  hometown?: string;
  birthplace?: string;
  residence?: string;
  playsFrom?: string;
  status?: string;
  clubGolfYears?: string;
  college?: string;
  height?: string;
  weight?: string;
  age?: string;
  birthday?: string;
  handicap?: string;
  rankingNotes?: string;
  debut?: string;
  debutLocation?: string;
  strengths?: string;
  careerHighlights?: string;
  personal?: string;
  hobbies?: string;
  goals?: string;
  misc?: string;
}

export interface RealMatch {
  id: string;
  day: number;
  session: "Morning" | "Afternoon";
  format: string;
  maroonPlayers: string[];
  whitePlayers: string[];
  maroonPts: number;
  whitePts: number;
  status?: "scheduled" | "live" | "final";
  thru?: number;
  leader?: Team | "tie";
  margin?: number;
  holesRemaining?: number;
  teeTimeCst?: string;
  /** Latest saved fair-odds snapshot. Present for live-season matches only. */
  maroonWinProbability?: number;
  tieProbability?: number;
  whiteWinProbability?: number;
}

export interface IndividualStanding {
  player: string;
  team: Team;
  toPar: number;
}

export interface Tournament {
  slug: string;
  editionLabel: string;
  year: number;
  venue: string;
  location: string;
  dateLabel: string;
  startDate: string;
  endDate: string;
  roster: { maroon: string[]; white: string[] };
  maroonPts: number;
  whitePts: number;
  pointsAvailable: number;
  pointsToWin: number;
  matches: RealMatch[];
  /**
   * Extra matchups the Round & Format Archive shows alongside `matches`
   * that must never reach a public page — e.g. 2024's Round 7 Luke/Collin
   * slot, where Luke couldn't play, no points were awarded, and it was
   * never a real match (confirmed with Cade, 2026-09-15). Every public
   * component (leaderboard, team boards, wagers) reads only `matches`;
   * only `roundFormatArchive` reads this one too.
   */
  archiveOnlyMatches?: RealMatch[];
  /** Calendar date for each trip day (day number -> "YYYY-MM-DD"), hand-entered separately from `matches` — used by the Round & Format Archive's day selector. Missing days show without a date rather than guessing one. */
  dayDates?: Record<number, string>;
  individualLeaderboard: IndividualStanding[];
  scorecards?: PlayerScorecard[];
  notes?: string;
  individualChampion?: string;
  individualChampionPhoto?: string | null;
}

export interface HoleStat {
  hole: number;
  par: number;
  yards: number;
  score: number;
  putts: number;
  fir: number | "X";
  gir: number;
  diff: number;
}

export interface RoundScorecard {
  round: number;
  course: string;
  format?: string;
  total: number;
  toPar: number;
  putts: number;
  girHit: number;
  girTotal: number;
  firHit: number;
  firTotal: number;
  holes: HoleStat[];
}

export interface PlayerScorecard {
  player: string;
  team: Team;
  rounds: RoundScorecard[];
}

export interface CourseHole {
  hole: number;
  par: number | null;
  yards: number | null;
}

export interface VenueCourse {
  id: string;
  name: string;
  par: number | null;
  yards: number | null;
  photos: string[];
  holes: CourseHole[];
}

export interface VenueSession {
  session: number;
  courseId: string | null;
  format: string | null;
}

export interface VenueSchedule {
  year: number;
  venueName?: string;
  courses: VenueCourse[];
  sessions: VenueSession[];
}

export interface UpcomingTournament {
  slug: string;
  editionLabel: string;
  year: number;
  venue: string;
  location: string;
  dateLabel: string;
  startDate: string;
  endDate: string;
  liveAt: string;
  roster?: { maroon: string[]; white: string[] };
  notes?: string;
}

export interface NextTournamentOverride {
  venue: string;
  dateLabel: string;
}
