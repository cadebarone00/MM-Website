// Read-only backup of every production table to out/backups/<timestamp>/.
// Step 2 of docs/production-migration-checklist.md. Run: npm run backup:production
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportTable, listTables, type Fetcher } from "../lib/platform/tableBackup";

async function main(baseUrl: string, serviceKey: string) {
  const fetcher = fetch as unknown as Fetcher;
  const tables = await listTables(fetcher, baseUrl, serviceKey);
  const folder = join("out", "backups", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(folder, { recursive: true });
  const summary: Record<string, number> = {};
  for (const table of tables) {
    const result = await exportTable(fetcher, baseUrl, serviceKey, table);
    writeFileSync(join(folder, `${table.name}.json`), JSON.stringify(result.rows, null, 2));
    summary[table.name] = result.rows.length;
    console.log(`${table.name.padEnd(40)} ${result.rows.length} rows`);
  }
  writeFileSync(join(folder, "_row-counts.json"), JSON.stringify(summary, null, 2));
  console.log(`\nBacked up ${tables.length} tables to ${folder}`);
}

loadEnvConfig(process.cwd());
const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.");
  process.exit(1);
}
main(baseUrl, serviceKey).catch((error) => {
  console.error(`BACKUP FAILED: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
