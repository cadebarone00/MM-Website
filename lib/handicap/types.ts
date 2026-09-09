export interface HandicapHoleInput {
  hole: number;   // 1-18
  score: number;
  putts: number;
  fir: boolean;   // ignored for par-3 holes — server always records 'X' there
  gir: boolean;
}

export interface HandicapCourseTeeSet {
  id: string;
  name: string;
  rating: number;
  slope: number;
  holes: { number: number; par: number; yards: number }[];
}

export interface HandicapCourseOption {
  id: string;
  name: string;
  teeSets: HandicapCourseTeeSet[];
}

export interface HandicapRoundSummary {
  id: string;
  courseName: string;
  teeSetName: string;
  rating: number;
  slope: number;
  datePlayed: string; // ISO date, e.g. "2026-09-07"
  teeTime: string | null;
  totalScore: number;
  differential: number;
}

export interface HandicapSummary {
  index: number | null;
  lowIndex: number | null;
  rounds: HandicapRoundSummary[];
}

export interface ArchivedHandicapRound {
  id: string;
  tournamentSlug: string;
  tournamentLabel: string;
  tournamentDate: string;
  round: number;
  courseName: string;
  format: string | null;
  totalScore: number | null;
  holesPlayed: number;
}

export interface SubmitHandicapRoundInput {
  courseId: string;
  teeSetId: string;
  datePlayed: string; // ISO date
  teeTime: string | null;
  holes: HandicapHoleInput[]; // exactly 18, each hole 1-18 exactly once
}
