# Phase 2B: existing A6 client to main trip reads

2026-10-23. Local isolated development only. No production/staging change, migration, release, push or deployment. Phase 1/2A application code is preserved. Native results are recorded separately below from HTTP and automated checks.

## Configuration and boundaries

The existing sibling C:/Users/Owner/Documents/GitHub/maroon-a6-poc remains the Capacitor client. Its secure-storage plugin, maroon-session key, Supabase refresh ownership, initial getSession restoration, Android ID and network-security configuration are retained. Other Profile/GPS/hosted-handoff implementations remain in place; their legacy loader paths are not provided by the Phase 2B proxy and return unavailable. The UI bundle still imports existing A1 UI modules; trip authorization, profile identity and trip data now come from current main.

| Component | Local configuration |
| --- | --- |
| Identity authority | Docker project maroon-auth-test; Auth/API 127.0.0.1:55321; PostgreSQL 55322 |
| Main server | scripts/mobile-local/start-main.cjs; existing main production build; 127.0.0.1:3997 |
| A6 proxy/static host | ../maroon-a6-poc/main-read-adapter.mjs; 127.0.0.1:4100 |
| Android destinations | Existing emulator host alias 10.0.2.2:4100 and 10.0.2.2:55321 |
| A1 backend | Older port 3998 and A1 header stubs are not used for trip reads |

runtime.cjs verifies Docker project labels, the database's published 55322 port and local CLI Auth URL before obtaining local keys in memory. It sets only child-process Supabase configuration; no environment file or hosted configuration is modified. Main's normal Next.js server runs its real Route Handlers/middleware, without next/headers stubs. Fetch destinations are restricted to explicit loopback service ports and redirects fail closed; HTTP/HTTPS transport guards also block nonlocal hosts. Main is exposed only through selected read/sign-out routes plus a secret-free /__local_identity diagnostic. No public application identity route is added.

The proxy independently verifies main's environment/project identity. It contains no Supabase keys, business loaders or authorization rules. Only approved requests are forwarded; no wildcard CORS or origin rewriting. A6 verifies /__local_identity before password sign-in or trip reads. Requests use the existing bearer transport and Phase 2A JSON. Packaged assets are checked against the isolated anon key and for absence of the service-role key. Existing emulator-only cleartext permission is unchanged; no mixed-content/WSS downgrade is enabled.

## Client behavior

- The existing trip-list component receives main's summaries. Trip detail renders only real trip/role/accepted-member/round fields in TripReadScreen; it does not invent full SavedGolfTripHome/scoring props.
- These two read-only screens do not instantiate Realtime or the old scoring view, avoiding the earlier insecure WebSocket crash. No claim is made about fixing hosted Realtime or scoring.
- Native encrypted session storage and startup restoration are retained. Account IDs key screen instances so changing accounts remounts the view. In-flight trip results are discarded if the account changes.
- Phase 2B stores no new persistent trip copies. Old trip-list/detail caches across accounts are cleared on auth events and before reads; sign-out clears the signed-in account's saved screens. This deliberately replaces the earlier offline saved-trip list with an explicit network error; session restoration still works.
- 401 clears the invalid local session; 403 requests profile setup; 404 shows not found; 503 shows temporary unavailability; network loss and account changes have explicit errors. No authorization error falls back to saved trip data.
- Explicit sign-out calls main's existing strict revocation route first. A backend failure is surfaced rather than reported as success. A concurrent account switch cannot clear a different account's local session.

## Repeatable local commands

These commands require the existing Docker stack and existing SDK/AVD/dependencies. They never start/rebuild the Supabase stack or run setup.mjs/migrations.

```powershell
node scripts/mobile-local/start-main.cjs
# Separate terminal, from maroon-a6-poc:
node main-read-adapter.mjs
# From MM-Website; creates only synthetic local accounts/trip and exercises real HTTP:
node node_modules/tsx/dist/cli.mjs scripts/mobile-local/http-proof.mjs
# Existing A6 bundle and native sync, from maroon-a6-poc / android-app:
node build.mjs --android
node build.mjs
node node_modules/@capacitor/cli/bin/capacitor sync android
# With existing JDK21/SDK and project Gradle cache selected for this child process:
android/gradlew.bat -p android assembleDebug --max-workers=2 --console=plain --offline
# Install that debug APK on the existing maroon_a6 emulator, then from MM-Website:
node scripts/mobile-local/device-proof.mjs
node node_modules/tsx/dist/cli.mjs --test ../maroon-a6-poc/src/tripReads.test.ts
```

