/**
 * Which way a fairway or green shot missed. Null on the hit/miss field
 * itself means "hit" or "not recorded". "penalty" (missed green due to a
 * penalty stroke / lost ball, not a directional miss) is GIR-only — the UI
 * never offers it for Fairway.
 */
export type ShotDirection = "left" | "right" | "short" | "long" | "penalty";

export interface HandicapHoleInput {
  hole: number;   // 1-18
  score: number;
  putts: number;
  fir: boolean;   // ignored for par-3 holes — server always records 'X' there
  gir: boolean;
  firDirection: ShotDirection | null; // set only when fir is false
  girDirection: ShotDirection | null; // set only when gir is false
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
  city: string | null;
  state: string | null; // two-letter code, e.g. "TX"
  teeSets: HandicapCourseTeeSet[];
}

export interface HandicapRoundSummary {
  id: string;
  courseId: string;
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
  maroonMastersIndex?: number | null;
  index: number | null;
  lowIndex: number | null;
  rounds: HandicapRoundSummary[];
}

export interface ArchivedHandicapRound {
  datePlayed?: string | null;
  teeSetup?: ArchivedTeeSetup | null;
  live?: boolean;
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

export interface ArchivedTeeSetup {
  courseId: string;
  teeSetId: string;
  teeSetName: string;
  rating: number | null;
  slope: number | null;
  holes: { number: number; par: number; yards: number }[];
  holeTeeSetIds?: Record<string, string>;
}

export interface SubmitHandicapRoundInput {
  courseId: string;
  teeSetId: string;
  datePlayed: string; // ISO date
  teeTime: string | null;
  holes: HandicapHoleInput[]; // exactly 18, each hole 1-18 exactly once
}

/** Body of the Tiger-only "assign tees to an archived round" bulk action — applies to every player's archived row for one tournament + round at once. */
export interface AssignArchiveTeesInput {
  tournamentSlug: string;
  round: number;
  courseId: string;
  teeSetId: string;
  datePlayed: string; // ISO date
}
