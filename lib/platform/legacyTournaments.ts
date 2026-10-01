import { maroonLegacyAdapter } from "./maroonAdapterServer.ts";
import type { PastTournament } from "./pastTournaments.ts";
import type { TournamentHome } from "./tournamentHome.ts";

/**
 * Server-only compatibility boundary for tournaments that still run on a
 * legacy system (docs/maroon-legacy-migration-inventory.md). Shared platform
 * code never checks a tournament's slug or knows which tournaments are
 * legacy: it asks this file whether an adapter applies and, if so, lets the
 * adapter answer. Each adapter reads its legacy source read-only.
 */
export interface LegacyTournamentAdapter {
  /** tournaments.slug the adapter serves. */
  slug: string;
  /** The /play home for this viewer, or null for not found / not allowed (callers treat both as not found). */
  loadHome(year: string, viewerId: string): Promise<TournamentHome | null>;
  /** My Tournaments rows for this viewer, read live from the legacy source. Throws on a read error. */
  loadPlayingRows(viewerId: string): Promise<PastTournament[]>;
}

const ADAPTERS: readonly LegacyTournamentAdapter[] = [maroonLegacyAdapter];

/** The adapter serving this tournament, or null for an ordinary platform tournament. */
export function legacyAdapterFor(slug: string): LegacyTournamentAdapter | null {
  return ADAPTERS.find((adapter) => adapter.slug === slug) ?? null;
}

/** Every legacy tournament's My Tournaments rows for this viewer. */
export async function loadLegacyPlayingRows(viewerId: string): Promise<PastTournament[]> {
  return (await Promise.all(ADAPTERS.map((adapter) => adapter.loadPlayingRows(viewerId)))).flat();
}

/**
 * Drops database list rows for tournaments an adapter serves: their platform
 * copies can be stale, so loadLegacyPlayingRows supplies those rows instead.
 */
export function withoutLegacyRows(raw: unknown): unknown[] {
  return (Array.isArray(raw) ? raw : []).filter((row) => {
    const slug = (row as Record<string, unknown> | null)?.slug;
    return !(typeof slug === "string" && legacyAdapterFor(slug));
  });
}
