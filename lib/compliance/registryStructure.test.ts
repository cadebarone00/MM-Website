import assert from "node:assert/strict";
import test from "node:test";
import { COMPLIANCE_STATUSES, featureRegistry } from "./featureRegistry.ts";
import { validateDocumentationReferences, validateRegistryStructure } from "./registryStructure.ts";

test("unresolved registry passes structure check without legal approval", () => {
  assert.deepEqual(validateRegistryStructure(featureRegistry), []);
  for (const status of COMPLIANCE_STATUSES) {
    const registry = structuredClone(featureRegistry);
    registry.features[0].assessments.privacy.status = status;
    // No inferred approval, evidence sufficiency, applicability or freshness check.
    registry.features[0].assessments.privacy.reviewedOn = "2000-01-01";
    assert.deepEqual(validateRegistryStructure(registry), []);
  }
});

test("duplicate feature IDs fail", () => {
  const registry = structuredClone(featureRegistry);
  registry.features.push(structuredClone(registry.features[0]));
  assert.ok(validateRegistryStructure(registry).some(error => error.includes("duplicate feature ID")));
});

test("unknown categories, statuses, decisions and fields fail", () => {
  const base = JSON.stringify(featureRegistry);
  for (const [from, to] of [
    ['"privacy"', '"unknown-category"'],
    ['"review_required"', '"legally_approved"'],
    ['"undetermined"', '"assumed"'],
    ['"pending"', '"released"'],
    ['"scopeRevision"', '"unknownState"'],
  ]) {
    assert.ok(validateRegistryStructure(JSON.parse(base.replace(from, to))).length > 0, to);
  }
});

test("missing fields and malformed nested containers return errors without throwing", () => {
  for (const input of [null, [], {}, { ...featureRegistry, features: null }]) {
    assert.ok(validateRegistryStructure(input).length > 0);
  }
  for (const field of ["owner", "scope", "assessments", "releaseReview"]) {
    const registry = structuredClone(featureRegistry);
    Reflect.deleteProperty(registry.features[0], field);
    assert.ok(validateRegistryStructure(registry).some(error => error.includes("required field missing")));
  }
  const registry = structuredClone(featureRegistry);
  Reflect.deleteProperty(registry.features[0].assessments, "privacy");
  assert.ok(validateRegistryStructure(registry).some(error => error.includes("assessments.privacy")));
});

test("action state, track and duplicate IDs are validated", () => {
  const registry = structuredClone(featureRegistry);
  const actions = registry.features[0].assessments.privacy.actions;
  actions.push({ id: "privacy-review", track: "attorney_cpa", requirement: "Review scope", owner: null, dueDate: null, status: "blocked", evidence: [] });
  assert.deepEqual(validateRegistryStructure(registry), []);
  for (const [from, to] of [['"blocked"', '"approved"'], ['"attorney_cpa"', '"automated_legal_advice"']]) {
    assert.ok(validateRegistryStructure(JSON.parse(JSON.stringify(registry).replace(from, to))).length > 0);
  }
  actions.push({ ...actions[0] });
  assert.ok(validateRegistryStructure(registry).some(error => error.includes("duplicate action IDs")));
});

test("dates are structural calendar values, never freshness or legal deadlines", () => {
  const registry = structuredClone(featureRegistry);
  registry.features[0].assessments.privacy.reviewedOn = "2026-02-30";
  assert.ok(validateRegistryStructure(registry).some(error => error.includes("YYYY-MM-DD")));
});

test("media metadata represents V1, future hosting and founding exception", () => {
  assert.deepEqual(featureRegistry.mediaPolicy, {
    commercialV1: ["none", "device_external"], reservedFuture: ["maroon_hosted"],
    foundingMaroonExistingHostedMedia: "retained",
  });
  const registry = structuredClone(featureRegistry);
  registry.mediaPolicy.commercialV1.push("unknown-mode");
  assert.ok(validateRegistryStructure(registry).some(error => error.includes("commercialV1")));
});

test("documentation checks fail missing files and reject external/traversal paths", () => {
  assert.deepEqual(validateDocumentationReferences(["LEGAL_COMPLIANCE_SPEC.md"], () => true), []);
  assert.deepEqual(validateDocumentationReferences(["MISSING.md"], () => false), ["documentation: missing file MISSING.md."]);
  for (const path of ["../secret.md", "/secret.md", "https://example.com/policy.md", "C:/secret.md", "docs/../secret.md", "docs\\secret.md"]) {
    assert.ok(validateDocumentationReferences([path], () => { throw new Error("Must not read invalid path"); }).length > 0);
  }
});
