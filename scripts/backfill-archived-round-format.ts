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
// the whole round — so they're simply skipped, never zeroed out.
//
// The archive doesn't record which schedule match a round came from, so
// this matches by ORDER: for one player in one tournament, take their
// scheduled Fourball/Singles matches in chronological order (day, then
// Morning before Afternoon) and zip that 1:1 with their archived rounds
// sorted by round number. Verified against the one tournament with real
// dates already recorded — 2026-palm-springs rounds 1-3 land on exactly
// the days the schedule says they should.
//
// Safe to re-run: never overwrites a format that's already set, and only
// touches a player/tournament pair where the schedule's eligible-match
// count (plus any MANUAL_ROUND_FORMAT entries below) exactly equals the
// archived-round count — anything else is reported, never guessed.
import { createSupabaseServiceRoleClient } from "../lib/supabase/server";
import { isIndividualScoreFormat } from "../lib/handicap/archiveIndex";
import { palmSprings2026 } from "../lib/data/2026-palm-springs";
import { danzante2025 } from "../lib/data/2025-danzante";
import type { RealMatch, Tournament } from "../lib/data/types";

// 2025-danzante has 5 archived rounds per player but the schedule below
// only accounts for 4 (2 Fourball + 2 Singles) — round 5 has no schedule
// entry at all (likely a stroke-play/individual day that was never part
// of `matches`). Fill in its real format here once confirmed; left empty,
// round 5 is reported but not written.
const MANUAL_ROUND_FORMAT: Record<string, Record<number, string>> = {
  "2025-danzante": {
    // 5: "Singles",
  },
};

function sessionOrder(match: RealMatch): number {
  return match.day * 2 + (match.session === "Afternoon" ? 1 : 0);
}

function eligibleMatchesForPlayer(tournament: Tournament, playerSlug: string): RealMatch[] {
  return tournament.matches
    .filter((m) => (m.maroonPlayers.includes(playerSlug) || m.whitePlayers.includes(playerSlug)) && isIndividualScoreFormat(m.format))
    .sort((a, b) => sessionOrder(a) - sessionOrder(b));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const service = createSupabaseServiceRoleClient();
  const tournaments: Tournament[] = [palmSprings2026, danzante2025];
  const toWrite: { id: string; player: string; round: number; course: string; format: string }[] = [];
  let skippedPairs = 0;

  for (const tournament of tournaments) {
    const manual = MANUAL_ROUND_FORMAT[tournament.slug] ?? {};
    const players = [...tournament.roster.maroon, ...tournament.roster.white];
    console.log(`\n=== ${tournament.slug} ===`);

    for (const playerSlug of players) {
      const eligible = eligibleMatchesForPlayer(tournament, playerSlug);
      const { data: rounds, error } = await service
        .from("archived_scorecard_rounds")
        .select("id, round, course, format")
        .eq("tournament_slug", tournament.slug)
        .eq("player_slug", playerSlug)
        .order("round");
      if (error) {
        console.error(`  ${playerSlug}: query failed — ${error.message}`);
        continue;
      }

      const expectedCount = eligible.length + Object.keys(manual).length;
      if ((rounds?.length ?? 0) !== expectedCount) {
        console.log(`  ${playerSlug}: SKIPPED — ${rounds?.length ?? 0} archived rounds vs ${eligible.length} eligible schedule matches + ${Object.keys(manual).length} manual. Not touching this player.`);
        skippedPairs++;
        continue;
      }

      let eligibleIndex = 0;
      for (const round of rounds ?? []) {
        const manualFormat = manual[round.round];
        const scheduledFormat = manualFormat ?? eligible[eligibleIndex]?.format;
        if (manualFormat === undefined) eligibleIndex++;
        if (round.format) continue; // never overwrite an existing value
        if (!scheduledFormat) {
          console.log(`  ${playerSlug} round ${round.round} (${round.course}): no format available yet (add it to MANUAL_ROUND_FORMAT)`);
          continue;
        }
        console.log(`  ${playerSlug} round ${round.round} (${round.course}): -> "${scheduledFormat}"`);
        toWrite.push({ id: round.id, player: playerSlug, round: round.round, course: round.course, format: scheduledFormat });
      }
    }
  }

  console.log(`\n${toWrite.length} rows would be tagged. ${skippedPairs} player/tournament pairs skipped (count mismatch, needs a look).`);
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
