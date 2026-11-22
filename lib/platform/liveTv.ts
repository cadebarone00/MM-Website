/**
 * The Maroon Live, Step 4 (project_specs.md, "Feature: The Maroon Live"): TV mode, a BlueGolf-style scrolling
 * leaderboard for a big screen. The shapes the board draws and the small rules it follows. Pure, no React.
 */

export type TvShow = "individual" | "match" | "both";

/** One golfer on the individual board. `total` / `today`: strokes to par (null = no score yet). */
export interface TvPlayerRow { position: string; name: string; team?: string | null; total: number | null; today: number | null; thru: string }
/** One match on the match play board. `leader`: which side is up (null = all square or not started). */
export interface TvMatchRow { label: string; left: string; right: string; status: string; leader: "left" | "right" | null; final: boolean }
export interface TvTeam { name: string; color: string; points: number }
export interface TvBoardData {
  eventName: string; roundLabel: string;
  individual: TvPlayerRow[] | null;
  match: { teams: [TvTeam, TvTeam]; toWin: number | null; matches: TvMatchRow[] } | null;
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
