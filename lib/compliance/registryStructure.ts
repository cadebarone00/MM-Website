import { COMPLIANCE_CATEGORIES, COMPLIANCE_STATUSES } from "./featureRegistry.ts";

type Schema =
  | { kind: "text" | "date" | "positiveInteger"; nullable?: boolean }
  | { kind: "enum"; values: readonly (string | number)[] }
  | { kind: "array"; item: Schema; unique?: boolean; nonempty?: boolean }
  | { kind: "object"; fields: Record<string, Schema> };

const text: Schema = { kind: "text" };
const nullableText: Schema = { kind: "text", nullable: true };
const nullableDate: Schema = { kind: "date", nullable: true };
const strings: Schema = { kind: "array", item: text };
const enumOf = (values: readonly (string | number)[]): Schema => ({ kind: "enum", values });
const object = (fields: Record<string, Schema>): Schema => ({ kind: "object", fields });
const action = object({
  id: text, track: enumOf(["engineering", "policy_document", "attorney_cpa"]),
  requirement: text, owner: nullableText, dueDate: nullableDate,
  status: enumOf(["open", "blocked", "done"]), evidence: strings,
});
const assessment = object({
  applicability: enumOf(["undetermined", "applicable", "not_applicable"]),
  status: enumOf(COMPLIANCE_STATUSES), rationale: text,
  owner: nullableText, reviewer: nullableText, reviewedOn: nullableDate,
  nextReviewOn: nullableDate, evidence: strings,
  actions: { kind: "array", item: action },
});
const feature = object({
  id: text, name: text, scope: text, scopeRevision: { kind: "positiveInteger" },
  owner: nullableText, jurisdictions: strings, audience: nullableText,
  distributionChannels: strings, reviewedCommit: nullableText, checklistReference: nullableText,
  releaseReview: object({
    decision: enumOf(["pending", "recorded"]), reviewer: nullableText,
    reviewedOn: nullableDate, scopeRevision: { kind: "positiveInteger", nullable: true },
    evidence: strings,
  }),
  attentionCategories: { kind: "array", item: enumOf(COMPLIANCE_CATEGORIES), unique: true },
  assessments: object(Object.fromEntries(COMPLIANCE_CATEGORIES.map(category => [category, assessment]))),
});
const schema = object({
  schemaVersion: enumOf([1]), createdOn: { kind: "date" }, purpose: text,
  documentation: { kind: "array", item: text, unique: true, nonempty: true },
  mediaPolicy: object({
    commercialV1: { kind: "array", item: enumOf(["none", "device_external"]), unique: true, nonempty: true },
    reservedFuture: { kind: "array", item: enumOf(["maroon_hosted"]), unique: true, nonempty: true },
    foundingMaroonExistingHostedMedia: enumOf(["retained"]),
  }),
  features: { kind: "array", item: feature, nonempty: true },
});

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Deterministic shape checks only: no date freshness, evidence sufficiency or legal judgment. */
export function validateRegistryStructure(input: unknown): string[] {
  const errors: string[] = [];
  function check(value: unknown, rule: Schema, path: string) {
    if (value === null && "nullable" in rule && rule.nullable) return;
    switch (rule.kind) {
      case "text":
        if (typeof value !== "string" || !value.trim()) errors.push(`${path}: expected nonempty text.`);
        break;
      case "positiveInteger":
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) errors.push(`${path}: expected positive integer.`);
        break;
      case "date": {
        const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
        if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) errors.push(`${path}: expected YYYY-MM-DD date.`);
        break;
      }
      case "enum":
        if (!rule.values.some(allowed => allowed === value)) errors.push(`${path}: unknown value; expected ${rule.values.join(", ")}.`);
        break;
      case "array":
        if (!Array.isArray(value)) { errors.push(`${path}: expected array.`); break; }
        if (rule.nonempty && !value.length) errors.push(`${path}: expected at least one entry.`);
        if (rule.unique && new Set(value).size !== value.length) errors.push(`${path}: duplicate values.`);
        value.forEach((entry, index) => check(entry, rule.item, `${path}[${index}]`));
        break;
      case "object":
        if (!isObject(value)) { errors.push(`${path}: expected object.`); break; }
        for (const key of Object.keys(value)) if (!Object.hasOwn(rule.fields, key)) errors.push(`${path}.${key}: unknown field.`);
        for (const [key, child] of Object.entries(rule.fields)) {
          if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required field missing.`);
          else check(value[key], child, `${path}.${key}`);
        }
    }
  }
  check(input, schema, "registry");
  if (isObject(input) && Array.isArray(input.features)) {
    const ids = new Set<string>();
    input.features.forEach((entry, index) => {
      if (!isObject(entry)) return;
      if (typeof entry.id === "string") {
        if (ids.has(entry.id)) errors.push(`registry.features[${index}].id: duplicate feature ID ${entry.id}.`);
        ids.add(entry.id);
      }
      if (!isObject(entry.assessments)) return;
      for (const [category, assessment] of Object.entries(entry.assessments)) {
        if (!isObject(assessment) || !Array.isArray(assessment.actions)) continue;
        const actionIds = assessment.actions.filter(isObject).map(action => action.id);
        if (new Set(actionIds).size !== actionIds.length) errors.push(`registry.features[${index}].assessments.${category}.actions: duplicate action IDs.`);
      }
    });
  }
  return errors;
}

/** Checks only explicit repository documentation references, never restricted evidence or URLs. */
export function validateDocumentationReferences(references: readonly string[], isFile: (path: string) => boolean): string[] {
  return references.flatMap(path => {
    // Require repository-relative Markdown paths; no network requests or out-of-repo reads.
    if (!/^[a-zA-Z0-9_./-]+\.md$/.test(path) || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..")) return [`documentation: invalid repository Markdown path ${path}.`];
    return isFile(path) ? [] : [`documentation: missing file ${path}.`];
  });
}
