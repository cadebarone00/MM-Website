// Read-only: npx tsx scripts/audit-historical-handicap.ts
// Loads configured database credentials without printing them; writes a local audit only.
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import { scorecards2025 } from "../lib/data/scorecards-2025";
import { scorecards2026 } from "../lib/data/scorecards-2026";
import { getPlayerSlug } from "../lib/data/players";

loadEnvConfig(process.cwd());
const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const definitions = [
  { slug: "2025-danzante", cards: scorecards2025, mapping: { 1: 1, 2: 0, 3: 3, 4: 5, 5: 6 } as Record<number, number>, formats: { 0: "Individual", 1: "Fourball", 3: "Fourball", 5: "Singles", 6: "Singles" } as Record<number, string> },
  { slug: "2026-palm-springs", cards: scorecards2026, mapping: { 1: 1, 2: 3, 3: 4, 4: 5, 5: 7, 6: 8 } as Record<number, number>, formats: { 1: "Fourball", 3: "Fourball", 4: "Singles", 5: "Fourball", 7: "Singles", 8: "Singles" } as Record<number, string> },
];

async function main() {
  const { data: rounds, error } = await service.from("archived_scorecard_rounds")
    .select("id, tournament_slug, player_slug, round, course, format, played_on, handicap_setup")
    .in("tournament_slug", definitions.map((d) => d.slug)).order("tournament_slug").order("player_slug").order("round").limit(1000);
  if (error || !rounds || rounds.length === 1000) throw new Error("Could not read a complete round list.");
  const holes: { round_id: string; hole: number; score: number; par: number; yards: number; putts: number; fir: string; gir: boolean }[] = [];
  for (let offset = 0; offset < rounds.length; offset += 50) {
    const { data, error } = await service.from("archived_scorecard_holes").select("round_id,hole,score,par,yards,putts,fir,gir")
      .in("round_id", rounds.slice(offset, offset + 50).map((row) => row.id)).order("round_id").order("hole").limit(1000);
    if (error || !data || data.length === 1000) throw new Error("Could not read complete holes.");
    holes.push(...data);
  }
  const { data: setups, error: setupError } = await service.from("round_format_setups")
    .select("season_year,round,course_name,played_on,tee_setup").in("season_year", [2025, 2026]).order("season_year").order("round");
  if (setupError) throw new Error("Could not read shared setups.");
  const findings = rounds.map((row) => {
    const definition = definitions.find((d) => d.slug === row.tournament_slug)!;
    const source = definition.cards.find((card) => getPlayerSlug(card.player) === row.player_slug);
    const scores = holes.filter((h) => h.round_id === row.id).sort((a, b) => a.hole - b.hole);
    const candidates = (source?.rounds ?? []).filter((round) => round.holes.length === scores.length && round.holes.every((hole, index) => hole.hole === scores[index].hole && hole.score === scores[index].score));
    const mapped = candidates.map((round) => ({ legacyRound: round.round, intendedRound: definition.mapping[round.round], course: round.course, format: definition.formats[definition.mapping[round.round]] }));
    const setup = setups?.find((s) => s.season_year === Number(row.tournament_slug.slice(0, 4)) && s.round === row.round);
    return {
      id: row.id, tournament: row.tournament_slug, player: row.player_slug, storedRound: row.round, storedCourse: row.course, storedFormat: row.format,
      score: scores.reduce((sum, h) => sum + h.score, 0), holes: scores.length,
      displayedCourse: setup?.course_name ?? row.course,
      sourceMatches: mapped,
      needsReview: mapped.length !== 1 || mapped[0].intendedRound !== row.round || mapped[0].format !== row.format,
      // IDs and complete current hole values preserve evidence for a later repair plan.
      holeValues: scores, currentRoundSetup: row.handicap_setup, currentDate: row.played_on,
    };
  });
  const summary = definitions.map((d) => {
    const rows = findings.filter((r) => r.tournament === d.slug);
    return { tournament: d.slug, players: new Set(rows.map((r) => r.player)).size, currentRows: rows.length,
      sourceRounds: d.cards.reduce((n, c) => n + c.rounds.length, 0), needsReview: rows.filter((r) => r.needsReview).length,
      noExactSourceMatch: rows.filter((r) => r.sourceMatches.length !== 1).length };
  });
  const report = { auditedAt: new Date().toISOString(), mode: "read-only; no database changes", summary, setups, findings };
  await writeFile("docs/historical-handicap-audit.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Saved docs/historical-handicap-audit.json. Source matches are evidence, not permission to overwrite later corrections.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Audit failed"); process.exitCode = 1; });
