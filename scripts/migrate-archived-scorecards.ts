// scripts/migrate-archived-scorecards.ts
// Run once with: npx tsx scripts/migrate-archived-scorecards.ts
// Copies today's hardcoded 2025/2026 scorecards into the database, exactly
// as-is — this only relocates the source of truth, no values change.
// Safe to re-run: every insert is keyed by the same unique constraints the
// schema defines, so a second run just no-ops on rows already present
// rather than duplicating them (see the onConflict below).
import { createSupabaseServiceRoleClient } from "../lib/supabase/server";
import { scorecards2025 } from "../lib/data/scorecards-2025";
import { scorecards2026 } from "../lib/data/scorecards-2026";
import { playerProfiles } from "../lib/data/players";
import type { PlayerScorecard } from "../lib/data/types";

async function migrateTournament(tournamentSlug: string, scorecards: PlayerScorecard[]) {
  const service = createSupabaseServiceRoleClient();

  for (const card of scorecards) {
    const profile = playerProfiles.find((p) => p.id === card.player);
    if (!profile) {
      console.warn(`No PlayerProfile found for scorecard player "${card.player}" in ${tournamentSlug} — skipping.`);
      continue;
    }

    for (const round of card.rounds) {
      const { data: roundRow, error: roundError } = await service
        .from("archived_scorecard_rounds")
        .upsert(
          { tournament_slug: tournamentSlug, player_slug: profile.slug, round: round.round, course: round.course, format: round.format ?? null },
          { onConflict: "tournament_slug,player_slug,round" }
        )
        .select("id")
        .single();
      if (roundError || !roundRow) {
        console.error(`Failed to upsert round ${round.round} for ${profile.slug} in ${tournamentSlug}:`, roundError);
        continue;
      }

      const holeRows = round.holes.map((h) => ({
        round_id: roundRow.id,
        hole: h.hole,
        par: h.par,
        yards: h.yards,
        score: h.score,
        putts: h.putts,
        fir: String(h.fir),
        gir: h.gir === 1,
      }));
      const { error: holesError } = await service.from("archived_scorecard_holes").upsert(holeRows, { onConflict: "round_id,hole" });
      if (holesError) {
        console.error(`Failed to upsert holes for round ${round.round}, ${profile.slug}, ${tournamentSlug}:`, holesError);
      }
    }
  }
  console.log(`Done migrating ${tournamentSlug}: ${scorecards.length} players.`);
}

async function main() {
  await migrateTournament("2025-danzante", scorecards2025);
  await migrateTournament("2026-palm-springs", scorecards2026);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
