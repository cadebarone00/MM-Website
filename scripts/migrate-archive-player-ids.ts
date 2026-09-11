import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { normalizeArchivePlayerFields } from "../lib/data/players/archiveIdentity.ts";

// Read and validate every proposed change before updating anything. No rows are deleted.
// Default: dry run. Apply only with --apply. Safe to rerun after an interrupted run.
async function main() {
loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and service role key are required.");
const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const tables: Record<string, string[]> = {
  career_stat_holes: ["player", "partner_1", "partner_2", "opponent_1", "opponent_2"],
  career_stat_partnerships: ["player", "partner"],
  career_stat_team_holes: ["player_1", "player_2"],
  career_stat_matches: ["maroon_players", "white_players"],
  career_match_participants: ["player", "partner", "opponent_1", "opponent_2"],
};
const plan: { table: string; id: string; before: Record<string, string>; after: Record<string, string> }[] = [];
for (const [table, fields] of Object.entries(tables)) {
  const seenParticipants = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const columns = ["id", ...fields, ...(table === "career_match_participants" ? ["event_id", "match_id"] : [])];
    const { data, error } = await service.from(table).select(columns.join(",")).order("id").range(from, from + 999);
    if (error) throw new Error(table + ": " + error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      const normalized = normalizeArchivePlayerFields(row);
      if (table === "career_match_participants") {
        const identity = JSON.stringify([row.event_id, row.match_id, normalized.player]);
        if (seenParticipants.has(identity)) throw new Error("Duplicate participant identity after normalization; resolve before applying.");
        seenParticipants.add(identity);
      }
      const before: Record<string, string> = {};
      const after: Record<string, string> = {};
      for (const field of fields) if (row[field] !== normalized[field]) {
        before[field] = row[field] as string;
        after[field] = normalized[field] as string;
      }
      if (Object.keys(after).length) plan.push({ table, id: row.id as string, before, after });
    }
    if (rows.length < 1000) break;
  }
  console.log(table + ": " + plan.filter((change) => change.table === table).length + " rows to normalize");
}
if (process.argv.includes("--apply")) {
  for (const change of plan) {
    let query = service.from(change.table).update(change.after).eq("id", change.id);
    for (const [field, value] of Object.entries(change.before)) query = query.eq(field, value);
    const { data, error } = await query.select("id");
    if (error || data?.length !== 1) throw new Error("Migration stopped at " + change.table + ": " + (error?.message ?? "row changed concurrently; rerun dry run"));
  }
  console.log("Applied", plan.length, "identity updates. Scores and source IDs unchanged.");
} else console.log("Dry run complete:", plan.length, "rows. Use --apply to persist.");

}
main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
