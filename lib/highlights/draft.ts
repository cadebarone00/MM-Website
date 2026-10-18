import { canonicalConfig, configFingerprint, fileFingerprint } from "./canonical.ts";
import { classifyChanges, type ChangeSummary } from "./changes.ts";
import { importHighlightSheet } from "./importer.ts";
import { renderTemplate, SAMPLE_VALUES } from "./template.ts";
import type { HighlightConfig, ValidationReport } from "./types.ts";
import { publishableConfig, validateHighlightConfig } from "./validator.ts";
import { readHighlightWorkbook, type XlsxRejection } from "./xlsxSource.ts";

/**
 * One uploaded .xlsx → a draft for the preview screen. Pure; there is deliberately no "publish" here.
 * Publishing is a separate, explicit admin action (phase H4) that re-checks everything below.
 * The draft holds the parsed config and fingerprints — never the file's bytes.
 */

export interface PublishedVersion { version: number; config: HighlightConfig }

/** One line per live message variation. */
export interface DraftPreviewLine {
  ruleId: string;
  conditionalId: string;
  variationId: string;
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
  counts: { rules: number; conditionals: number; variations: number; liveRules: number; liveConditionals: number; liveVariations: number };
  preview: DraftPreviewLine[];
}

/** Every live message of a config, rendered with sample names — for a fresh upload or a saved draft alike. */
export function previewLines(config: HighlightConfig): DraftPreviewLine[] {
  const lines: DraftPreviewLine[] = [];
  for (const rule of publishableConfig(config).rules) for (const conditional of rule.conditionals) for (const variation of conditional.variations) {
    const headline = renderTemplate(variation.headline, SAMPLE_VALUES), body = renderTemplate(variation.body, SAMPLE_VALUES);
    lines.push({ ruleId: rule.id, conditionalId: conditional.id, variationId: variation.id,
      headline: headline.ok ? headline.text : variation.headline, body: body.ok ? body.text : variation.body });
  }
  return lines;
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

  const preview = previewLines(config);
  const conditionals = config.rules.flatMap((rule) => rule.conditionals);

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
        conditionals: conditionals.length,
        variations: conditionals.reduce((n, conditional) => n + conditional.variations.length, 0),
        liveRules: live.rules.length,
        liveConditionals: live.rules.reduce((n, rule) => n + rule.conditionals.length, 0),
        liveVariations: preview.length,
      },
      preview,
    },
  };
}
