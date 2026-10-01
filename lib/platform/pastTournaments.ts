import { publicBasePath } from "./publicSite.ts";
import { playPath } from "./tournamentHome.ts";

/**
 * Join Tournament page (/tournaments/join): the "paste a link" check and the
 * Past Tournaments list built from list_my_past_editions
 * (supabase/platform_past_editions.sql).
 */
export interface PastTournament {
  name: string;
  year: number;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Where tapping the row goes. */
  href: string;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Turns a pasted tournament link into the path to open, or null if it isn't
 * one. Accepts full links to this site (`https://<site>/t/texas-cup/2027`) or
 * just the path (`/t/texas-cup/2027`). Links to any other site are refused.
 */
export function tournamentPathFromLink(input: string, siteOrigin: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text, siteOrigin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(siteOrigin).origin) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "t") return null;
  const slug = parts[1].toLowerCase();
  if (!SLUG.test(slug) || !/^\d{4}$/.test(parts[2])) return null;
  return publicBasePath(slug, Number(parts[2]));
}

/** The rows the page shows, newest first (the database already sorts them). */
export function summarizePastEditions(raw: unknown): PastTournament[] {
  // Legacy tournaments' rows are supplied by their adapters (legacyTournaments.ts), never from here.
  return summarizeEditions(raw, (slug, year) => publicBasePath(slug, year));
}

/**
 * My Tournaments (/tournaments/mine), from list_my_active_editions: each row
 * enters that year's Tournament Home.
 */
export function summarizeMyTournaments(raw: unknown): PastTournament[] {
  return summarizeEditions(raw, (slug, year) => playPath(slug, year));
}

function summarizeEditions(raw: unknown, hrefFor: (slug: string, year: number, isLegacy: boolean) => string): PastTournament[] {
  const rows = Array.isArray(raw) ? raw : [];
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  const out: PastTournament[] = [];
  for (const row of rows) {
    const record = (row ?? {}) as Record<string, unknown>;
    const slug = text(record.slug);
    const name = text(record.name);
    const year = record.year;
    if (!slug || !name || typeof year !== "number" || !Number.isInteger(year)) continue;
    out.push({
      name, year, destination: text(record.destination), startDate: text(record.startDate), endDate: text(record.endDate),
      href: hrefFor(slug, year, record.isLegacy === true),
    });
  }
  return out;
}
