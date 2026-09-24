import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Shared server helpers for tournament futures (Team Winner, Low Individual). */

export type Service = ReturnType<typeof createSupabaseServiceRoleClient>;

/** Reads every row of a query, 1,000 at a time. */
export async function pages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await query(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return rows;
  }
}

/** The later of two ISO timestamps (either may be missing). */
export const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** The newest match odds or official state change for a season. Every confirmed
 * score publishes one, so a future priced before it is out of date. */
export async function latestMatchInput(service: Service, seasonYear: number): Promise<string | null> {
  const [{ data: odds }, { data: state }] = await Promise.all([
    service.from("live_match_odds_snapshots").select("created_at").eq("season_year", seasonYear).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("live_match_official_state").select("updated_at").eq("season_year", seasonYear).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return later(odds?.created_at ?? null, state?.updated_at ?? null);
}
