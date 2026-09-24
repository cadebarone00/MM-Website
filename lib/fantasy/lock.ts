import { getNextTournamentStatus } from "@/lib/data";

/**
 * Fantasy picks can be created or changed any time before the tournament
 * goes live; once it's live or completed, POST /api/fantasy/team refuses
 * the write (see app/api/fantasy/team/route.ts) and the UI switches to a
 * read-only "Your Team" view. No separate "submitted"/"locked" database
 * column - this is the one rule, reusing the site's existing tournament
 * status check.
 */
export function fantasyPicksLocked(now: Date = new Date()): boolean {
  return getNextTournamentStatus(now) !== "upcoming";
}
