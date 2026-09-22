// Default: read-only backup and exact repair plan. --apply requires a matching preflight.
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { scorecards2024 } from "../lib/data/scorecards-2024";
import { scorecards2025 } from "../lib/data/scorecards-2025";
import { scorecards2026 } from "../lib/data/scorecards-2026";
import { getPlayerSlug } from "../lib/data/players";
import { getTournament } from "../lib/data";
import { tournamentRoundSequence } from "../lib/data/tournamentRoundSequence";
import { legacyScorecardRound } from "../lib/data/roundIdentity";

loadEnvConfig(process.cwd());
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const definitions = [{ year: 2024, slug: "2024-pinehurst", cards: scorecards2024 }, { year: 2025, slug: "2025-danzante", cards: scorecards2025 }, { year: 2026, slug: "2026-palm-springs", cards: scorecards2026 }];
type Row = Record<string, unknown> & { id: string };
async function read(table: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...data);
    if (data.length < 1000) return all;
  }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function main() {
  const [rounds, holes, videos] = await Promise.all([read("archived_scorecard_rounds"), read("archived_scorecard_holes"), read("archived_shot_videos")]);
  const { data: setups, error: setupError } = await db.from("round_format_setups").select("*").order("season_year").order("round");
  if (setupError) throw new Error(setupError.message);
  const folder = `node_modules/.cache/archive-repair/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(folder, { recursive: true });
  await writeFile(`${folder}/backup.json`, JSON.stringify({ rounds, holes, videos, setups }, null, 2));
  const scoreHoles = (id: string) => holes.filter((h) => h.round_id === id).sort((a, b) => Number(a.hole) - Number(b.hole));
  const stats = (id: string) => scoreHoles(id).map((h) => [h.hole, h.par, h.yards, h.score, h.putts, h.fir, h.gir]);
  const issues: string[] = [];
  const plan: { survivor: Row; duplicates: Row[]; target: Record<string, unknown> }[] = [];
  const matched = new Set<string>();
  for (const definition of definitions) for (const card of definition.cards) for (const source of card.rounds) {
    const player = getPlayerSlug(card.player);
    const number = legacyScorecardRound(definition.year, source.round);
    const candidates = rounds.filter((r) => r.tournament_slug === definition.slug && r.player_slug === player && scoreHoles(r.id).length === source.holes.length && source.holes.every((h, i) => h.hole === scoreHoles(r.id)[i].hole && h.score === scoreHoles(r.id)[i].score));
    if (!candidates.length) { issues.push(`No exact score fingerprint: ${definition.slug}/${player}/${number}`); continue; }
    for (const r of candidates) { if (matched.has(r.id)) issues.push(`Ambiguous source for ${r.id}`); matched.add(r.id); }
    candidates.sort((a, b) => Number(scoreHoles(b.id).some((h) => h.host_edited)) - Number(scoreHoles(a.id).some((h) => h.host_edited)) || Number(b.round === number) - Number(a.round === number));
    const [survivor, ...duplicates] = candidates;
    for (const r of duplicates) {
      if (hash(stats(r.id)) !== hash(stats(survivor.id))) issues.push(`Conflicting ancillary hole statistics: ${r.id}/${survivor.id}`);
      if (scoreHoles(r.id).some((h) => h.host_edited)) issues.push(`Duplicate has edited holes: ${r.id}`);
      if (videos.some((v) => v.round_id === r.id)) issues.push(`Duplicate has videos requiring explicit merge: ${r.id}`);
    }
    const setup = setups?.find((s) => s.season_year === definition.year && s.round === number);
    const format = number === 0 ? "Individual" : source.format ?? tournamentRoundSequence(getTournament(definition.slug)!)[number - 1]?.format;
    if (!format) issues.push(`Missing format ${definition.slug}/${number}`);
    plan.push({ survivor, duplicates, target: { round: number, course: source.course, format, ...(setup ? { handicap_setup: setup.tee_setup, played_on: setup.played_on } : {}) } });
  }
  for (const r of rounds) if (definitions.some((d) => d.slug === r.tournament_slug) && !matched.has(r.id)) issues.push(`Unmatched database row ${r.id}`);
  await writeFile(`${folder}/plan.json`, JSON.stringify({ issues, plan }, null, 2));
  console.log(JSON.stringify({ backup: folder, sourceEvents: plan.length, duplicateRows: plan.reduce((n, p) => n + p.duplicates.length, 0), videos: videos.length, issues }, null, 2));
  if (!process.argv.includes("--apply")) return;
  if (issues.length) throw new Error("Repair blocked by unresolved evidence; database unchanged.");
  // Optimistic precondition: fail before any mutation if the export changed.
  const fresh = await Promise.all([read("archived_scorecard_rounds"), read("archived_scorecard_holes"), read("archived_shot_videos")]);
  if (hash(fresh) !== hash([rounds, holes, videos])) throw new Error("Archive changed during preflight; database unchanged.");
  // PostgREST lacks a cross-request transaction here. Keep a durable journal and
  // restore parent identities on any failure before duplicates have been removed.
  const journal: string[] = [];
  async function update(id: string, values: Record<string, unknown>) {
    const { error } = await db.from("archived_scorecard_rounds").update(values).eq("id", id);
    if (error) throw new Error(error.message);
    journal.push(id); await writeFile(`${folder}/journal.json`, JSON.stringify(journal));
  }
  const affected = plan.filter((p) => p.duplicates.length || Object.entries(p.target).some(([k, v]) => hash(p.survivor[k]) !== hash(v)));
  if (!affected.length) { console.log("Already repaired; no changes."); return; }
  throw new Error("Apply intentionally disabled until atomic repair transport is prepared; backup and plan are ready.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Repair failed"); process.exitCode = 1; });
