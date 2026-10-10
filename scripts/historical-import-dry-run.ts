// Dry run for any Historical Trip Package file: checks it and prints what an import would create. Writes nothing.
// Run: npx tsx scripts/historical-import-dry-run.ts out/history/the-maroon-2024-2026.v1.json
import { readFileSync } from "node:fs";
import { planHistoricalImport } from "../lib/history/historicalImportPlan";

const file = process.argv[2];
if (!file) { console.error("Usage: npx tsx scripts/historical-import-dry-run.ts <package.json>"); process.exit(2); }
const plan = planHistoricalImport(JSON.parse(readFileSync(file, "utf8")));
console.log(JSON.stringify({ ok: plan.check.ok, dataset: plan.dataset, summary: plan.check.summary, errors: plan.check.errors,
  warnings: plan.check.warnings, editions: plan.editions, flags: plan.flags, participants: plan.participants.length }, null, 2));
process.exit(plan.check.ok ? 0 : 1);
