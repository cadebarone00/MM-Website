# Feature Compliance Review Checklist

Version 1 — 2026-09-29. Copy this template into a feature's review record for **every significant new feature or material change** before calling it production-ready. This is internal issue tracking, not legal/tax advice or certification. Follow [LEGAL_COMPLIANCE_SPEC.md](LEGAL_COMPLIANCE_SPEC.md); update [featureRegistry.ts](lib/compliance/featureRegistry.ts) with non-sensitive findings and evidence references.

This template is intentionally incomplete. Unchecked items, blanks, `TBD` and unknown applicability are unresolved, not passes. Existing behavior is not grandfathered into compliance. A prototype/local-only feature still needs scope review before its next production release; external embeds and device-only media require different data-flow analysis from hosted copies.

## 1. Review identity and scope

| Field | Complete for this review |
| --- | --- |
| Feature ID/name and accountable owner | TBD |
| Scope revision and review record location | TBD |
| Proposed behavior; current behavior; exclusions | TBD |
| Reviewed commit/build and target release | TBD |
| Intended users, ages, organizers and affected non-users | TBD |
| Legal entity, contracting party, operating and user jurisdictions | TBD |
| Distribution: web/PWA/native stores; relevant storefronts | TBD |
| Vendors, subprocessors, hosting regions and external services | TBD |
| Engineering, policy/operations, security reviewers | TBD |
| Attorney and/or CPA reviewer, or documented trigger assessment | TBD |
| Review date and next-review date | TBD |

- [ ] Explain why this review scope includes all changed behavior, including background jobs, SDKs and onward exports.
- [ ] Identify the master spec sections that apply and any unresolved operating facts.
- [ ] Reopen prior review if data use, vendor, country, age group, monetization, asset rights or distribution changes.

## 2. Data, asset and money maps

Create one row per data class, not one generic row for the entire feature. Include organizer-entered participants, non-users, identifiers, cookies, device storage, logs, backups, derived records and analytics.

| Data class / subject | Source and purpose | Collection authority / legal analysis reference | Visibility and recipients | Store / vendor / region | Retention trigger and duration | Deletion / export / backup handling | Owner / evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

| Asset / contribution | Source / creator | Ownership or license evidence | Allowed uses / territories / expiry | Attribution / removal obligations | Owner / unresolved issue |
| --- | --- | --- | --- | --- | --- |
| Code, dependency, font, logo, photo, music, golf data, review or other asset: TBD | TBD | TBD | TBD | TBD | TBD |

| Money or value flow | Payer / seller / merchant of record / recipient | Provider and channel | Fees / refunds / cancellation / disputes | Tax and regulated-activity assessment | Owner / evidence |
| --- | --- | --- | --- | --- | --- |
| Payment, subscription, sponsor, affiliate commission, prize or virtual value: TBD | TBD | TBD | TBD | TBD | TBD |

- [ ] Verify that the maps reflect actual implementation rather than intended UI behavior.
- [ ] Describe device-only processing, external links/embeds, server uploads and onward transfers separately.
- [ ] Record unknowns as findings. Do not assign invented retention periods, age thresholds or tax treatment.

## 3. Category-by-category assessment

Assess **every row**. The registry's `attentionCategories` are triage hints, not the complete applicability list. Each category needs applicability, status, rationale, owner, reviewer, dates, evidence and any actions in the completed record.

Status vocabulary: `not_applicable`, `compliant`, `implementation_required`, `review_required`, `blocked`. Here `compliant` means evidence-backed completion of this internal scope's requirements; it is not a legal determination. A `not_applicable` decision needs a reason and dated review evidence. All rows initially remain `review_required`.

