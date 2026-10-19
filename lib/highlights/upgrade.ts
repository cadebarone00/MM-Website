import { canonicalConfig } from "./canonical.ts";
import { emptyRuleMeta, type HighlightConfig, type HighlightRule } from "./types.ts";

/**
 * Reads any stored config version as the current schema (3). Pure; never changes what's stored.
 * Schema 2 (2026-10-17): no rule metadata, six golf tabs. Its IDs are kept exactly (incl. a CONDITIONAL row's own
 * wording as "-V00"), so events recorded against a v2 version still point at the right variation.
 * Returns null for anything that isn't a known schema.
 */
export function upgradeConfig(value: unknown): HighlightConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as { schemaVersion?: unknown; rules?: unknown };
  if (!Array.isArray(config.rules)) return null;
  if (config.schemaVersion === 3) return canonicalConfig(config as HighlightConfig);
  if (config.schemaVersion === 2) {
    const rules = (config.rules as Omit<HighlightRule, "meta">[]).map((rule) => ({ ...rule, meta: emptyRuleMeta() }));
    return canonicalConfig({ schemaVersion: 3, rules });
  }
  return null;
}
