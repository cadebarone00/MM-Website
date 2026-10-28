# Verified bearer scoring reads

2026-10-27. Local implementation only; not deployed. Status: `review_required`.
Feature: native-bearer-foundation, scope revision 2; baseline main cd3d30e0.
Accountable owner, security/policy reviewers, counsel, jurisdictions, audience ages,
due dates and release approval remain unassigned.

## Scope and contract

GET /api/golf-trips/{tripId}/scoring?round={number} now explicitly calls
getCurrentProfileForRequest(request). The existing main identity helper verifies
bearer sessions with Auth, requires a successful revocation check, rejects
conflicting cookie/bearer accounts and retains cookie authentication. No new
token parser or implicit header authority is added. A complete profile is required.
The existing service-role get_trip_round_scoring RPC receives only server-resolved
profile identity and retains its trip-membership gate. No write/RPC/SQL changes.

Success remains `{ ok: true, scoring }` with `Cache-Control: no-store`.
Identity/profile denial remains 401 `Log in to keep score.`; invalid/missing round
or nonmember remains 404 `Round not found.`; scoring failure remains 500
`Couldn't load scores.` Strict profile lookup or thrown backend errors now return
that same sanitized 500 response. No extra response fields, CORS exemptions,
native integration, persistence, analytics or calculation changes.

## Findings and follow-ups

All categories remain `review_required`; this record does not establish compliance.

| Categories | Findings / required follow-up |
| --- | --- |
| Privacy, personal data, accounts, security, audit logging | Existing round/group/profile identifiers and hole entries become readable via verified bearer transport under the same membership rule. Confirm hosted Auth/revocation, actual RPC membership enforcement, RLS, logging redaction and score visibility with synthetic staging accounts. No credentials or personal data are logged by the new handler. |
| Retention, deletion | No new storage or retention period. Verify deleted/revoked accounts lose access in the target environment; future native caches are outside this change. |
| UGC, media rights, golf content, course reviews, organizer responsibility | Existing golfer-entered scores and names only; no new upload/review path. Confirm membership visibility, organizer authority and existing course/content rights before distribution. |
| IP, developer ownership, open source | Existing identity/SDK/scoring code reused; no dependency added. Existing ownership and distribution-license questions remain unresolved. |
| Payments, subscriptions, taxes, advertising, sponsorship, affiliates | No new money/commercial flow; existing scoring-adjacent value features are unchanged. Release scope and professional applicability still require assessment. |
| Business ownership, minors, platform/provider rules, legal review | Entity/audience/regions, provider terms and intended store distribution remain unresolved. Assign policy/security owners and qualified professional review before release clearance. |

Engineering next step: hosted synthetic member/outsider/revocation tests, then
separate native read integration. Policy next step: confirm visibility, notices
and ownership. No beta-ready, launch-ready or professional approval is asserted.

## Verification boundaries

Focused tests exercise the real GET handler, request-aware profile resolution,
requestIdentityClient, installed Supabase SDK and getTripRoundScoring loader.
Only SDK factories/server-only imports and Auth/REST/business responses are
intercepted. The fixture models the existing SQL membership gate; it does not
execute SQL or prove the hosted database has the reviewed function installed.
Cookie/bearer success, outsider denial, revoked/invalid/conflicting credentials,
incomplete/missing profiles, validation and sanitized backend failures are covered.
No hosted requests, migrations, native tests or deployment are performed.

## Local validation, 2026-10-27

```powershell
node node_modules/tsx/dist/cli.mjs --test lib/platform/tripScoringReadApi.test.mts lib/platform/golfTripReadApi.test.mts lib/supabase/requestIdentity.test.ts lib/profile/profileIdentity.test.ts lib/platform/tripScoring.test.ts lib/compliance/featureRegistry.test.ts lib/compliance/registryStructure.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js "app/api/golf-trips/[tripId]/scoring/route.ts" lib/platform/tripScoringReadApi.test.mts lib/compliance/featureRegistry.ts
npm.cmd run docs:workflow
npm.cmd run docs:workflow:check
npm.cmd run compliance:check
git diff --check
```

All exited 0: 68 focused tests passed (16 new scoring-read tests), no TypeScript
or targeted ESLint diagnostics, generated workflow HTML matches Markdown, and registry structure
passed for 35 features / 9 documentation files. Expected synthetic backend-error
logs appeared during negative tests. Registry success is structural only.
POST's implementation was also compared with HEAD and is unchanged.
