// scripts/backfill-archived-round-format.ts
// Preview only:  npx tsx scripts/backfill-archived-round-format.ts
// Write for real: npx tsx scripts/backfill-archived-round-format.ts --apply
//
// Tags every archived_scorecard_rounds row with its real match format
// (Fourball / Singles / ...) so the WHS handicap math
// (archivedDifferential in lib/handicap/archiveIndex.ts) can tell which
// rounds have an individual score to count. Alternate Shot/Foursomes
// rounds never get an archived per-player scorecard in the first place
// (confirmed with Cade, 2026-09-11) — a player doesn't play their own ball
// the whole round — so they never show up here to tag.
//
// Requires the round's `round` number to already be the TRUE round of the
// trip (Alternate Shot included in the count, even though it has no row) —
// see tournamentRoundSequence.ts and scripts/rebuild-2026-round-numbering.ts,
// which is what makes 2026-palm-springs eligible for this script. A
// tournament whose rounds haven't been renumbered that way yet is skipped
// entirely (reported, never guessed) until it's ready.
import { createSupabaseServiceRoleClient } from "../lib/supabase/server";
import { tournamentRoundSequence } from "../lib/data/tournamentRoundSequence";
import { palmSprings2026 } from "../lib/data/2026-palm-springs";
import { danzante2025 } from "../lib/data/2025-danzante";
import type { Tournament } from "../lib/data/types";

// Tournaments whose archived `round` numbers are confirmed to already be
// the TRUE round-of-the-trip numbering. Add a tournament here only after
// its one-time renumbering script has been run — see
// scripts/rebuild-2026-round-numbering.ts for the 2026 example.
const READY_TOURNAMENTS: Tournament[] = [palmSprings2026];
void danzante2025; // not ready yet — round 5 of 5 has no schedule match (see chat 2026-09-11); add here once resolved and renumbered.

async function main() {
  const apply = process.argv.includes("--apply");
  const service = createSupabaseServiceRoleClient();
  const toWrite: { id: string; player: string; round: number; course: string; format: string }[] = [];

  for (const tournament of READY_TOURNAMENTS) {
    const sequence = tournamentRoundSequence(tournament);
    console.log(`\n=== ${tournament.slug} ===`);
    const { data: rows, error } = await service
      .from("archived_scorecard_rounds")
      .select("id, player_slug, round, course, format")
      .eq("tournament_slug", tournament.slug)
      .order("player_slug")
      .order("round");
    if (error) {
      console.error(`  query failed — ${error.message}`);
      continue;
    }
    for (const row of rows ?? []) {
      if (row.format) continue; // never overwrite an existing value
      const format = sequence[row.round - 1]?.format;
      if (!format) {
        console.log(`  ${row.player_slug} round ${row.round} (${row.course}): no schedule entry for this round number — skipped`);
        continue;
      }
      console.log(`  ${row.player_slug} round ${row.round} (${row.course}): -> "${format}"`);
      toWrite.push({ id: row.id, player: row.player_slug, round: row.round, course: row.course, format });
    }
  }

  console.log(`\n${toWrite.length} rows would be tagged.`);
  if (!apply) {
    console.log("Dry run only — nothing written. Re-run with --apply to save these.");
    return;
  }
  for (const row of toWrite) {
    const { error } = await service.from("archived_scorecard_rounds").update({ format: row.format }).eq("id", row.id);
    if (error) console.error(`Failed to update ${row.player} round ${row.round}:`, error.message);
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
