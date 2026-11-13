import "server-only";
import { loadTournamentHome, type TournamentHome } from "./tournamentHomeServer";
import { latestPublicYear, loadPublicTournament, loadTournamentPreview } from "./publicSiteServer";
import { getNextEditionDraft, loadSetup, resolveManagedEdition } from "./dashboardServer";
import { readinessFor } from "./dashboardApi";

/**
 * The tournament screens' data — Play (the logged-in league home), the public site (/t/…), the organizer's preview and
 * the tournament studio (setup, start next year) — shared by the website's pages and the iPhone / Android app's data
 * route (/api/app/tournament), so both show the same thing. Plain data only (JSON for the app).
 */
export const loadPlayTournament = (slug: string, year: string): Promise<TournamentHome> => loadTournamentHome(slug, year);
export const loadPublicSite = (slug: string, year: string) => loadPublicTournament(slug, year);
export const loadSitePreview = (slug: string, year: string) => loadTournamentPreview(slug, year);
export const loadLatestPublicYear = (slug: string) => latestPublicYear(slug);

/** The studio dashboard for a tournament's edition (organizers only; null for anyone else, like a 404). */
export async function loadStudio(slug: string, year: string) {
  const edition = await resolveManagedEdition(slug, year);
  if (!edition) return null;
  const result = await loadSetup(edition);
  if (!result.ok) return null;
  return { setup: result.value, readiness: readinessFor(result.value) };
}

/** Start next year (organizers only; null for anyone else). `draft` null = not switched on / the Maroon Tournament. */
export async function loadNextYear(slug: string, year: string) {
  const edition = await resolveManagedEdition(slug, year);
  if (!edition) return null;
  const [setupResult, draft] = await Promise.all([loadSetup(edition), getNextEditionDraft(edition)]);
  if (!setupResult.ok) return null;
  return { setup: setupResult.value, draft };
}

export type StudioData = NonNullable<Awaited<ReturnType<typeof loadStudio>>>;
export type NextYearData = NonNullable<Awaited<ReturnType<typeof loadNextYear>>>;
