export type TournamentStatus = "draft" | "scheduled" | "live" | "final" | "archived";
export type PlayStatus = "waiting" | "scheduled" | "live" | "final";
export interface Branding {
  name: string; shortName: string; primary: string; secondary: string; accent: string;
  logo?: string; heroImage?: string;
}
export interface Team { id: string; name: string; color: string; logo?: string; points: number }
export interface Player {
  id: string; name: string; teamId?: string; photo?: string; captain?: boolean;
  handicap?: { public: boolean; value: number };
}
export interface Standing { playerId: string; position: number; score: string; status: PlayStatus; progress?: string }
export interface Match {
  id: string; sideA: { teamId?: string; players: string[] }; sideB: { teamId?: string; players: string[] };
  format: string; teeTime: string; status: PlayStatus; progress?: string; result?: string;
}
export interface Course { id: string; name: string; location: string; tee: string; par: number; yardage: number; image?: string }
export interface Session { id: string; label: string; courseId: string; format: string; teeTime: string; status: PlayStatus }
export interface ScheduleDay { date: string; label: string; sessions: Session[] }
export interface TournamentSiteData {
  branding: Branding; status: TournamentStatus; competition: "teams" | "individual";
  dates: string; destination: string; timezone: string; description: string;
  teams: Team[]; players: Player[]; standings: Standing[]; matches: Match[];
  days: ScheduleDay[]; courses: Course[]; information: { label: string; value: string }[];
  results?: { headline: string; detail: string };
}
export const SITE_PAGES = ["home", "leaderboard", "matches", "schedule", "players", "teams", "courses", "results"] as const;
export type SitePage = (typeof SITE_PAGES)[number];
export type SiteLinks = Record<SitePage, string>;
