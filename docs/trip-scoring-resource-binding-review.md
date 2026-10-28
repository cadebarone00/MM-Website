# Scoring POST resource binding review

2026-10-27. Local implementation, not deployed. Status: `review_required`.
Feature: native-bearer-foundation revision 4; baseline cd3d30e0 plus prior
uncommitted scoring GET/POST work. Owner, reviewers, audience, jurisdictions,
professional review and due dates remain unassigned.

## Authoritative relationship and guard

scoring_groups contains source, golf_trip_id and golf_trip_round_id; the round
references golf_trip_rounds, which has its own golf_trip_id. Both must agree
with the URL trip. Existing scoring_groups_select/can_see_scoring_group and
golf_trip_rounds_select_members policies scope reads to the caller. Authenticated
roles have SELECT but no ordinary group/round update policies. Existing setup
RPCs create/delete groups rather than move a group UUID to another trip.

checkTripScoringWriteScope uses createSupabaseServerClient(request), retaining
the established verified bearer/cookie and revocation boundary. It reads the
group under user RLS with id/source/trip filters, then the referenced round under
user RLS with round/trip filters. No service-role metadata lookup or client claim
of ownership grants access. Returned IDs are also checked; malformed replies
fail closed. Existing service-role write RPCs still enforce their player,
attester, ownership, lock and correction rules.

Both versioned ops and direct entries are guarded after their existing validation
and expected-account check where present. Missing/invisible/cross-trip resources
return identical 404 `{ok:false,error:"Round not found."}`. Lookup errors or
throws return 500 `{ok:false,error:"Couldn't save the score. Try again."}`.
Neither reaches a mutation RPC. Malformed UUIDs retain parser 400. Normal success,
RPC error shapes, versions, retries, conflicts and score locks are unchanged.

## Concurrency boundary and endpoint follow-ups

The preflight and write are separate database calls, not an atomic new invariant.
The existing write RPC locks/checks the group; deletion after preflight returns
its missing-group denial. Ordinary callers cannot directly reassign group/round
trip IDs under the reviewed SQL, and no inspected setup path does so. Privileged
SQL/reassignment between preflight and write is not covered: if that capability
is introduced/required, bind expected trip inside the locked RPC transaction via
a separately reviewed migration. No SQL or migration is changed/run here.

GET scoring passes URL trip and round number to get_trip_round_scoring, which
checks membership and selects that trip's round. It has no body group ID and no
analogous mutation mismatch. Hosted data consistency/RLS still needs evidence.
POST submit and correction-request still authorize body groupId independently
of URL tripId. Correction-decision similarly authorizes requestId independently
of URL trip. Their own-role checks remain, but URL binding is required follow-up
before release (owner/due date unassigned). Correction GETs are trip/round scoped.
These endpoints, their authentication and native callers are not changed.

## Compliance findings and follow-ups

All categories remain `review_required`; structural validation is not clearance.

| Categories | Scope / follow-up |
| --- | --- |
| Privacy, personal data, accounts, security, audit logging | Existing identifiers are used for two user-scoped metadata reads; no group/trip details are returned in denials. Verify actual hosted SELECT grants, RLS, revocation, membership removal and private error/log behavior. |
| Retention, deletion | No new persistence/retention. Deleted or invisible groups/rounds fail closed; target cleanup and account deletion remain to verify. |
| UGC, media rights, golf content, course reviews, organizer responsibility | Existing scores/course/group data only; no new uploads or sharing. Confirm participant/organizer authority and existing rights. |
| IP, developer ownership, open source | Existing SDK/identity code reused; no dependency added. Ownership/license distribution review remains open. |
| Payments, subscriptions, taxes, advertising, sponsorship, affiliates | No monetary or commercial calculation/settlement change. Eventual release applicability needs review. |
| Business ownership, minors, provider/platform rules, legal review | Entity, audience, markets and provider/store/professional decisions remain unresolved. Assign accountable reviewers before release. |

## Verification limits

Focused tests execute the real route, scope helper, SDK, identity and scoring
loaders against intercepted responses. Fixtures model group/round RLS and RPC
authorization, including membership in both trips. They do not certify hosted
schema/RLS, real transactional concurrency or devices. No migrations, hosted
mutations, deployments, commits or pushes are performed.

## Local verification commands, 2026-10-27

```powershell
node node_modules/tsx/dist/cli.mjs --test lib/platform/tripScoringWriteApi.test.mts lib/platform/tripScoringReadApi.test.mts lib/platform/golfTripReadApi.test.mts lib/supabase/requestIdentity.test.ts lib/profile/profileIdentity.test.ts lib/platform/tripScoring.test.ts lib/platform/scoringQueue.test.ts lib/platform/tripSubmission.test.ts lib/platform/tripCorrections.test.ts lib/compliance/featureRegistry.test.ts lib/compliance/registryStructure.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js "app/api/golf-trips/[tripId]/scoring/route.ts" lib/platform/tripScoringServer.ts lib/platform/tripScoringWriteApi.test.mts lib/compliance/featureRegistry.ts
npm.cmd run docs:workflow
npm.cmd run docs:workflow:check
npm.cmd run compliance:check
git diff --check
```

Focused tests passed 128/128; targeted lint, workflow generation/matching,
compliance structure (35 features, 9 checked documents) and diff checks exited 0.
The full TypeScript command also exited 0 with no diagnostics.
Registry checks establish structure only. SHA-256 comparisons confirmed the
existing GET body/tests, submit/correction routes and recorded concurrent files
unchanged. No SQL/database test chain or physical-device tests were run.
