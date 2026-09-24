import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { RoundFormatSetup } from "@/lib/data/roundFormatSetups";
import { mapFutureHandicapRounds, type FutureRoundRow, type FutureHoleRow } from "./futureRoundMapping";

export async function getFutureHandicapRounds(player: string, setups: RoundFormatSetup[]) {
  const service = createSupabaseServiceRoleClient();
  const rows: FutureRoundRow[] = [];
  const holes: FutureHoleRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("career_archive_rounds").select("season_year, round, course, played_on, format, handicap_setup, status")
      .eq("player_slug", player).order("season_year").order("round").range(from, from + 999);
    if (error) throw new Error("Could not load tournament handicap rounds.");
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("career_archive_live_holes").select("season_year, round, hole, score, did_not_finish")
      .eq("player_slug", player).order("season_year").order("round").order("hole").range(from, from + 999);
    if (error) throw new Error("Could not load confirmed tournament scores.");
    holes.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return mapFutureHandicapRounds(rows, holes, setups);
}
