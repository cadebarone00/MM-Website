# Organizer override database foundation

2026-10-28. Additive SQL authored/tested locally only. NOT applied to hosted,
staging or production databases. Status: `review_required`. Baseline cd3d30e0
plus uncommitted mobile scoring work, preserved. Owners/reviewers, jurisdictions,
audience, retention decisions and release approval remain unassigned.

## Scope and schema assumptions

This repo installs ordered standalone supabase/*.sql files; this file is not
automatically applied by a deployment runner. The installed target schema is
unknown. Prerequisites are the existing Golf Trip/group/offline/submission,
player_rounds and golf_trip_scoring_corrections.sql chain, including current
revision/reopened_at columns and publish_trip_submission. The unique primary
organizer index is untouched. No existing SQL file, application route, scoring
function, trigger, policy, official snapshot or reader is modified.

Actual relationships remain scoring_groups.golf_trip_id -> golf_trips and
scoring_groups.golf_trip_round_id -> golf_trip_rounds; the round also has a trip
ID. Submitted cards identify group + golfer, with current revision/card and an
append-only revision table. These are still the only official score source.
New audit old/new values are historical evidence, never a read projection of
current official scores or an alternative score table.

## Added objects and boundaries

- golf_trip_override_events: one field/hole change per request UUID, actor,
  trip/round/group/golfer snapshot IDs, old/new JSON values, reason, consecutive
  official revision IDs and database time. Global request PK and unique
  group/golfer/new-revision index prevent duplicate receipts/revision collisions.
  Generated SHA-256 fingerprint version 1 includes actor, resource IDs, hole,
  field, new value, trimmed reason and expected revision; excludes derived old
  value/time. Integers are canonical JSON integers (not 4.0), reasons trimmed,
  shots enumerated, penalties boolean. Future API normalization must match this.
- golf_trip_override_delegations: append-only grant/revoke intent log with
  sequence, request UUID, delegate, current primary actor, reason and server time.
  No existing role changes, no mutator RPC, no active override capability yet.
  A trigger requires the actor's accepted primary-organizer membership; a grant
  requires an accepted participant target, and self-grants fail a constraint.
- golf_trip_override_controls: unseeded inert per-trip metadata, default
  lifecycle unreviewed, gross_stroke_18 only, state revision/reason fields for
  later explicit authorized transitions. CHECK overrides_enabled=false makes
  enabling impossible without a separately reviewed schema change. This does
  NOT hook existing live scoring/finalization/reopen behavior.
- golf_override_value_valid / golf_override_fingerprint: pure validation/hash
  helpers. golf_override_participant: accepted caller membership plus the existing
  account_is_active predicate, failing closed when absent. Trigger functions
  stamp actor/time, reject inserts while disabled and prevent audit mutation.

All three tables use RLS. Authenticated accepted participants may SELECT the
new permitted history, including primary organizers' own-card events. Pending,
outside and anonymous callers cannot. Existing legacy revision-history RLS is
not widened here; exposing all legacy history is a separate reader/policy task.
Missing account_is_active means no new history access; this must be verified on
the target. Anonymous/authenticated/service_role table mutation and sequence
privileges are explicitly revoked. Only the participant predicate is executable
by authenticated callers; no SQL entry point changes a score, grants authority,
finalizes or reopens. Even owner INSERT reaches a disabled trigger. UPDATE,
DELETE and TRUNCATE on audit tables are rejected. Database owners/superusers can
still alter/disable protection: this is not tamper-proof against administrators.

Audit tables use snapshot UUIDs without live-object FKs so deletion neither
cascades the audit nor blocks existing trip/profile deletion. Future atomic
operations MUST validate group/round/trip/player/submission relationships and
actor/delegation under locks before inserting anything. Controls alone cascade
with the trip. Audit retention/deletion access needs explicit policy/professional
review before real records are collected; current membership-based visibility
means a departed/deleted trip has no ordinary participant read path.

## Idempotency and authority still to implement

This is receipt infrastructure, not an enabled idempotent score operation.
Identical request/payload retries must later look up the immutable receipt and
return its recorded outcome. A reused ID with changed fingerprint must reject;
the PK alone rejects duplicates but does not implement that response protocol.
The future RPC must lock current submission, check expected revision, derive
old/new revisions/old value, apply the official snapshot, publish player history
and append the event in one transaction. No such operation exists in this step.

Future delegation RPCs must use current accepted primary organizer authority,
be replay-safe and audited. Delegation resolution must honor newest grant/revoke,
current membership and organizer transfer (old primary grants cannot silently
carry forward). There is deliberately no enabled permission-changing RPC now.
The future lifecycle RPC must audit finalize/reopen reasons, derive real event
state and reject corrections until explicitly reopened. Existing completed-trip
and other tournament engines are unchanged, not newly compliant with that rule.

## Legacy reopened work: inventory blocker

Live counts/records are UNKNOWN: no database containing user data was contacted.
docs/golf-trip-score-overrides-inventory.sql is a read-only operator handoff,
not executed here. Inventory reopened submissions, approved and pending requests,
missing submission locks, revision/card snapshots, current hole edits and queued
device work with the affected golfer/attester. Fixture tests are not a live audit.

The migration refuses installation/rerun if any approved request, reopened
submission or submission lacking its player lock exists. It aborts before DDL
and never relocks, deletes or changes such work. Pending requests also need a
recorded disposition before future activation, though they do not block this
inert installation. New legacy reopening remains possible after installation;
the inventory gate must run again before activation/cutover.

Safe resolution requires a named operator, restricted snapshot/backup, affected
participants' review and an explicit decision: finish through the current
attestation/resubmission path, or preserve the pending work for a separately
reviewed transition. Do not zero reopened_at, delete requests, silently accept
old scores, relock a player or drop device queues merely to pass the gate.
If unresolved, STOP rollout and keep the current behavior. No resolution is
automated or authorized by this foundation.

## Migration, rollback and next dependency

Install only after target schema verification, inventory resolution and review;
no hosted execution is part of this task. SQL is transactional and rerunnable.
No backfill/activation occurs. Rollback before real audit collection may drop
ONLY the new objects in dependency order after confirming they are empty. After
real audit collection, disable operations and retain/export protected audit;
do not delete history as rollback. Existing scoring source objects remain intact.

Next dependency: review the inventory and safe cutover plan, then build the
atomic organizer/delegate operation with own-card authority, official reader
compatibility, finalized-state guards, server actor/time, collision-safe receipts
and publication rollback tests. No API/UI should enable it before those checks.

## Compliance findings

All categories remain review_required. No new provider, dependency, client SDK,
native app, payment flow or application collection is enabled.

| Categories | Findings / remaining review |
| --- | --- |
| Privacy, personal data, accounts, security, logging | Audit contains identifiable actor/participant IDs, score changes and reasons visible to accepted participants. Review reason redaction, hosted RLS/Auth, primary/delegate abuse, access removal and restricted administrator access. |
| Retention, deletion | Audit intentionally outlives source deletion. Define lawful retention, deletion/tombstoning, backup/restore replay and access procedures; no duration is invented. |
| UGC, media/golf-content rights, course reviews, organizer responsibility | Reasons are UGC; scores and organizer decisions need participant notice, dispute handling and correct authority. No new media collection. |
| IP, contractor ownership, open source | Reuses PostgreSQL/PGlite and existing code; verify ownership/licenses for release. |
| Payments, subscriptions, taxes, advertising, sponsorship, affiliates | No new money/commercial logic. Effects on future prizes/settlements are outside this gross-stroke foundation and require separate review. |
| Business ownership, minors, platform/provider rules, professional review | Entity, audience, jurisdictions and accountable reviewers remain unresolved. Assign policy/security owners and qualified review before collecting/distributing real audit data. |

## Test boundaries

Static tests and the existing new PGlite() in-memory harness are used with
synthetic accounts/trips/scores only. No URL/path/env database connection is
accepted. Auth's account_is_active predicate is explicitly stubbed in fixtures;
real Auth/revocation is not certified. Owner-only fixture seeding temporarily
disables only the new disabled-insert trigger to exercise schema/RLS/immutability;
that is not an application bypass or an enabled operation in the migration.

## Actual local checks, 2026-10-28

```powershell
node node_modules/tsx/dist/cli.mjs --test lib/platform/golfTripScoreOverrides.test.ts lib/platform/tripScoringSubmitApi.test.mts lib/platform/tripScoringWriteApi.test.mts lib/platform/tripScoringReadApi.test.mts lib/platform/golfTripReadApi.test.mts lib/supabase/requestIdentity.test.ts lib/profile/profileIdentity.test.ts lib/platform/tripScoring.test.ts lib/platform/scoringQueue.test.ts lib/platform/tripSubmission.test.ts lib/platform/tripCorrections.test.ts lib/compliance/featureRegistry.test.ts lib/compliance/registryStructure.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js lib/platform/golfTripScoreOverrides.test.ts lib/compliance/featureRegistry.ts
npm.cmd run docs:workflow
npm.cmd run docs:workflow:check
npm.cmd run compliance:check
git diff --check
```

Final focused run: 172 passed, 0 failed, including 13 foundation/static/database
checks. The first run had one static-test matcher failure on a dynamic SQL table
placeholder; that matcher was corrected, and subsequent foundation and combined
runs passed. Targeted lint, workflow generation/matching, compliance structure
(36 features / 9 checked documents) and whitespace checks exited 0. Structure is
not compliance clearance. SHA-256 checks confirm prior scoring sources/tests,
corrections route and recorded concurrent tracked files unchanged.
An initial full TypeScript run found missing PGlite query-result types in this
new test file; explicit result types were added. The 13 foundation checks and
targeted lint were rerun successfully after that correction.
The final full TypeScript run exited 0 with no diagnostics, after correcting
one remaining fingerprint-query result annotation identified by the interim run.
Final status also showed a new concurrent components/dev/DevSimulator.tsx edit;
this task did not write it. All previously recorded source hashes still match.
Check results describe the observed verification run, not a freeze of other work.
