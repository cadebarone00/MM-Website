/**
 * DEV ONLY: turns a Highlights .xlsx export into the simulator's fixture, lib/dev/highlightsSnapshot.json.
 *   npx tsx scripts/build-highlights-snapshot.ts "<file.xlsx>" "<label, e.g. Sheet export 2026-10-19 10:39>"
 * Reads only that local file; writes only the snapshot. It publishes nothing and is not what production reads
 * (production reads the published version from Supabase).
 */
import fs from "node:fs";
import path from "node:path";
import { buildHighlightDraft } from "../lib/highlights/draft.ts";

const [file, label] = process.argv.slice(2);
if (!file || !label) {
  console.error('Usage: npx tsx scripts/build-highlights-snapshot.ts "<file.xlsx>" "<label>"');
  process.exit(1);
}
const result = buildHighlightDraft({ bytes: fs.readFileSync(file), fileName: path.basename(file), published: null });
if (!result.ok) {
  console.error(`Rejected: ${result.error}`);
  process.exit(1);
}
const { draft } = result;
const snapshot = {
  note: "DEV FIXTURE — a snapshot of the Highlights Google Sheet for the /dev simulator. Not published, not read by production.",
  label,
  fileFingerprint: draft.file.fingerprint,
  configFingerprint: draft.configFingerprint,
  report: { errors: draft.report.errors.map((e) => `${e.id ?? ""} ${e.message}`.trim()), warnings: draft.report.warnings.length },
  counts: draft.counts,
  config: draft.config,
};
const out = path.join("lib", "dev", "highlightsSnapshot.json");
fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Wrote ${out}: ${draft.counts.rules} rules, ${draft.counts.conditionals} triggers, ${draft.counts.variations} wordings; ${draft.report.errors.length} errors, ${draft.report.warnings.length} warnings.`);
