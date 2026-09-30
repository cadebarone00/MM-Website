/**
 * Which tournament (and which year of it) a piece of code is working on
 * (THE_MAROON_PRODUCT_SPEC.md §16, step C3).
 *
 * Every query against a live table goes through editionFilter/
 * editionColumns so the switch from year-keyed to edition-keyed rows (C4)
 * happens here, in one place. Until C4, the live tables can only hold The
 * Maroon Tournament's rows, so these helpers refuse any other tournament
 * rather than quietly reading or writing The Maroon's data.
 *
 * Safe for Client Components: no server imports.
 */

/** Slug of the founding tournament (tournaments.slug in platform_foundation.sql). */
export const MAROON_TOURNAMENT_SLUG = "the-maroon-tournament";

export interface TournamentScope {
  readonly tournamentSlug: string;
}

export interface EditionScope extends TournamentScope {
  readonly seasonYear: number;
}

export class EditionNotLiveError extends Error {
  constructor(tournamentSlug: string) {
    super(`Live scoring isn't available for "${tournamentSlug}" yet.`);
    this.name = "EditionNotLiveError";
  }
}

export function maroonTournament(): TournamentScope {
  return { tournamentSlug: MAROON_TOURNAMENT_SLUG };
}

export function maroonEdition(seasonYear: number): EditionScope {
  if (!Number.isInteger(seasonYear)) throw new TypeError(`Invalid season year: ${seasonYear}`);
  return { tournamentSlug: MAROON_TOURNAMENT_SLUG, seasonYear };
}

export function isMaroon(scope: TournamentScope): boolean {
  return scope.tournamentSlug === MAROON_TOURNAMENT_SLUG;
}

/** Throws unless the live tables can hold this tournament's rows (only The Maroon until C4). */
export function assertLiveTablesReady(scope: TournamentScope): void {
  if (!isMaroon(scope)) throw new EditionNotLiveError(scope.tournamentSlug);
}

/** Filter for one edition's rows: `.match(editionFilter(scope))`. */
export function editionFilter(scope: EditionScope): { season_year: number } {
  assertLiveTablesReady(scope);
  return { season_year: scope.seasonYear };
}

/** Columns that tie a new row to its edition: `.insert({ ...editionColumns(scope), ... })`. */
export function editionColumns(scope: EditionScope): { season_year: number } {
  assertLiveTablesReady(scope);
  return { season_year: scope.seasonYear };
}

/** Supabase Realtime `filter` for one edition's changes. */
export function editionRealtimeFilter(scope: EditionScope): string {
  assertLiveTablesReady(scope);
  return `season_year=eq.${scope.seasonYear}`;
}

/** The year argument for existing year-keyed SQL functions (`p_year`); C4 replaces these with an edition argument. */
export function editionYearParam(scope: EditionScope): number {
  assertLiveTablesReady(scope);
  return scope.seasonYear;
}

/** The same tournament, a different year. */
export function withYear(scope: TournamentScope, seasonYear: number): EditionScope {
  if (!Number.isInteger(seasonYear)) throw new TypeError(`Invalid season year: ${seasonYear}`);
  return { tournamentSlug: scope.tournamentSlug, seasonYear };
}
