# Simplified signup review

Date: 2026-10-06. Feature: player-accounts. Local implementation; deployment and production provider configuration not verified. Accountable owner, jurisdictions, audience ages, professional reviewer and next review date remain unassigned. Status: review_required. Evidence: components/auth/SignUpForm.tsx, app/api/auth/signup/route.ts, supabase/schema.sql.

## Scope and data map

Signup displays Email / Mobile on full dark maroon; Mobile is disabled without an SMS provider. Email is entered first, password second. Existing Supabase email verification remains. Ordinary accounts receive display name Golfer and a random UUID-based username; no email-derived public name. Invite codes retain reserved player matching and claim rollback. Legacy name/username request fields remain supported. No new vendors, dependencies, payment, subscription, ads, media or golf-content flows.

Email and password: browser form memory to same-origin signup API to Supabase Auth. Password is never written into profiles. Email, generated display name/username, auth id and optional player slug: profiles via existing service role client. Existing session cookies and verification emails remain. No new browser persistence. Vendor region, auth/profile retention, backups, verified deletion propagation, policy notices and email sender configuration are unresolved. No phone data or SMS collected.

## Category assessment

All rows remain review_required; scope exclusions are observations, not legal clearance. Reviewer: implementation review by Codex on 2026-10-06; accountable owners and next review date unassigned.

| Category | Finding / follow-up |
| --- | --- |
| business-ownership | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| intellectual-property | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| contractor-ownership | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| open-source | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| privacy | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| personal-data | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| user-accounts | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| retention | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| account-deletion | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| ugc | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| media-rights | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| third-party-golf-content | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| security | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| payments | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| subscriptions | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| taxes | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| advertising | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| sponsorship | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| affiliate-links | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| course-reviews | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| organizer-responsibility | review_required: No new flow introduced in this scope; existing entity, rights, operational and professional evidence remains unresolved. |
| minors | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| platform-rules | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| audit-logging | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |
| legal-review | review_required: Review account notices, age scope, verification/recovery, abuse controls, profile visibility, retention/deletion and provider terms for changed account creation. |

## Actions

- Engineering, owner unassigned, due before production designation: verify real Supabase verification, duplicate-account behavior, profile rollback, invitation claim races, recovery and deletion. Local UI/API checks do not establish end-to-end provider readiness.
- Policy/document, owner unassigned, due before production designation: assign data responsibilities, retention schedule, privacy/account notices, rights-request procedure and approved audience/markets; acceptance evidence is approved records.
- Attorney/CPA, owner unassigned, due before production designation: resolve applicable privacy, contract/age and provider questions and assess any tax trigger; evidence is a restricted decision reference. All unresolved legal categories remain review_required.
- Mobile requires a separate SMS provider, verification, consent/purpose and abuse review before enabling; no phone signup claim is made here.

## Local verification

ESLint passed for signup form, page and API. Chromium checked email-to-password progression, verification success UI, request payload without extra profile fields, invitation username retention, disabled Mobile, responsive title position and horizontal overflow at phone/desktop/short landscape sizes. Signup successes were mocked; no real account was created. Invalid null/email/short-password requests returned 400 from the live local API. Phone screenshot was visually inspected. Workflow HTML search/navigation and change text checked. Provider verification, delivery and release remain unverified.
