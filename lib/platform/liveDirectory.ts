import { tapInPath } from "./tapIn.ts";

/**
 * The Maroon Live, Step 2 (supabase/maroon_live_directory.sql): the public directory at /tap-in. Public trips and
 * tournaments, golf details only, each opening its live page.
 */

export interface LiveEvent {
  kind: "trip" | "tournament"; name: string; href: string; firstDate: string | null; lastDate: string | null; ended: boolean;
  course: string | null; playerCount: number;
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
    if ((r.kind !== "trip" && r.kind !== "tournament") || typeof r.name !== "string" || !href) return [];
    return [{ kind: r.kind, name: r.name, href, firstDate: date(r.firstDate), lastDate: date(r.lastDate), ended: r.ended === true,
      course: typeof r.course === "string" && r.course.trim() ? r.course.trim() : null, playerCount: Number(r.playerCount) || 0 }];
  });
}

/** Past once it's ended or its last day is gone; Upcoming before its first day (or with no dates yet); else Live. */
export function liveSection(event: LiveEvent, today: string): LiveSection {
  if (event.ended || (event.lastDate && event.lastDate < today)) return "Past";
  if (!event.firstDate || event.firstDate > today) return "Upcoming";
  return "Live";
}

/** One line under the name: dates · course · players. */
export function liveEventDetail(event: LiveEvent): string {
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dates = event.firstDate ? (event.lastDate && event.lastDate !== event.firstDate ? `${day(event.firstDate)} – ${day(event.lastDate)}` : day(event.firstDate)) : null;
  return [event.kind === "trip" ? "Golf trip" : "Tournament", dates, event.course, `${event.playerCount} ${event.playerCount === 1 ? "player" : "players"}`].filter(Boolean).join(" · ");
}