The helper requires a built main .next/BUILD_ID. Do not build over an active main server; stop the task-owned server first if rebuilding is necessary. Child-process keys are never printed. http-proof creates synthetic fixture data through existing APIs/RPCs, including membership and sign-out revocations; this is not a read-only data audit. Its ignored out/phase2b/fixtures.json contains synthetic login credentials for device tests, not bearer/refresh tokens, and must not be committed or packaged. Test result files contain only checks and non-secret environment metadata.

## Results and limits

- Real HTTP: 12 checks passed, including verified main identity, password sign-in, member list/detail, omission of private fields, outsider denial, account isolation, invalid-token denial, missing-profile 403, main sign-out and old access/refresh token rejection. No A1 imports or header stubs were used.
- Client transport automation: 8 tests passed for DTO delivery, all expected error statuses, absent sessions, environment verification, offline behavior, account-switch races, malformed responses and legacy trip-cache clearing.
- Main regression selection: 58 tests passed, preserving Phase 1/2A coverage.
- Packaged browser smoke: sign-in/list/member detail and sign-out passed. An initial root-path containment bug in the new static host was corrected before the passing run; API authorization was unchanged.
- Android bundle/Capacitor sync passed. Offline Gradle assembleDebug passed in 2m18s (27 tasks executed, 96 up-to-date); adb install -r returned Success. APK SHA-256: 1c0fc6eaf04110eeb4850fe7c0e4eb47c46c211de92d7bbb45e2dd756dfc39c5. Android 16/API36 emulator; no store upload or physical-device test.
- Installed-app final outcome: see the dated completion record below. Early attempts demonstrated sign-in, list/detail, secure storage, process-death restoration and offline errors; test harness fixes added a network-recovery wait after airplane mode and waited for actual list rendering instead of a stale readiness marker.

Evidence: ignored out/phase2b/http-results.json, device-results.json, browser-results.json, gradle.log and screenshots. The APK and generated native assets remain in the existing sibling A6 project. No raw token is persisted in evidence. Hosted staging/production, iOS, physical-device behavior and scoring remain unverified.

## Compliance review and follow-up

Status: review_required. Scope is isolated synthetic data and an existing debug Android client, not distribution. Named accountable security/policy/release owners, jurisdictions/audience ages, due dates and legal reviewers remain unassigned. Existing Phase 2A data minimization and server authorization remain in force.

Privacy/personal-data/accounts/security/audit logging: existing tokens remain in the existing secure native store; no service-role material is packaged. New reads expose only main's allowed trip roster/course fields. Verify staging isolation, logs, on-device inspection and physical-device policies before beta. Retention/deletion: no new persistent trip cache; clear old trip copies and keep synthetic credential artifacts out of version control. Define cleanup/retention ownership before ongoing testing.

IP, contractor ownership and open-source: existing A1/main UI, Capacitor/Supabase/secure-storage code and licenses remain subject to review; no dependency is added. UGC/media/golf-content/course-reviews/organizer responsibility: no new uploads, contacts or external golf data sources; existing display-name/course-label rights and visibility need review. Payments/subscriptions/taxes/advertising/sponsorship/affiliate flows are unchanged and require applicability assessment for eventual distribution. Business ownership/minors/platform rules/professional legal review remain unresolved. These findings do not authorize release.

Next smallest step: design and test the main-backed scoring screen contract around verified profile/group/card identities and the existing transaction RPCs, including attestation, retries and conflicts. Before mounting full scoring UI, provide an explicit secure Realtime strategy and durable account-scoped queue tests; never reuse the A1 loader shim or synthesize missing scoring props. Full Profile/other legacy loaders and hosted staging are separate follow-ups.
