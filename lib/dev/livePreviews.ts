/**
 * The Maroon Live group in the dev simulator: which sample screen each Conditional shows (components/dev/DevLivePreview).
 * Kept tiny so lib/dev/simulator.ts can check the value without loading the sample data.
 */
export const LIVE_PREVIEWS = [
  "dir-events", "dir-empty", "dir-unavailable",
  "event-trip", "event-tournament", "event-league", "event-missing",
  "watch-organizer-link", "watch-organizer-public", "watch-organizer-private", "watch-player-share", "watch-player-no-share",
] as const;
export type LivePreview = (typeof LIVE_PREVIEWS)[number];
export const isLivePreview = (value: unknown): value is LivePreview => (LIVE_PREVIEWS as readonly unknown[]).includes(value);

/** Where the screen is being looked at: the website on a computer, the website on a phone, or the iPhone / Android app. */
export const LIVE_SURFACES = [["desktop", "Website desktop"], ["mobile", "Website mobile"], ["app", "App"]] as const;
export type LiveSurface = (typeof LIVE_SURFACES)[number][0];
export const isLiveSurface = (value: unknown): value is LiveSurface => LIVE_SURFACES.some(([id]) => id === value);

/** TV mode in the simulator: which event the sample board belongs to (its name and the line under it). */
export const TV_KINDS = [["trip", "Golf trip"], ["tournament", "Tournament"], ["league", "League"]] as const;
export type TvKind = (typeof TV_KINDS)[number][0];
export const isTvKind = (value: unknown): value is TvKind => TV_KINDS.some(([id]) => id === value);

/** TV mode in the simulator: the team structure (same names as the team draft) and how many players tee off together. */
export const TV_TEAMS = [["two", "2 Teams"], ["pairs", "Pairs"], ["3ball", "3-Ball"], ["4ball", "4-Ball"]] as const;
export type TvTeams = (typeof TV_TEAMS)[number][0];
export const isTvTeams = (value: unknown): value is TvTeams => TV_TEAMS.some(([id]) => id === value);
export const TV_GROUPS = [["2", "Groups of 2"], ["3", "Groups of 3"], ["4", "Groups of 4"]] as const;
export type TvGroup = (typeof TV_GROUPS)[number][0];
export const isTvGroup = (value: unknown): value is TvGroup => TV_GROUPS.some(([id]) => id === value);
