// Retired: mixed source numbering cannot be repaired by another blind renumber.
throw new Error("Retired migration. Use scripts/repair-historical-archive.ts to generate an evidence-checked atomic repair.");
// scripts/rebuild-2025-round-numbering.ts
// Preview only:  npx tsx scripts/rebuild-2025-round-numbering.ts
// Write for real: npx tsx scripts/rebuild-2025-round-numbering.ts --apply
//
// One-time historical fix for 2025-danzante, per Cade (2026-09-14): the
// trip played 7 rounds total — 2 Fourball, 2 Alternate Shot, 2 Singles
// (the Maroon-vs-White match play, 6 rounds) plus one extra individual
// round that only decided the individual champion and has nothing to do
// with match play. That extra round got saved under "Round 2" in the
// original spreadsheet by mistake — it is NOT the Day 1 PM Alt Shot round;
// Alt Shot never has individual scores (confirmed 2026-09-11), so neither
// Alt Shot round has an archived row at all, same as every other year.
//
// Renumbers archived_scorecard_rounds.round from "1-5, sequential" to the
// true round-of-the-trip, with the individual-champion round pulled out
// of the 1-6 numbering entirely and given the sentinel value 0 (displayed
// as "Round INDI" — see lib/data/roundLabel.ts):
//   old 1 -> 1  (Day 1 AM Fourball)
//   old 2 -> 0  (individual-champion round — "Round INDI", format "Individual")
//   old 3 -> 3  (Day 2 AM Fourball)
//   old 4 -> 5  (Day 4 AM Singles)   [true rounds 2 and 4 are the two Alt Shot
//   old 5 -> 6  (Day 4 PM Singles)    rounds — no row exists for either]
// Applied per-row by id, in descending order of the OLD round number, so a
// renumbered row never collides with the unique
// (tournament_slug, player_slug, round) constraint on a row that hasn't
// moved yet. The "old 2" row's format is set directly here (there's no
// schedule entry for it); the rest get their format from
// backfill-archived-round-format.ts, run after this.
import { createSupabaseServiceRoleClient } from "../lib/supabase/server";

const TOURNAMENT = "2025-danzante";
const OLD_TO_NEW: Record<number, number> = { 1: 1, 3: 3, 4: 5, 5: 6 };
const INDIVIDUAL_ROUND_OLD_NUMBER = 2;
const INDIVIDUAL_ROUND_SENTINEL = 0;

async function main() {
  const apply = process.argv.includes("--apply");
  const service = createSupabaseServiceRoleClient();

  const { data: rows, error } = await service
    .from("archived_scorecard_rounds")
    .select("id, player_slug, round, course, format")
    .eq("tournament_slug", TOURNAMENT)
    .order("round", { ascending: false }); // descending old round — avoids unique-constraint collisions
  if (error) {
    console.error("query failed —", error.message);
    return;
  }

  for (const row of rows ?? []) {
    if (row.round === INDIVIDUAL_ROUND_OLD_NUMBER) {
      console.log(`  ${row.player_slug} round ${row.round} (${row.course}): -> Round INDI (round=${INDIVIDUAL_ROUND_SENTINEL}, format="Individual")`);
      if (apply) {
        const { error: updateError } = await service.from("archived_scorecard_rounds").update({ round: INDIVIDUAL_ROUND_SENTINEL, format: row.format ?? "Individual" }).eq("id", row.id);
        if (updateError) console.error(`    FAILED — ${updateError.message}`);
      }
      continue;
    }
    const newRound = OLD_TO_NEW[row.round];
    if (!newRound) { console.log(`  ${row.player_slug} round ${row.round} (${row.course}): no mapping — left alone`); continue; }
    if (newRound === row.round) { console.log(`  ${row.player_slug} round ${row.round} (${row.course}): unchanged`); continue; }
    console.log(`  ${row.player_slug} round ${row.round} (${row.course}) -> round ${newRound}`);
    if (apply) {
      const { error: updateError } = await service.from("archived_scorecard_rounds").update({ round: newRound }).eq("id", row.id);
      if (updateError) console.error(`    FAILED — ${updateError.message}`);
    }
  }

  if (!apply) console.log("\nDry run only — nothing written. Re-run with --apply to save these.");
  else console.log("\nDone.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
