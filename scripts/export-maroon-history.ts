// Exports The Maroon 2024–2026 from the repository's historical archive into a version 1 Historical Trip Package,
// checks it, and prints the dry-run plan. Writes ONLY the package file (to out/, which isn't committed); touches no
// database. Run: npx tsx scripts/export-maroon-history.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { exportMaroonHistory } from "../lib/history/maroonHistoryExport";
import { planHistoricalImport } from "../lib/history/historicalImportPlan";

const pkg = exportMaroonHistory();
const plan = planHistoricalImport(pkg);
mkdirSync("out/history", { recursive: true });
const file = `out/history/${pkg.dataset.key}.v${pkg.version}.json`;
writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");

console.log(`Wrote ${file}`);
console.log(`Valid: ${plan.check.ok}  ·  ${JSON.stringify(plan.check.summary)}`);
for (const e of plan.check.errors) console.log(`  ERROR ${e.path}: ${e.message}`);
for (const w of plan.check.warnings) console.log(`  warning ${w.path}: ${w.message}`);
for (const e of plan.editions) console.log(`  ${e.year}: ${e.rounds} rounds (${e.individualRounds} individual), ${e.scores} cards, ${e.matches} matches, winner ${e.winnerTeam ?? "—"}`);
console.log(`Flags: ${plan.flags.uncertain} uncertain, ${plan.flags.excluded} excluded`);
for (const f of pkg.flags) console.log(`  [${f.level}] ${f.path}: ${f.message}`);
console.log(`Participants (all start unlinked): ${plan.participants.map((p) => `${p.name} (${p.years.join("/")}, ${p.scoredRounds} cards)`).join("; ")}`);
process.exit(plan.check.ok ? 0 : 1);
