import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPLIANCE_CATEGORIES,
  featureRegistry,
  reviewRecordFindings,
  type FeatureComplianceRecord,
} from "./featureRegistry.ts";

const AS_OF = "2026-09-29";

/** Synthetic evidence tests metadata rules only; never a real feature approval. */
function completedMetadata(): FeatureComplianceRecord {
  const record = structuredClone(featureRegistry.features[0]);
  record.owner = "Fixture owner";
  record.jurisdictions = ["Fixture market"];
  record.audience = "Fixture audience";
  record.distributionChannels = ["Fixture channel"];
  record.reviewedCommit = "fixture-commit";
  record.checklistReference = "fixture:checklist";
  record.releaseReview = {
    decision: "recorded", reviewer: "Fixture release reviewer", reviewedOn: AS_OF,
    scopeRevision: record.scopeRevision, evidence: ["fixture:release-review"],
  };
  for (const category of COMPLIANCE_CATEGORIES) {
    record.assessments[category] = {
      applicability: "applicable", status: "compliant", rationale: "Synthetic test scope only.",
      owner: "Fixture owner", reviewer: "Fixture reviewer", reviewedOn: AS_OF,
      nextReviewOn: "2026-10-29", evidence: ["fixture:evidence"], actions: [],
    };
  }
  return record;
}

test("all 18 features (14 initial + backup-recovery + public-tournament-site + creator-access-requests + tournament-activity) are explicit, independent, JSON-serializable and unreviewed", () => {
  assert.equal(featureRegistry.features.length, 18);
  assert.equal(new Set(featureRegistry.features.map(feature => feature.id)).size, 18);
  assert.deepEqual(JSON.parse(JSON.stringify(featureRegistry)), featureRegistry);
  for (const feature of featureRegistry.features) {
    assert.deepEqual(Object.keys(feature.assessments).sort(), [...COMPLIANCE_CATEGORIES].sort());
    assert.equal(feature.releaseReview.decision, "pending");
    assert.ok(reviewRecordFindings(feature, AS_OF).length > 0);
    for (const assessment of Object.values(feature.assessments)) {
      assert.equal(assessment.status, "review_required");
      assert.equal(assessment.applicability, "undetermined");
      assert.equal(assessment.reviewer, null);
    }
    assert.ok(feature.attentionCategories.every(category => COMPLIANCE_CATEGORIES.includes(category)));
  }
  assert.notEqual(featureRegistry.features[0].assessments.privacy, featureRegistry.features[1].assessments.privacy);
});

test("completed metadata is distinguishable from unresolved work", () => {
  assert.deepEqual(reviewRecordFindings(completedMetadata(), AS_OF), []);
  for (const status of ["implementation_required", "review_required", "blocked"] as const) {
    const record = completedMetadata();
    record.assessments.privacy.status = status;
    assert.ok(reviewRecordFindings(record, AS_OF).includes(`privacy: ${status}.`));
  }
});

test("not-applicable needs a reasoned review, not just a status label", () => {
  const record = completedMetadata();
  record.assessments.payments.status = "not_applicable";
  assert.ok(reviewRecordFindings(record, AS_OF).some(message => message.includes("mismatch")));
  record.assessments.payments.applicability = "not_applicable";
  assert.deepEqual(reviewRecordFindings(record, AS_OF), []);
  record.assessments.payments.evidence = [];
  assert.ok(reviewRecordFindings(record, AS_OF).some(message => message.startsWith("payments:")));
});

test("stale dates, future reviews and changed scope invalidate completed metadata", () => {
  for (const mutate of [
    (record: FeatureComplianceRecord) => { record.assessments.privacy.nextReviewOn = AS_OF; },
    (record: FeatureComplianceRecord) => { record.assessments.privacy.reviewedOn = "2026-09-30"; },
    (record: FeatureComplianceRecord) => { record.assessments.privacy.reviewedOn = "2026-02-30"; },
    (record: FeatureComplianceRecord) => { record.scopeRevision += 1; },
    (record: FeatureComplianceRecord) => { record.reviewedCommit = " "; },
  ]) {
    const record = completedMetadata();
    mutate(record);
    assert.ok(reviewRecordFindings(record, AS_OF).length > 0);
  }
  assert.throws(() => reviewRecordFindings(completedMetadata(), "2026-02-30"));
});

test("an unresolved professional action cannot be hidden behind a compliant category", () => {
  const record = completedMetadata();
  const action = {
    id: "fixture-review", track: "attorney_cpa" as const, requirement: "Fixture professional question",
    owner: "Fixture reviewer", dueDate: AS_OF, status: "blocked" as "blocked" | "done", evidence: [] as string[],
  };
  record.assessments["legal-review"].actions.push(action);
  assert.ok(reviewRecordFindings(record, AS_OF).some(message => message.includes(action.id)));
  action.status = "done";
  assert.ok(reviewRecordFindings(record, AS_OF).some(message => message.includes(action.id)));
  action.evidence = ["fixture:restricted-review-reference"];
  assert.deepEqual(reviewRecordFindings(record, AS_OF), []);
});

test("missing categories do not silently count as exclusions", () => {
  const record = completedMetadata();
  delete (record.assessments as Partial<typeof record.assessments>).privacy;
  assert.ok(reviewRecordFindings(record, AS_OF).includes("privacy: missing assessment."));
});
