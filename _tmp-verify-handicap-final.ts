import { getArchivedHandicapRounds } from "./lib/data/archivedScorecards";
import { combinedHandicapIndexes } from "./lib/handicap/archiveIndex";
import { createSupabaseServiceRoleClient } from "./lib/supabase/server";

async function main() {
  // 1. Does 2024 have any real per-player score data anywhere?
  const service = createSupabaseServiceRoleClient();
  const a = await service.from("archived_scorecard_rounds").select("id", { count: "exact", head: true }).eq("tournament_slug", "2024-pinehurst");
  console.log("2024-pinehurst rows in archived_scorecard_rounds:", a.count);
  const b = await service.from("career_archive_rounds").select("id", { count: "exact", head: true }).eq("season_year", 2024);
  console.log("2024 rows in career_archive_rounds:", b.count);

  // 2. Real handicap calc for a mix of players (2024+2025+2026, 2025-only, 2026-only)
  for (const slug of ["cade-barone", "peyton-vos", "kyle-schnabel"]) {
    const rounds = await getArchivedHandicapRounds(slug);
    const result = combinedHandicapIndexes([], rounds);
    const eligible2025 = rounds.filter((r) => r.tournamentSlug === "2025-danzante" && r.teeSetup?.rating).length;
    console.log(`\n${slug}: index=${result.index}, ${rounds.length} archived rounds total, ${eligible2025} of them 2025 rounds with a real tee`);
  }
}
main().then(() => process.exit(0)).catch((err) => { console.error("FAILED:", err); process.exit(1); });
