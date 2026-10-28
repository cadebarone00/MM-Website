# Verified bearer scoring POST review

2026-10-27. Implemented locally; not deployed. Status: `review_required`.
Feature: native-bearer-foundation revision 3; baseline main cd3d30e0 plus the
uncommitted scoring GET implementation. Owner, reviewers, jurisdictions,
audience ages, due dates and release approval remain unassigned.

## Behavior and data boundary

Only scoring POST switches from getCurrentProfile() to the existing explicit
getCurrentProfileForRequest(request). That helper verifies Auth sessions,
requires the bearer revocation check and rejects cookie/bearer identity conflicts
without falling back to cookies. Browser cookie authentication is retained.
Only complete profiles reach mutation RPCs. No new token parsing is added.

Both existing payloads remain supported: versioned ops with expectedProfileId,
and direct entries without a new expected-account requirement. Existing
saveTripHoleOps/saveTripHoleScores and RPCs are unchanged, including membership,
own-card/assigned-attester authority, locking, versions and conflict handling.
Ops return `{ok:true,results,scoring}`; entries return `{ok:true,scoring}`.
Per-op applied/duplicate/conflict/locked remain HTTP 200 domain outcomes.
Existing 401/409 identity/profile/account errors and 400/403/404/500 mappings
remain. Thrown profile/backend failures return 500 with
`Couldn't save the score. Try again.` rather than exposing exception details.

The GET body, engine, SQL/RPCs, submission/correction routes, native client,
origin/CORS policies and existing persistence destinations are unchanged.

## Required unresolved security follow-up

URL tripId is syntax-checked but is not passed to the write RPC or bound to the
body groupId. RPCs authorize the actual group; an unrelated URL must not be
treated as evidence of correct trip scoping. Resolve and test this separately
before mobile release, including a caller belonging to both trips. No fix or
hosted validation is claimed here. Owner/due date: unassigned, required before
release review. Direct entries also retain their weaker timestamp/account-switch
contract; native queue integration should use versioned ops. Current last-op
deduplication is not a permanent payload-bound replay ledger.

## Compliance findings

All categories remain `review_required`; no professional or release clearance.

| Categories | Findings and follow-up |
| --- | --- |
| Privacy, personal data, accounts, security, audit logging | Existing golfer identifiers and hole scores now enter the same write service through bearer identity. Verify hosted revocation, member/player authorization, log redaction and trip/group binding; no new handler credential logging. |
| Retention, deletion | No new storage or retention policy. Verify revoked/deleted sessions cannot write; native queues/deletion cleanup remain separate. |
| UGC, golf content, media rights, course reviews, organizer responsibility | Existing score/stats fields only, no new media/review collection. Verify participant authority, score visibility and existing course/content rights. |
| IP, developer ownership, open source | Existing SDK/identity/scoring logic reused; no added dependency. Ownership and distribution-license review remains open. |
| Payments, subscriptions, taxes, advertising, sponsorship, affiliates | No new monetary/commercial flow or settlement logic. Assess applicability within the eventual release scope. |
| Business ownership, minors, platform/provider rules, legal review | Audience, regions, entity, provider/store terms and qualified review remain unresolved; assign accountable policy/security/professional reviewers. |

## Verification limits

Focused tests use the actual POST, request-aware profile/identity helper,
Supabase SDK, payload parsers, server write functions and response parsers.
Only SDK factories/server-only imports and service responses are intercepted.
Authorization fixtures model the RPC gate; they do not establish hosted SQL
installation, transactional concurrency, live replay safety or device behavior.
No migrations, hosted mutations or deployment are part of this change.

## Actual local checks, 2026-10-27

```powershell
node node_modules/tsx/dist/cli.mjs --test lib/platform/tripScoringWriteApi.test.mts lib/platform/tripScoringReadApi.test.mts lib/platform/golfTripReadApi.test.mts lib/supabase/requestIdentity.test.ts lib/profile/profileIdentity.test.ts lib/platform/tripScoring.test.ts lib/platform/scoringQueue.test.ts lib/platform/tripSubmission.test.ts lib/platform/tripCorrections.test.ts lib/compliance/featureRegistry.test.ts lib/compliance/registryStructure.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js "app/api/golf-trips/[tripId]/scoring/route.ts" lib/platform/tripScoringWriteApi.test.mts lib/compliance/featureRegistry.ts
npm.cmd run docs:workflow
npm.cmd run docs:workflow:check
npm.cmd run compliance:check
git diff --check
```

All commands exited 0. Focused tests: 124 passed, 0 failed (25 new POST tests).
TypeScript and targeted lint emitted no diagnostics. Workflow HTML matches its
Markdown. Compliance structure passed: 35 features / 9 checked documentation
files; structural validation does not establish legal compliance. Expected
synthetic backend-error logs appeared during negative tests. No database test
chain or migrations were run; transactional authorization remains staging work.

SHA-256 comparisons before/after confirmed the GET function body, existing GET
test and the recorded concurrent application files unchanged. Review of the
diff confirms no SQL, scoring engine, submit/correction route or native edits.
