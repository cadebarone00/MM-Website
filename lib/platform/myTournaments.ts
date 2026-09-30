import { readinessFor } from "./dashboardApi.ts";
import type { Stage } from "./readiness.ts";
import { parseSetup } from "./setup.ts";

/**
 * My Tournaments (/tournaments): the organizer-facing summary of every
 * tournament edition the signed-in user owns or organizes. Built from
 * list_managed_editions (supabase/platform_dashboard.sql), judged by the one
 * readiness engine, and reduced to only what the page shows — no players,
 * emails, ids, plan internals or live-scoring data leave this function.
 */
export type ManagerRole = "owner" | "organizer";

export interface EditionSummary {
  year: number;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  published: boolean;
  stage: Stage;
  percent: number;
  updatedAt: string | null;
}

export interface TournamentSummary {
  name: string;
  slug: string;
  visibility: "public" | "unlisted" | "private";
  role: ManagerRole;
  /** Newest year first. */
  editions: EditionSummary[];
}

/** Groups editions under their tournament; the most recently updated tournament comes first. */
export function summarizeManagedEditions(raw: unknown): TournamentSummary[] {
  const rows = Array.isArray(raw) ? raw : [];
  const bySlug = new Map<string, TournamentSummary>();
  for (const row of rows) {
    const record = (row ?? {}) as Record<string, unknown>;
    const role: ManagerRole | null = record.role === "owner" || record.role === "organizer" ? record.role : null;
    if (!role) continue;
    const setup = parseSetup(record.setup);
    if (!setup.tournament.slug || !Number.isInteger(setup.edition.seasonYear) || setup.tournament.isLegacy) continue;
    const readiness = readinessFor(setup);
    const tournament = bySlug.get(setup.tournament.slug) ?? { name: setup.tournament.name, slug: setup.tournament.slug, visibility: setup.tournament.visibility, role, editions: [] };
    tournament.editions.push({
      year: setup.edition.seasonYear, destination: setup.edition.destination, startDate: setup.edition.startDate, endDate: setup.edition.endDate, timezone: setup.edition.timezone,
      published: readiness.published, stage: readiness.stage, percent: readiness.percent,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    });
    bySlug.set(tournament.slug, tournament);
  }
  const latest = (t: TournamentSummary) => t.editions.reduce((most, e) => (e.updatedAt && e.updatedAt > most ? e.updatedAt : most), "");
  for (const tournament of bySlug.values()) tournament.editions.sort((a, b) => b.year - a.year);
  return [...bySlug.values()].sort((a, b) => latest(b).localeCompare(latest(a)) || a.name.localeCompare(b.name));
}
