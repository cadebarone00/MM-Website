# Phase 2A: Golf Trip JSON reads

Subsequent integration: docs/mobile-phase2b-main-a6.md records the existing A6 client's local main-backed list/detail adapter, real HTTP verification and separate native outcomes. The Phase 2A contract below is unchanged.

2026-10-23. Implemented locally; not deployed. Hosted staging/production and native end-to-end behavior remain unverified. The existing A6 Android project is unchanged.

## Contract

GET /api/golf-trips returns `{ "ok": true, "trips": [...] }`. Each summary has exactly id, name, destination, startDate, endDate, status, expectedTravelerCount (number or null), memberCount, and role (organizer or member). An empty membership list is a successful empty array. Existing list ordering is preserved.

GET /api/golf-trips/{tripId} returns:

```json
{
  "ok": true,
  "trip": { "id": "trip-uuid", "name": "Golf Trip", "destination": "Pinehurst", "startDate": "2027-04-22", "endDate": "2027-04-26", "status": "active", "expectedTravelerCount": 4 },
  "viewer": { "role": "member" },
  "members": [{ "displayName": "Golfer", "role": "organizer" }],
  "rounds": [{ "roundNumber": 1, "dayNumber": 1, "playDate": "2027-04-23", "courseName": "Pinehurst No. 2" }],
  "setup": { "available": false }
}
```

Dates are ISO date strings; round playDate/courseName may be null. Members are accepted golfers with an attached profile, in existing loader order. Fields are explicitly projected: no account/profile IDs, emails, pending invitations, invite secrets, watch codes, internal database fields, travel records or full setup settings. Detail rounds are the saved trip's basic rounds, not a rendered scoring/schedule screen. setup.available reflects the existing optional-table fallback; it does not certify full setup/scoring readiness.

| HTTP status | code | Meaning |
| --- | --- | --- |
| 200 | none | Successful list/detail |
| 401 | unauthorized | Missing, invalid, expired, revoked, uncheckable or conflicting identity |
| 403 | profile_required | Verified account has no usable profile row |
| 404 | not_found | Malformed, nonexistent or nonmember trip; identical detail response |
| 503 | unavailable | Profile/business data lookup failure; no database error text returned |

Errors are `{ "ok": false, "code": "...", "error": "..." }`. Authentication/profile checks precede trip lookup. Every response has Cache-Control: private, no-store and Vary: Authorization, Cookie. No wildcard CORS or new origin exemption. GETs do not write application data. Existing POST/DELETE and their identity/origin rules are unchanged.

## Identity and reuse

getCurrentProfileForRequest uses the existing Phase 1 Supabase request boundary, then reads profiles.id = verified user.id under that user's RLS. Bearer revocation verification is mandatory and mixed cookie/bearer accounts are denied. No client query/body can supply authorization identity. An existing incomplete profile retains the same trip-read permission as the browser; no-profile accounts receive 403.

getGolfTripForProfile/getUserGolfTripsForProfile take server-resolved CurrentProfile contexts. Existing cached browser wrappers retain their original signatures and cookie-only identity. Both paths use the same service-role-only get_golf_trip/list_my_golf_trips RPCs and membership checks. Member email/photo privacy filtering remains in the loader; the JSON projection omits contact/photo fields entirely. Optional setup is read only after trip membership succeeds, using loadSavedTripSetup's existing fallback. No service-role credential reaches the response or client.

## Next A6 integration step

Reuse ../maroon-a6-poc/src/platform.ts's existing bearer/session ownership. Against an explicitly selected isolated main backend, fetch GET /api/golf-trips with Authorization: Bearer <access token>, then GET /api/golf-trips/{returned id}. Do not send profile IDs or reuse prototype /poc-api handoff endpoints. Browser callers retain cookies on the same origin. Do not log credentials. Partition any client cache by the signed-in account and clear it on sign-out/account switch; honor 401/403 without falling back to another account's cached data.

Adapt the prototype's list/detail read adapter to these DTOs in the next phase. These are not drop-in SavedGolfTripHome props: complete travel, settings and scoring screen contracts remain future work. The known A6 mixed-content Realtime failure is unchanged. No Android/iOS source, native bundle, schema, environment or host is changed here.

