# Verified bearer scorecard submission review

2026-10-28. Local implementation only; not deployed. Status: `review_required`.
Feature: native-bearer-foundation revision 5. Baseline main cd3d30e0 plus prior
uncommitted scoring identity/resource-binding changes. Accountable owner,
security/policy/professional reviewers, jurisdictions, audience and due dates
remain unassigned. No release approval.

## Implementation and contract

Only POST /api/golf-trips/{tripId}/scoring/submit changes application behavior.
It uses getCurrentProfileForRequest(request): existing verified cookie/bearer
identity, mandatory bearer revocation check, conflicting-cookie denial and no
invalid-bearer cookie fallback. No new token parsing or implicit authentication.

The existing groupId/golferProfileId/expectedProfileId/cardVersion request stays.
Signed-out is 401; incomplete/missing profile and expected-account mismatch retain
409. Another golfer's card is denied with the existing 403 own-card error before
the submission RPC, even within the same trip. UUID comparison for ownership is
case-insensitive, matching database UUID semantics.

checkTripScoringWriteScope is reused unchanged: the verified user's RLS client
checks group ID/source/trip and the referenced round ID/trip. Missing/invisible/
mismatched resources return 404 `Round not found.`; lookup/profile/exception
failures return sanitized 500 `Couldn't submit the card. Try again.`. Malformed
payload remains 400; invalid URL trip remains 404 `Trip not found.`. Existing
RPC error mappings are preserved, including its generic save-error 500 text.

submitTripScorecard and submit_trip_scorecard are unchanged. The RPC locks the
group, checks membership/self ownership and saved completeness/attestation/card
version, then locks/submits/publishes player-round history in the existing
transaction. Already-submitted retries return the existing submission. Route
response remains `{ok:true,...result}`: rejected domain reasons incomplete,
unattested, mismatch, stale and no-attester still use HTTP 200, without claiming
a finalized card. No changes to SQL, revisions, scoring engines or publications.

## Remaining security/dependency findings

Before invoking the submission RPC, the route additionally reads the caller's
scoring_group_players row with the verified user's RLS client, filtered by group
and server-resolved profile. Trip visibility alone is insufficient. A missing
seat returns the same sanitized 404 without submission; lookup failure or an
unexpected row returns the sanitized submit-error 500. Existing RPC group-player
checks still run under its transaction lock. No group-player SQL/policy changes.

The shared preflight and RPC are separate calls. The reviewed normal paths do
not reassign a group/round UUID to a different trip; ordinary roles cannot
directly update those rows. Privileged reassignment races are not covered by a
new atomic invariant. RPC checks remain essential for deletion/member changes
after preflight. Atomic binding would require separately reviewed SQL work.

Correction request/decision mutations still need URL/group/request binding and
native authentication; they are unchanged. GET and hole POST implementations,
their existing tests, shared scope helper and native clients are preserved.
Hosted Auth/revocation/RLS, target RPC version, latency, real-device lifecycle,
actual concurrent transactions and history publication need staging evidence.
No accounts-a1/deploy-gate/iOS branch integration is needed for this route change.

## Compliance assessment

All categories remain `review_required`; structural checks cannot clear release.

| Categories | Findings and follow-up |
| --- | --- |
| Privacy, personal data, user accounts, security, audit logging | Existing caller/card/group identifiers reach existing metadata and submit services through verified bearer transport. Verify hosted self/member denial, revocation, redacted logs and score visibility. No new credential logging. |
| Retention, deletion | Existing submission/history records only; no new storage or retention period. Verify deleted/revoked accounts cannot submit and history/deletion disclosures match actual retention. |
| UGC, media rights, course/golf content, reviews, organizer responsibility | Existing golfer scores/attestation only, no new media/reviews. Validate participant authority, visibility and existing content rights. |
| IP, contractor ownership, open source | Existing identity/SDK/RPC logic reused; no dependencies added. Ownership/licensing reviews remain open. |
| Payments, subscriptions, taxes, advertising, sponsorship, affiliates | No new commercial or monetary flow. Existing scoring-adjacent value/settlement scope is unchanged and still requires review. |
| Business ownership, minors, provider/platform rules, legal review | Assign entity/audience/market decisions and accountable policy/security/professional reviewers before distribution clearance. |

## Verification limits

Tests execute the real route, request identity/profile boundary, RLS preflight,
submission loader and response parser with intercepted SDK/service responses.
Fixtures model RLS, domain decisions, already-submitted state and late-write lock
denial; they do not execute SQL or prove hosted atomicity/locking/history.
Existing submission/scoring regressions remain part of the focused selection.
No migrations, hosted writes, native changes or deployment are performed.

## Local commands, 2026-10-28

```powershell
node node_modules/tsx/dist/cli.mjs --test lib/platform/tripScoringSubmitApi.test.mts lib/platform/tripScoringWriteApi.test.mts lib/platform/tripScoringReadApi.test.mts lib/platform/golfTripReadApi.test.mts lib/supabase/requestIdentity.test.ts lib/profile/profileIdentity.test.ts lib/platform/tripScoring.test.ts lib/platform/scoringQueue.test.ts lib/platform/tripSubmission.test.ts lib/platform/tripCorrections.test.ts lib/compliance/featureRegistry.test.ts lib/compliance/registryStructure.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js "app/api/golf-trips/[tripId]/scoring/submit/route.ts" lib/platform/tripScoringSubmitApi.test.mts lib/compliance/featureRegistry.ts
npm.cmd run docs:workflow
npm.cmd run docs:workflow:check
npm.cmd run compliance:check
git diff --check
```

Final-source focused selection: 159 passed, 0 failed, including 31 submission-route
tests. Targeted ESLint, workflow generation/consistency, compliance structure and
diff checks exited 0. Expected synthetic error logs appeared in negative cases.
The restarted full TypeScript check exited 0 with no diagnostics.
Compliance structure reports 35 features / 9 checked documents; this is not
professional compliance or release approval. Earlier in-progress TypeScript and
lint runs were interrupted after adding the group-player check and are not
reported as passes; verification was restarted on the final source.

SHA-256 comparisons confirm prior scoring GET/POST and server helper sources,
prior GET/POST tests, correction route and recorded concurrent tracked edits
unchanged. No SQL/database-chain or real-device tests were run.
