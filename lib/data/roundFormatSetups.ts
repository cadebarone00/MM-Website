import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ArchivedTeeSetup } from "@/lib/handicap/types";

export interface RoundFormatSetup {
  seasonYear: number;
  round: number;
  courseName: string;
  datePlayed: string;
  teeSetup: ArchivedTeeSetup;
}

export async function getRoundFormatSetups(): Promise<RoundFormatSetup[]> {
  const service = createSupabaseServiceRoleClient();
  const result: RoundFormatSetup[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("round_format_setups").select("season_year, round, course_name, played_on, tee_setup")
      .order("season_year").order("round").range(from, from + 999);
    // Old snapshots remain readable during rollout, before the migration.
    if (error?.code === "42P01" || error?.code === "PGRST205") return [];
    if (error) throw new Error("Could not load Round & Format Archive setups.");
    result.push(...(data ?? []).map((r) => ({ seasonYear: r.season_year, round: r.round, courseName: r.course_name, datePlayed: r.played_on, teeSetup: r.tee_setup })));
    if (!data || data.length < 1000) return result;
  }
}

export async function saveRoundFormatSetup(setup: RoundFormatSetup) {
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("round_format_setups").upsert({
    season_year: setup.seasonYear, round: setup.round, course_name: setup.courseName,
    played_on: setup.datePlayed, tee_setup: setup.teeSetup, source: "archive", updated_at: new Date().toISOString(),
  }, { onConflict: "season_year,round" });
  if (error) throw new Error("Could not save round setup. Apply round_format_setups.sql before using the archive editor.");
}
