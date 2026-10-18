/**
 * Checks a Highlights Engine .xlsx export without publishing anything.
 *   npx tsx scripts/check-highlights-xlsx.ts "<path to file.xlsx>"
 * Reads only that local file. Writes nothing, touches no database, makes no network calls.
 * Exit code 0 = no errors (could be published later through the Admin Center), 1 = errors or unreadable file.
 */
import fs from "node:fs";
import path from "node:path";
import { buildHighlightDraft } from "../lib/highlights/draft.ts";
import type { HighlightIssue } from "../lib/highlights/types.ts";

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/check-highlights-xlsx.ts "<file.xlsx>"');
  process.exit(1);
}

let bytes: Uint8Array;
try {
  bytes = fs.readFileSync(file);
} catch {
  console.error(`Can't open ${file}.`);
  process.exit(1);
}

const result = buildHighlightDraft({ bytes, fileName: path.basename(file), published: null });
if (!result.ok) {
  console.error(`Rejected: ${result.error}`);
  process.exit(1);
}

const { draft } = result;
const where = (issue: HighlightIssue) => (issue.source ? `${issue.source.tab}, row ${issue.source.row}` : "");
const line = (issue: HighlightIssue) => `  ${[issue.id, where(issue)].filter(Boolean).join(" · ") || "-"} — ${issue.message}`;

console.log(`File: ${draft.file.name} (${draft.file.bytes} bytes, ${draft.file.fingerprint})`);
console.log(`Config fingerprint: ${draft.configFingerprint}`);
console.log(`Rules: ${draft.counts.rules} · Conditionals: ${draft.counts.conditionals} · Variations: ${draft.counts.variations} · Live (Approved): ${draft.counts.liveRules} rules, ${draft.counts.liveConditionals} conditionals, ${draft.counts.liveVariations} messages`);
console.log(`\nErrors (${draft.report.errors.length})`);
for (const issue of draft.report.errors) console.log(line(issue));
console.log(`\nWarnings (${draft.report.warnings.length})`);
for (const issue of draft.report.warnings) console.log(line(issue));
console.log(`\nLive messages with sample names (${draft.preview.length})`);
for (const p of draft.preview) console.log(`  ${p.variationId}: ${p.headline} — ${p.body}`);
console.log(`\n${draft.report.ok ? "No errors." : "Has errors — fix them in the Google Sheet and export again."} Nothing was published.`);
process.exit(draft.report.ok ? 0 : 1);
