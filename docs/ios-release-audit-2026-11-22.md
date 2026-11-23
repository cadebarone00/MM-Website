# iOS release audit — November 22, 2026

This is an initial repository and local-test audit, not an App Store readiness certification. No TestFlight build, hosted environment, App Store Connect configuration, or real iPhone was inspected. The working tree contained unrelated changes during testing.

## Findings and next actions

1. **Privacy policy and terms:** Settings currently marks both as coming soon (`components/settings/PreferenceSettings.tsx`). Obtain approved documents, publish them, link them from the app, and complete App Store privacy disclosures against actual data flows and vendors. Legal and retention questions remain open in `LEGAL_REVIEW_REQUIRED.md`.
2. **Account lifecycle coverage:** `lib/account/accessPolicy.test.ts` reports no explicit rule for `PUT /api/account/links` and `PUT /api/account/preferences`. Unmatched routes default to the restrictive active category when enforcement is enabled; this is not evidence of a public authorization bypass. Decide and document their intended lifecycle classifications, then rerun coverage and route tests.
3. **Device navigation and layouts:** Verify the locally implemented Profile and Settings header change and pull-to-refresh gesture cancellation in a new TestFlight build. Walk every reachable screen on real devices, including safe areas, keyboard, back navigation and accessibility. The iOS target currently includes iPhone and iPad and permits landscape; test those configurations or explicitly decide supported devices and orientations.
4. **Account and trip journeys:** On a designated test backend and devices, exercise signup, email verification, sign-in/out, profile editing, deletion, trip creation and invitations with multiple accounts. Verify cleanup and revocation across relevant stores; existing UI or isolated tests do not establish hosted behavior.
5. **Scoring:** Exercise actual device-to-hosted-server score entry, interruption/reconnect, concurrent edits, attestation and submission. The local focused tests and isolated database checks below are useful but do not prove production configuration, delivery or device behavior. Existing review notes also call for correction mutation binding and hosted verification.
6. **Unfinished destinations:** Inventory every route reachable from the actual release build, including the `AppComingSoon` fallback and placeholders, and finish or remove release navigation as appropriate. Do not assume development previews are production features.
7. **Apple submission:** Audit the built archive and third-party SDK privacy manifests and required-reason APIs, App Store privacy answers, permission descriptions, review account, support URL and metadata. This checkout alone cannot establish what is configured in App Store Connect or bundled by Xcode.

## Local evidence

- `npm run test:db`: passed isolated scoring migration and transaction checks, including retries, conflict handling, settlement and submission.
- Focused trip read, scoring API, queue, scoring, submission and correction tests: 132 passed.
- `lib/account/accessPolicy.test.ts`: 9 passed, 1 failed for the two unclassified endpoints above.
- `npm run test:browser`: could not build its test bundle in this Windows sandbox: esbuild reported access denied while resolving parent directories. No browser scoring result was obtained.
- The full `npm test` suite was interrupted after the coverage failure; it did not complete and should be rerun after that issue is addressed.

These findings describe the local checkout only. Deployment, App Store approval, legal compliance and real-device readiness have not been verified.
