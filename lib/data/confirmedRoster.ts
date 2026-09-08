import type { RosterEntry } from "@/lib/live/types";

/**
 * A team assignment only counts as "confirmed" for the public site once a
 * host has locked it in Tiger Center (`live_roster_assignment_locks`) —
 * being in `live_roster` alone just means a host has drafted it, which can
 * still change.
 */
export function filterLockedRoster(roster: RosterEntry[], lockedPlayerSlugs: string[]): RosterEntry[] {
  const locked = new Set(lockedPlayerSlugs);
  return roster.filter((entry) => locked.has(entry.playerSlug));
}
