/**
 * The Maroon Live, Step 4 (project_specs.md, "Feature: The Maroon Live"): TV mode, a BlueGolf-style scrolling
 * leaderboard for a big screen. The shapes the board draws and the small rules it follows. Pure, no React.
 */

export type TvShow = "individual" | "match" | "both";

/**
 * Where the event is (owner 2026-11-22): before it starts, a round being played, between two rounds, or finished.
 * The top right reads Upcoming / Live (red) / Up next / Final, with `roundLabel` under it.
 */
export const TV_PHASES = ["before", "live", "between", "final"] as const;
export type TvPhase = (typeof TV_PHASES)[number];
export const isTvPhase = (value: unknown): value is TvPhase => (TV_PHASES as readonly unknown[]).includes(value);
export const TV_PHASE_WORD: Record<TvPhase, string> = { before: "Upcoming", live: "Live", between: "Up next", final: "Final" };

/** One golfer on the individual board. `total` / `today`: strokes to par (null = no score yet). */
export interface TvPlayerRow { position: string; name: string; team?: string | null; total: number | null; today: number | null; thru: string;
  /** First player of a new tee-time group (listed by group, before a round): the board draws a thin line above them. */
  groupStart?: boolean }
/**
 * One match on the match play board, drawn like the app's Matches list: names on their sides; in the middle the match
 * number over `middle` ("Thru 12", "F" or the tee time "8:40"). `score`: the match score ("2 UP", "3&2", "AS"; "" before it
 * starts), shown on the leader's half (on both halves when it's "AS"). `leader`: who's up / won (null = all square).
 */
export interface TvMatchRow { number: number; left: string; right: string; middle: string; score: string; leader: "left" | "right" | null;
  /** Pairs / 3-Ball / 4-Ball (more than two teams): each side's own team color and its players, under the team name. */
  leftColor?: string; rightColor?: string; leftPlayers?: string; rightPlayers?: string }

/** The score each half shows: the leader's score on their half, "AS" on both, nothing before the match starts. */
export function tvSideScore(row: TvMatchRow, side: "left" | "right"): string {
  if (!row.score) return "";
  return row.leader === null ? row.score : row.leader === side ? row.score : "";
}
export interface TvTeam { name: string; color: string; points: number }
export interface TvBoardData {
  eventName: string; roundLabel: string; phase: TvPhase;
  /** Under the name, top middle: a trip's location, or the course for a tournament / league; null hides it. */
  place: string | null;
  individual: TvPlayerRow[] | null;
  /** `teamHeader: false`: more than two teams (Pairs / 3-Ball / 4-Ball), so no "Tigers · to win · Rebels" line, just the matches. */
  match: { teams: [TvTeam, TvTeam]; toWin: number | null; matches: TvMatchRow[]; teamHeader?: boolean } | null;
}

/** "E", "-3", "+2", or "–" with no score. */
export function toParText(value: number | null): string {
  if (value == null) return "–";
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

/** Which boards take turns: what the organizer picked, limited to the boards this event actually has. */
export function tvBoards(data: TvBoardData, show: TvShow): ("individual" | "match")[] {
  const has = { individual: Boolean(data.individual?.length), match: Boolean(data.match) };
  const wanted: ("individual" | "match")[] = show === "both" ? ["individual", "match"] : [show];
  const boards = wanted.filter((board) => has[board]);
  return boards.length ? boards : (["individual", "match"] as const).filter((board) => has[board]);
}

export const isTvShow = (value: unknown): value is TvShow => value === "individual" || value === "match" || value === "both";

/** Points shown as golf boards do: 4½, not 4.5. */
export function pointsText(points: number): string {
  const whole = Math.floor(points);
  return points - whole === 0.5 ? `${whole || ""}½` : String(points);
}
