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
