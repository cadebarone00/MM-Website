// scripts/rebuild-2026-round-numbering.ts
// Preview only:  npx tsx scripts/rebuild-2026-round-numbering.ts
// Write for real: npx tsx scripts/rebuild-2026-round-numbering.ts --apply
//
// One-time historical fix for 2026-palm-springs, run in this exact order
// (confirmed with Cade, 2026-09-11):
//
//   1. The known Cove/Classic course-name swap on rounds 2/3/4 — this has
//      been sitting in project_specs.md's "Known gaps" since it was coded
//      and approved, just never run. Done FIRST, using TODAY's round
//      numbers, before step 2 changes what those numbers mean.
//   2. Renumber archived_scorecard_rounds.round from "only the rounds with
//      an individual score" (1-6) to the real round of the trip (Alternate
//      Shot included in the count, even though it has no row to renumber):
//        old 1 (Palmer)   -> 1   (Day 1 AM Fourball)
//        old 2 (Classic)  -> 3   (Day 2 AM Fourball)   [round 2 was Day 1 PM Alt Shot]
//        old 3 (Cove)     -> 4   (Day 2 PM Singles)
//        old 4 (Pete Dye) -> 5   (Day 3 AM Fourball)   [round 6 is Day 3 PM Alt Shot]
//        old 5 (Pete Dye) -> 7   (Day 4 AM Singles)
//        old 6 (Tournament) -> 8 (Day 4 PM Singles)
//      Applied per-row by id, in descending order of the OLD round number,
//      so a renumbered row never collides with the unique
//      (tournament_slug, player_slug, round) constraint on a row that
//      hasn't moved yet.
//
// Only touches archived_scorecard_rounds — career_stat_holes and
// career_stat_team_holes (the separate Career Stats tables) are NOT
// renumbered here; only their part of the Cove/Classic swap runs, exactly
// as already speced in project_specs.md.
//
// After this, run backfill-archived-round-format.ts to tag every round's
// format — it already expects true round numbers.
import { createSupabaseServiceRoleClient } from "../lib/supabase/server";

const TOURNAMENT = "2026-palm-springs";
const OLD_TO_NEW: Record<number, number> = { 1: 1, 2: 3, 3: 4, 4: 5, 5: 7, 6: 8 };

async function main() {
  const apply = process.argv.includes("--apply");
  const service = createSupabaseServiceRoleClient();

  // --- Step 1: Cove/Classic swap (today's round numbers) ---
  console.log("=== Step 1: Cove/Classic course-name swap ===");
  const swapSteps: { table: string; match: Record<string, string | number>; set: { course: string } }[] = [
    { table: "archived_scorecard_rounds", match: { tournament_slug: TOURNAMENT, round: 2, course: "Cove" }, set: { course: "Classic" } },
    { table: "archived_scorecard_rounds", match: { tournament_slug: TOURNAMENT, round: 3, course: "Classic" }, set: { course: "Cove" } },
    { table: "career_stat_holes", match: { year: 2026, round: 3, course: "Cove" }, set: { course: "Classic" } },
    { table: "career_stat_holes", match: { year: 2026, round: 4, course: "Classic" }, set: { course: "Cove" } },
    { table: "career_stat_team_holes", match: { year: 2026, round: 3, course: "Cove" }, set: { course: "Classic" } },
  ];
  for (const step of swapSteps) {
    let query = service.from(step.table).select("id", { count: "exact", head: true });
    for (const [key, value] of Object.entries(step.match)) query = query.eq(key, value);
    const { count, error } = await query;
    if (error) { console.error(`  ${step.table} ${JSON.stringify(step.match)}: query failed — ${error.message}`); continue; }
    console.log(`  ${step.table} ${JSON.stringify(step.match)} -> course="${step.set.course}": ${count ?? 0} row(s) match`);
    if (apply && count) {
      let update = service.from(step.table).update(step.set);
      for (const [key, value] of Object.entries(step.match)) update = update.eq(key, value);
      const { error: updateError } = await update;
      if (updateError) console.error(`    FAILED — ${updateError.message}`);
    }
  }

  // --- Step 2: renumber archived_scorecard_rounds ---
  console.log("\n=== Step 2: renumber rounds to the true round-of-the-trip ===");
  const { data: rows, error } = await service
    .from("archived_scorecard_rounds")
    .select("id, player_slug, round, course")
    .eq("tournament_slug", TOURNAMENT)
    .order("round", { ascending: false }); // descending old round — avoids unique-constraint collisions
  if (error) { console.error("  query failed —", error.message); return finish(apply); }

  for (const row of rows ?? []) {
    const newRound = OLD_TO_NEW[row.round];
    if (!newRound) { console.log(`  ${row.player_slug} round ${row.round} (${row.course}): no mapping — left alone`); continue; }
    if (newRound === row.round) { console.log(`  ${row.player_slug} round ${row.round} (${row.course}): unchanged`); continue; }
    console.log(`  ${row.player_slug} round ${row.round} (${row.course}) -> round ${newRound}`);
    if (apply) {
      const { error: updateError } = await service.from("archived_scorecard_rounds").update({ round: newRound }).eq("id", row.id);
      if (updateError) console.error(`    FAILED — ${updateError.message}`);
    }
  }

  finish(apply);
}

function finish(apply: boolean) {
  if (!apply) console.log("\nDry run only — nothing written. Re-run with --apply to save these.");
  else console.log("\nDone.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
