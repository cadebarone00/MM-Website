// Export an insert-only, canonical import. Existing rounds and all their edits remain untouched.
import { mkdir, writeFile } from "node:fs/promises";
import { scorecards2024 } from "../lib/data/scorecards-2024";
import { scorecards2025 } from "../lib/data/scorecards-2025";
import { scorecards2026 } from "../lib/data/scorecards-2026";
import { getPlayerSlug } from "../lib/data/players";
import { getTournament } from "../lib/data";
import { legacyScorecardRound } from "../lib/data/roundIdentity";
import { tournamentRoundSequence } from "../lib/data/tournamentRoundSequence";
async function main() {
  const quote = (value: unknown) => value == null ? "null" : "'" + String(value).replaceAll("'", "''") + "'";
  const statements = ["begin;"];
  for (const [slug, year, cards] of [["2024-pinehurst", 2024, scorecards2024], ["2025-danzante", 2025, scorecards2025], ["2026-palm-springs", 2026, scorecards2026]] as const) {
    for (const card of cards) for (const source of card.rounds) {
      const round = legacyScorecardRound(year, source.round);
      const format = round === 0 ? "Individual" : source.format ?? tournamentRoundSequence(getTournament(slug)!)[round - 1].format;
      const holes = source.holes.map(h => ({ hole: h.hole, par: h.par, yards: h.yards, score: h.score, putts: h.putts, fir: String(h.fir), gir: h.gir === 1 }));
      statements.push("with inserted as (insert into archived_scorecard_rounds(tournament_slug,player_slug,round,course,format) values (" + [slug, getPlayerSlug(card.player), round, source.course, format].map(quote).join(",") + ") on conflict(tournament_slug,player_slug,round) do nothing returning id) insert into archived_scorecard_holes(round_id,hole,par,yards,score,putts,fir,gir) select inserted.id,h.hole,h.par,h.yards,h.score,h.putts,h.fir,h.gir from inserted cross join jsonb_to_recordset(" + quote(JSON.stringify(holes)) + "::jsonb) as h(hole int,par int,yards int,score int,putts int,fir text,gir boolean);");
    }
  }
  statements.push("commit;");
  await mkdir("node_modules/.cache/archive-repair", { recursive: true });
  await writeFile("node_modules/.cache/archive-repair/import-missing.sql", statements.join("\n"));
  console.log("Generated node_modules/.cache/archive-repair/import-missing.sql. Existing rounds will be skipped entirely. Use repair-historical-archive.ts for corrupted rows. No database writes performed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
