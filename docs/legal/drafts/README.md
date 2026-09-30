# The Maroon Legal Policy Draft Set

**Status: DRAFT — NOT EFFECTIVE — NOT LEGAL ADVICE**

Created 2026-09-30 from the current repository, `LEGAL_COMPLIANCE_SPEC.md`, `DATA_INVENTORY.md`, `LEGAL_REVIEW_REQUIRED.md`, `INITIAL_COMPLIANCE_AUDIT.md`, and current product decisions.

These files are working drafts for attorney/CPA review. They are intentionally version-controlled now so the product and policies can evolve together. Do not publish them as final legal documents until the placeholders, launch scope, business entity, jurisdictions, age rules, vendors, retention periods, payment terms, and professional-review items are resolved.

## Drafts in this folder

- `TERMS_OF_USE_DRAFT.md`
- `PRIVACY_POLICY_DRAFT.md`
- `COOKIE_POLICY_DRAFT.md`
- `ACCEPTABLE_USE_POLICY_DRAFT.md`
- `USER_CONTENT_IP_POLICY_DRAFT.md`
- `COPYRIGHT_DMCA_POLICY_DRAFT.md`
- `PRIVACY_RIGHTS_REQUEST_POLICY_DRAFT.md`
- `REFUND_CANCELLATION_POLICY_DRAFT.md`
- `ACCESSIBILITY_STATEMENT_DRAFT.md`
- `LEGAL_NOTICE_DRAFT.md`
- `SPONSORSHIP_ADVERTISING_AFFILIATE_DISCLOSURE_DRAFT.md`
- `DATA_RETENTION_POLICY_INTERNAL_DRAFT.md`
- `INCIDENT_RESPONSE_PLAN_INTERNAL_DRAFT.md`
- `COMMERCIAL_EMAIL_POLICY_INTERNAL_DRAFT.md`
- `POLICY_UPDATE_CHECKLIST.md`

## Current product facts reflected here

- The Maroon is being productized as a multi-tenant golf tournament platform.
- New commercial tournaments are invite-only during beta.
- New tournaments begin private and are published later.
- Current commercial V1 media policy is `none` or `device_external`; `maroon_hosted` is reserved for future commercial use.
- The founding Maroon Tournament may retain existing hosted media.
- Commercial real-money wagering is excluded from V1.
- Payments/subscriptions are not yet live.
- Current known infrastructure includes Next.js/Vercel and Supabase/Postgres/Auth; founding-event hosted media uses Cloudflare R2.
- Current repository review did not identify PostHog, Google Analytics, gtag, or Sentry integrations. Re-check before publishing cookie/privacy disclosures.

## Required placeholders before publication

Resolve at minimum:

- `[LEGAL ENTITY NAME]`
- `[MAILING ADDRESS]`
- `[LEGAL CONTACT EMAIL]`
- `[PRIVACY EMAIL]`
- `[SUPPORT EMAIL]`
- `[DMCA AGENT / COPYRIGHT CONTACT]`
- `[MINIMUM ACCOUNT AGE]`
- `[GOVERNING LAW / VENUE]`
- launch jurisdictions
- final vendor/subprocessor list
- retention schedule
- payment/refund/subscription terms
- account-deletion mechanics
- cookie/analytics inventory from a real browser/session audit

## Maintenance rule

Update these drafts whenever a material feature changes data collection, sharing, visibility, user content, media, payments, subscriptions, advertising, age handling, jurisdictions, vendors, retention, or account lifecycle. Run the repository compliance review before treating a policy version as release-ready.
