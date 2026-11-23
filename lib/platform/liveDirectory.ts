import { tapInPath } from "./tapIn.ts";

/**
 * The Maroon Live, Steps 2–3 (supabase/maroon_live_directory.sql, maroon_live_leagues.sql): the public directory at
 * /tap-in. Public trips, tournaments and leagues, golf details only, each opening its live page.
 */

export interface LiveEvent {
  kind: "trip" | "tournament" | "league"; name: string; href: string; firstDate: string | null; lastDate: string | null; ended: boolean;
  course: string | null; playerCount: number;
  /** A trip's location (its destination, e.g. "Pinehurst, NC"); null for tournaments and leagues. */
  place: string | null;
}
export type LiveSection = "Live" | "Upcoming" | "Past";
export const LIVE_SECTIONS: readonly LiveSection[] = ["Live", "Upcoming", "Past"];

/** Rows from list_public_live_events, keeping only well-formed ones with a working share link. */
export function liveEventsFrom(rows: unknown): LiveEvent[] {
  if (!Array.isArray(rows)) return [];
  const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  return rows.flatMap((row) => {
    const r = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const href = typeof r.code === "string" ? tapInPath(r.code) : null;
    if ((r.kind !== "trip" && r.kind !== "tournament" && r.kind !== "league") || typeof r.name !== "string" || !href) return [];
    return [{ kind: r.kind, name: r.name, href, firstDate: date(r.firstDate), lastDate: date(r.lastDate), ended: r.ended === true,
      course: typeof r.course === "string" && r.course.trim() ? r.course.trim() : null, playerCount: Number(r.playerCount) || 0,
      place: r.kind === "trip" && typeof r.place === "string" && r.place.trim() ? r.place.trim() : null }];
  });
}

/** Past once it's ended or its last day is gone; Upcoming before its first day (or with no dates yet); else Live. */
export function liveSection(event: LiveEvent, today: string): LiveSection {
  if (event.ended || (event.lastDate && event.lastDate < today)) return "Past";
  if (!event.firstDate || event.firstDate > today) return "Upcoming";
  return "Live";
}

/** The line under the name (owner 2026-11-22): a trip's location; a league's or tournament's golf course. Empty when unknown. */
export function liveEventDetail(event: LiveEvent): string {
  return (event.kind === "trip" ? event.place ?? event.course : event.course) ?? "";
}
