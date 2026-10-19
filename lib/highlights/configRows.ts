import type { HighlightDraft } from "./draft.ts";
import type { HighlightConfig } from "./types.ts";
import { upgradeConfig } from "./upgrade.ts";

/**
 * The JSON shapes exchanged with supabase/highlights_config.sql. Pure.
 * The future upload route passes draftRowPayload(draft) to save_highlight_draft(actor, payload); nothing here writes.
 */

export interface DraftRowPayload {
  fileName: string;
  fileBytes: number;
  fileFingerprint: string;
  config: HighlightConfig;
  configFingerprint: string;
  report: HighlightDraft["report"];
  changes: HighlightDraft["changes"];
  /** The live version the upload was compared with; the database refuses the draft if that's no longer live. */
  baseVersion: number | null;
}

export function draftRowPayload(draft: HighlightDraft): DraftRowPayload {
  return {
    fileName: draft.file.name, fileBytes: draft.file.bytes, fileFingerprint: draft.file.fingerprint,
    config: draft.config, configFingerprint: draft.configFingerprint,
    report: draft.report, changes: draft.changes, baseVersion: draft.baseVersion,
  };
}

/** get_active_highlight_config() → the live version, or null before the first publish or on an unexpected shape. */
export function activeConfigFromJson(value: unknown): { version: number; config: HighlightConfig; configFingerprint: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { version?: unknown; config?: unknown; configFingerprint?: unknown };
  // Any stored schema (2 or 3) is read as the current one; the stored version itself is never changed.
  const config = upgradeConfig(row.config);
  if (!Number.isInteger(row.version) || typeof row.configFingerprint !== "string" || !config) return null;
  return { version: row.version as number, config, configFingerprint: row.configFingerprint };
}
