import { assessReadiness, type Readiness } from "./readiness.ts";
import type { TournamentSetup } from "./setup.ts";

/**
 * Decisions the dashboard routes make, kept pure so they're testable.
 * The one readiness engine is the only judge of publish/play.
 */

/** Commercial tournaments can't use live scoring until C4; only the legacy (Maroon) tournament runs on it. */
export function readinessFor(setup: TournamentSetup): Readiness {
  return assessReadiness(setup, { liveScoringAvailable: setup.tournament.isLegacy });
}

export type Decision = { ok: true } | { ok: false; status: number; error: string; missing?: string[] };

/** Publishing is refused on the server unless the readiness engine says the setup is ready. Unpublishing is always allowed. */
export function publishDecision(setup: TournamentSetup, publish: boolean): Decision {
  if (!publish) return { ok: true };
  const readiness = readinessFor(setup);
  if (readiness.published) return { ok: true };
  return readiness.publishReady
    ? { ok: true }
    : { ok: false, status: 409, error: "Finish the required setup before publishing.", missing: readiness.publishMissing };
}

/**
 * Maps a dashboard database error to what the organizer sees. "Not
 * allowed" is reported as 404 so a private tournament's existence is never
 * confirmed to someone who can't manage it.
 */
export function dashboardFailure(error: { code?: string; message?: string }): { status: number; error: string } {
  if (error.code === "42501" && /Admin Center/.test(error.message ?? "")) return { status: 403, error: "The Maroon Tournament is managed in the Admin Center." };
  if (error.code === "42501" && /Hosted media/.test(error.message ?? "")) return { status: 403, error: "Hosted uploads aren't included for this tournament." };
  if (error.code === "42501") return { status: 404, error: "Not found." };
  if (error.code === "22023" || error.code === "23503" || error.code === "23514" || error.code === "22P02") {
    return { status: 400, error: error.code === "22023" && error.message ? error.message : "Some of these details aren't valid. Reload and try again." };
  }
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "PGRST205") {
    return { status: 503, error: "Saving tournaments isn't switched on yet." };
  }
  return { status: 500, error: "Could not save. Try again." };
}