| Registry category | Questions and evidence to address | Initial status |
| --- | --- | --- |
| business-ownership | Entity, authorized signers, account/domain control, responsibility and recovery established? | review_required |
| intellectual-property | Rights/provenance for brand, code, designs, fonts, datasets and AI-assisted assets documented? | review_required |
| contractor-ownership | Assignments/licenses, pre-existing work, subcontractors, confidentiality and offboarding reviewed? | review_required |
| open-source | Direct/transitive dependencies and copied assets inventoried; licenses, notices and redistribution obligations reviewed? | review_required |
| privacy | Purposes, jurisdiction, notices, consent/choices, vendors and transfers assessed? | review_required |
| personal-data | Subjects, identifiers, sensitive data, collection minimization, sharing and actual visibility mapped? | review_required |
| user-accounts | Authentication, recovery, sessions, account terms, linking and non-account participants covered? | review_required |
| retention | Per-class durations, triggers, jobs, archives, backups and holds defined and verified? | review_required |
| account-deletion | Intake, identity verification, deletion propagation, retained exceptions, ownership transfer and billing implications tested? | review_required |
| ugc | Reporting, moderation, blocking where relevant, takedown, appeals, user license and responsibility defined? | review_required |
| media-rights | Hosted/device/external flows, creator/music/participant/venue rights, releases and derivative removal reviewed? | review_required |
| third-party-golf-content | Club/course marks, photos, maps, scorecards, statistics and scraped/imported data rights reviewed? | review_required |
| security | Threat model, scoped authorization, secrets, uploads/URLs, dependencies, recovery and incident response verified? | review_required |
| payments | Seller/provider roles, payment data scope, receipts, refund/dispute process and webhook controls reviewed? | review_required |
| subscriptions | Recurring terms, trial/price changes, renewal evidence, cancellation and entitlements verified? | review_required |
| taxes | Entity, locations, seller role, registrations, product classification, records and reporting assessed by CPA where triggered? | review_required |
| advertising | Labels, claim evidence, targeting, SDK data, consent and audience restrictions reviewed? | review_required |
| sponsorship | Contracts, brand rights, compensation, labels, editorial independence and expiry covered? | review_required |
| affiliate-links | Nearby relationship disclosures, partner terms, tracking and commission accounting covered? | review_required |
| course-reviews | Methodology, provenance, incentives, conflicts, paid ranking, moderation and disputed facts reviewed? | review_required |
| organizer-responsibility | Participant data authority, invitations, privacy choices, rights and platform/organizer duties allocated? | review_required |
| minors | Intended/actual audience, age strategy, guardian process if needed and underage reports assessed? | review_required |
| platform-rules | Current channel/store/provider requirements, privacy disclosures, deletion, UGC, payment and age rules checked? | review_required |
| audit-logging | Necessary actions, minimal fields, restricted access, tamper resistance, retention and evidence recorded? | review_required |
| legal-review | Professional triggers resolved with decision references, permitted scope and conditions? | review_required |

For invitations/notifications, separately assess email, SMS and push; essential versus marketing content; sender identity; recipient authority; suppression/preferences; tokens; and provider retention. For analytics, include events, device identifiers, SDKs, session replay, consent/opt-out behavior, vendor sharing and retention. These cross-cut privacy, personal-data, security, advertising, retention and platform rules rather than being exempt categories.

## 4. Actions and evidence

Every unresolved requirement must have an actionable entry. Separate engineering work from document/operations work and from professional judgments. A category can require all three.

| Action ID / category | Track: engineering / policy_document / attorney_cpa | Requirement and acceptance criteria | Owner | Due date | Status: open / blocked / done | Dependency or issue reference | Completion evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | open | TBD | TBD |

- [ ] Engineering evidence includes relevant authorization/abuse tests and data-flow verification, not only screenshots.
- [ ] Privacy/retention work includes requests, deletions, retries, backup restores and vendor propagation where applicable.
- [ ] UGC/media work includes complaint handling, visibility, removal and rights evidence where applicable.
- [ ] Payments/subscriptions work includes failure cases, duplicate events, cancellations and reconciliation where applicable.
- [ ] Policy documents match implemented behavior and have a named owner/version. Internal templates are not presented as approved public terms.
- [ ] Every professional trigger has a qualified reviewer, question, decision reference, scope, conditions and date, or remains unresolved.
- [ ] Store personal data, contracts, identity/tax documents and privileged advice outside the repository in restricted systems. Include only safe references and summaries here.

