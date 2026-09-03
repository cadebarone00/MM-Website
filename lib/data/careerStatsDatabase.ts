import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CareerHoleRecord, CareerPartnership } from "./careerStats";

type HoleRow = { year: number; player: string; round: number; round_holes: number | null; course: string; format: string | null; hole: number; par: number; yards: number; score: number; putts: number | null; fairway_in_regulation: boolean | null; green_in_regulation: boolean | null; penalties: number | null };

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
  const [holes, participants] = await Promise.all([
    loadAll<HoleRow>("career_stat_holes"),
    loadAll<{ player: string; partner: string | null; year: number; format: string | null; team_id: string | null; winning_side: string | null }>("career_match_participants"),
  ]);
  return {
    records: holes.rows.filter((row) => (row.round_holes ?? 18) === 18).map((row): CareerHoleRecord => ({ year: row.year, player: row.player, round: row.round, roundHoles: row.round_holes ?? 18, course: row.course, format: row.format ?? "Unspecified", hole: row.hole, par: row.par, yards: row.yards, score: row.score, putts: row.putts, fairwayInRegulation: row.fairway_in_regulation, greenInRegulation: row.green_in_regulation, penalties: row.penalties })),
    partnerships: participants.rows.filter((row) => row.partner).map((row): CareerPartnership => ({
      player: row.player, partner: row.partner!, year: row.year, format: row.format ?? "Unspecified",
      result: row.winning_side?.toUpperCase() === "HALVED" ? "halve" : row.winning_side?.toUpperCase() === row.team_id?.toUpperCase() ? "win" : "loss",
    })),
    databaseReady: holes.ready && participants.ready,
  };
}