## Feature compliance review

Status: review_required. Scope baseline: main 1b252e4c plus local Phase 1. Accountable release/security/policy owners, jurisdictions, ages, professional reviewer and due dates remain unassigned. No legal compliance or release approval is claimed.

Data flow: existing account token/cookie -> existing Supabase Auth/RLS profile lookup -> server-verified profile -> existing service-role trip membership RPC -> allowlisted JSON. Existing trip names, destinations/dates, accepted-member display names/roles and basic round/course data become available through two authenticated reads. No new provider, persistence, device permission, retention period, analytics or money flow is introduced. Supabase/hosting regions, contracts, logging and deletion/retention guarantees require review. Tests use synthetic intercepted responses; target-hosted runtime behavior is unverified.

| Categories | Findings / open follow-up |
| --- | --- |
| privacy, personal-data, user-accounts, security, audit-logging | Reuse verified identity, membership checks and no-store responses. Review roster/course visibility, hosted RLS/revocation and log redaction before distribution. |
| retention, account-deletion | No new server persistence. Confirm future client cache clearing, deletion propagation and backup retention; no durations are invented. |
| intellectual-property, contractor-ownership, open-source | Existing main/A1 logic and installed dependencies reused; no new dependency. Ownership/license review remains unresolved. |
| ugc, media-rights, third-party-golf-content, course-reviews, organizer-responsibility | Existing golfer-entered trip/member/course labels only; no photo/video/contact payload or new user contribution. Review existing content rights and organizer/member responsibilities. |
| payments, subscriptions, taxes, advertising, sponsorship, affiliate-links | No new financial, commercial or promotional flow; professional applicability assessment remains pending for eventual release. |
| business-ownership, minors, platform-rules, legal-review | Launch audience, entity, provider/store obligations, notices and professional review remain unresolved. No native distribution is authorized by this change. |

Engineering follow-up: isolated main endpoint-to-A6 tests and full-screen contract design. Policy/legal follow-up: assign accountable reviewers and resolve applicable items above. All unresolved registry categories remain review_required.

## Validation evidence

Final local checks on 2026-10-23:

```powershell
node node_modules/tsx/dist/cli.mjs --test lib/platform/golfTripReadApi.test.mts lib/supabase/requestIdentity.test.ts lib/profile/profileIdentity.test.ts lib/auth/returnTo.test.ts lib/auth/passwordSession.test.ts lib/website/signOut.test.ts lib/account/reauth.test.ts lib/compliance/registryStructure.test.ts lib/compliance/featureRegistry.test.ts lib/platform/golfTripMembers.test.ts lib/platform/savedTripSetup.test.ts
```

Exit 0: 58 passed, 0 failed, including 10 new route/loader integration tests. Real handlers, profile resolution, Phase 1 SDK verification, loaders and projection run with intercepted Auth/REST and service-role factories; tests do not contact a database or establish hosted runtime behavior. The synthetic database-failure case intentionally exercises the existing loader's error log; its text is excluded from responses.

```powershell
node node_modules/eslint/bin/eslint.js lib/platform/golfTripReadApi.ts lib/platform/golfTripReadApi.test.mts lib/platform/golfTripsServer.ts lib/profile/currentProfile.ts app/api/golf-trips/route.ts "app/api/golf-trips/[tripId]/route.ts" lib/compliance/featureRegistry.ts scripts/render-workflow.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm.cmd run build
npm.cmd run docs:workflow
npm.cmd run docs:workflow:check
npm.cmd run compliance:check
git diff --check
```

All exit 0. Lint and standard typecheck produce no diagnostics. Production build uses installed Next.js 16.3.8 and generates 264 pages; the existing middleware-to-proxy deprecation warning remains. Compliance check validates structure only: 34 features, 8 documentation files. Playwright opened generated workflow HTML and passed change-panel, navigation, search and new workflow mapping checks; screenshot: out/phase2a-workflow.png (ignored local artifact). No deployment, migration, native build or live authenticated endpoint test is claimed.