## 5. Professional escalation

- [ ] Assess new countries, audiences/minors, sensitive data, transfers/vendors, ownership/contractor issues, third-party content and licenses.
- [ ] Assess UGC/takedowns, reviews/rankings, ads/sponsors/affiliates, payments/recurring charges, native stores and retention/deletion conflicts.
- [ ] Assess entry fees, prizes, payouts, fantasy and purchasable/redeemable value. This review cannot override the product's exclusion of commercial real-money wagering.
- [ ] Route entity, nexus, tax collection/reporting, in-kind income, subscriptions and payout questions to a CPA as applicable.
- [ ] Route incidents, claims, regulator contacts or suspected breaches through the incident owner and counsel promptly; record any feature/release hold.

| Professional question / trigger | Attorney / CPA / specialist | Restricted decision reference | Allowed scope and required conditions | Review date / revisit trigger | Open or resolved |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | open |

## 6. Internal production-readiness decision

- [ ] Every registry category has a completed assessment for this scope, including reasoned exclusions.
- [ ] No applicable category remains `implementation_required`, `review_required` or `blocked`.
- [ ] No actions remain open/blocked; evidence and named reviewers support completion.
- [ ] Dates are valid/current and the release review covers this exact scope revision and commit/build.
- [ ] Required professional decisions are documented and their conditions are implemented.
- [ ] User-facing policies, support channels and operating procedures are ready for this launch scope.
- [ ] Release owner recorded the decision below and a follow-up review date.

| Decision field | Record |
| --- | --- |
| Decision: pending / internally reviewed for stated scope | pending |
| Release owner and date | TBD |
| Exact scope revision, commit/build and markets/channels | TBD |
| Evidence/checklist reference and professional decision references | TBD |
| Restrictions, exclusions and unresolved dependencies | TBD |
| Next review date and responsible owner | TBD |

Unresolved items prevent a production-ready designation under this internal process. Do not turn a waiver, deadline, test pass or business-owner preference into legal approval. If releasing a smaller feature, explicitly remove/disable the affected behavior, revise scope and repeat the review. Completing metadata never grants permission to deploy.

## 7. Registry maintenance and verification

Add new features to the registry seeds with stable IDs, precise scope and attention categories. Before a completed review is recorded, assign owners and collect a separate completed copy of this checklist. Store completed/partially completed records in `reviewedRecords` keyed by feature ID; include the full category assessment map. Those records replace only the corresponding unreviewed seed. Do not change the default initialization to mark all features or categories compliant.

Use `scopeRevision` for material changes. Reset affected statuses to `review_required` and `releaseReview.decision` to `pending`; update commit and evidence references only after verification. Review law, contracts, platform terms and vendors again when relevant facts change. A human reviewer must verify evidence content and professional qualifications; the helper only checks metadata structure, dates and unresolved statuses.

Optional local inspection (PowerShell):

```powershell
npm.cmd run compliance:check
npx.cmd tsx --test lib/compliance/featureRegistry.test.ts
npx.cmd tsx -e "import { featureRegistry, reviewRecordFindings } from './lib/compliance/featureRegistry.ts'; const today = new Date().toISOString().slice(0, 10); console.log(JSON.stringify(featureRegistry.features.map(feature => ({ id: feature.id, findings: reviewRecordFindings(feature, today) })), null, 2));"
```

The registry is JSON-serializable and imports no application services. `compliance:check` validates deterministic structure and explicit repository documentation file existence only; unresolved legal reviews, null reviewers and empty evidence remain valid structural data. It does not call `reviewRecordFindings`, whose separate output intentionally flags unresolved reviews. Neither helper nor these commands is installed as a CI gate, production hook or access-control system. Runtime enforcement and integration would require a separate authorized change.

## What changed

**2026-09-29 — Documentation/configuration only.** Added a reusable review template, category matrix, action/evidence tables and internal readiness decision process. No checklist is completed on behalf of a feature and no deployment or legal approval is asserted.
