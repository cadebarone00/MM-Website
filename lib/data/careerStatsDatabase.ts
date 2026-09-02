import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CareerHoleRecord, CareerPartnership } from "./careerStats";

type HoleRow = { year: number; player: string; round: number; course: string; format: string | null; hole: number; par: number; yards: number; score: number };

async function loadAll<T>(table: string): Promise<{ rows: T[]; ready: boolean }> {
  const service = createSupabaseServiceRoleClient();
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from(table).select("*").range(from, from + 999);
    if (error) return { rows: [], ready: false };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return { rows, ready: true };
  }
}

export async function getCareerStatsDatabase() {
  const [holes, partnerships] = await Promise.all([
    loadAll<HoleRow>("career_stat_holes"),
    loadAll<{ player: string; partner: string; year: number; format: string | null; result: "win" | "loss" | "halve" }>("career_stat_partnerships"),
  ]);
  return {
    records: holes.rows.map((row): CareerHoleRecord => ({ year: row.year, player: row.player, round: row.round, course: row.course, format: row.format ?? "Unspecified", hole: row.hole, par: row.par, yards: row.yards, score: row.score })),
    partnerships: partnerships.rows.map((row): CareerPartnership => ({ player: row.player, partner: row.partner, year: row.year, format: row.format ?? "Unspecified", result: row.result })),
    databaseReady: holes.ready && partnerships.ready,
  };
}
