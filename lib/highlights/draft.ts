import { canonicalConfig, configFingerprint, fileFingerprint } from "./canonical.ts";
import { classifyChanges, type ChangeSummary } from "./changes.ts";
import { importHighlightSheet } from "./importer.ts";
import { renderTemplate, SAMPLE_VALUES } from "./template.ts";
import type { HighlightConfig, ValidationReport } from "./types.ts";
import { isLive, publishableConfig, validateHighlightConfig } from "./validator.ts";
import { readHighlightWorkbook, type XlsxRejection } from "./xlsxSource.ts";

/**
 * One uploaded .xlsx → a draft for the preview screen. Pure; there is deliberately no "publish" here.
 * Publishing is a separate, explicit admin action (phase H4) that re-checks everything below.
 * The draft holds the parsed config and fingerprints — never the file's bytes.
 */

export interface PublishedVersion { version: number; config: HighlightConfig }

export interface DraftPreviewLine {
  conditionalId: string;
  ruleId: string;
  /** Rendered with SAMPLE_VALUES so organizers see real-looking text. */
  headline: string;
  body: string;
}

export interface HighlightDraft {
  file: { name: string; bytes: number; fingerprint: string };
  /** Canonical: sorted, no sheet row numbers. This is what would be stored and published. */
  config: HighlightConfig;
  configFingerprint: string;
  /** Errors and warnings keep their tab + row so the organizer can find them in the sheet. */
  report: ValidationReport;
  /** Compared with this live version (null = nothing published yet). Publish is refused if it's no longer live. */
  baseVersion: number | null;
  changes: ChangeSummary;
  /** Zero errors and at least one change that players would see. */
  canPublish: boolean;
  /** Behavior changes (what fires, at which tier) need a second confirm at publish. */
  needsBehaviorConfirm: boolean;
  counts: { rules: number; conditionals: number; liveRules: number; liveConditionals: number };
  preview: DraftPreviewLine[];
}

export type DraftResult = { ok: true; draft: HighlightDraft } | { ok: false; code: XlsxRejection; error: string };

export function buildHighlightDraft(input: { bytes: Uint8Array; fileName: string; published: PublishedVersion | null }): DraftResult {
  const read = readHighlightWorkbook(input.bytes, input.fileName);
  if (!read.ok) return read;

  const imported = importHighlightSheet(read.tabs);
  const report = validateHighlightConfig(imported.config, imported.issues);
  const config = canonicalConfig(imported.config);
  const changes = classifyChanges(input.published ? input.published.config : null, config);
  const live = publishableConfig(config);

  const preview: DraftPreviewLine[] = [];
  for (const rule of live.rules) for (const conditional of rule.conditionals) {
    const headline = renderTemplate(conditional.headline, SAMPLE_VALUES), body = renderTemplate(conditional.body, SAMPLE_VALUES);
    preview.push({ conditionalId: conditional.id, ruleId: rule.id,
      headline: headline.ok ? headline.text : conditional.headline, body: body.ok ? body.text : conditional.body });
  }

  return {
    ok: true,
    draft: {
      file: { name: input.fileName, bytes: input.bytes.length, fingerprint: fileFingerprint(input.bytes) },
      config, configFingerprint: configFingerprint(config), report,
      baseVersion: input.published?.version ?? null, changes,
      canPublish: report.ok && changes.kind !== "none",
      needsBehaviorConfirm: changes.kind === "behavior",
      counts: {
        rules: config.rules.length,
        conditionals: config.rules.reduce((n, rule) => n + rule.conditionals.length, 0),
        liveRules: live.rules.length,
        liveConditionals: config.rules.reduce((n, rule) => n + rule.conditionals.filter((c) => isLive(rule, c)).length, 0),
      },
      preview,
    },
  };
}
