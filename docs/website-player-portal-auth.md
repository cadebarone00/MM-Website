# Player Portal phase 2: website authentication

2026-10-21. Implemented in source; no deployment or live-account certification. This supersedes the phase 1 route proposal in `website-player-dashboard-integration.md`.

## Implemented behavior

- Website Sign In remains next to Download and opens `/login/email?next=%2Fdashboard`. After successful existing Supabase password authentication, a full browser navigation loads the validated destination, refreshing server-rendered session UI. The app default without an allowed `next` is still `/profile`. Existing exact golf-trip/tournament invite returns remain accepted.
- `authReturnPath` permits only exact `/dashboard` and the existing invite patterns. Schemes, external origins, protocol-relative destinations, dashboard queries/fragments/subpaths and encoded lookalikes are rejected. `withReturnTo` validates before constructing links. Login welcome, signup and recovery links carry only validated destinations.
- `/dashboard` is a dynamic, noindex website page. Its server adapter calls the existing `getCurrentProfile()` and redirects signed-out accounts to the existing email login with the fixed dashboard return. It never takes a profile ID from a query/body. Only `complete`, display name and username cross into presentation: no account IDs, email, tokens or historical player slug. Missing/incomplete profiles show existing `/profile` setup access rather than fictional identity. Existing closed-account/session conventions remain authoritative; data failures do not fall back to fixtures.
- The website's server entry supplies an external account-actions slot. Signed-out navigation has Sign In plus Download; signed-in navigation has My Dashboard, Download and Sign Out. Sign Out calls the existing local-session endpoint, checks success and fully navigates to website login. Errors stay on-page with a retry message. The existing endpoint now surfaces Supabase signout errors instead of claiming success; local scope, native bearer support, optional push cleanup and other-device behavior remain.
- Account access uses the existing `/profile` account/setup screen. Only basic profile identity is wired to real data. Handicap, rounds, Golf Trips and tournament results explicitly say they are not connected, with no mock numbers, placeholder scores or pretend account preferences. The isolated design fixture remains directly accessible at `/dev-website?view=dashboard`; the primary marketing footer now opens real `/dashboard`.
- Marketing remains presentation-only. Its server route may import the two explicitly allowlisted server/slot adapters; marketing modules cannot import those adapters, Supabase or business engines. `next/link` is allowed as a presentation dependency. No user table, independent token store, schema, migration, RLS policy, production homepage or deployment configuration is changed.

## Verification and recovery

Website signup and resend opt into `emailRedirectTo` with `/auth/callback?flow=website-verification` only when the validated destination is `/dashboard`. Requests without that exact website destination keep existing Supabase signup/resend options.

The callback still exchanges a PKCE code using the existing cookie-bound Supabase client and idempotent profile initialization. Website verification continues to a fixed `/auth/website-complete` page. That page reuses the existing verified-session exchange: PKCE cookie sessions are checked server-side; implicit email fragments are removed from browser history and exchanged through the existing same-origin `/api/auth/password-session` endpoint. A valid completion navigates to `/dashboard`; an invalid link displays a sign-in/resend path and cannot fall back to a different session when error/partial-fragment information is present.

Recovery and admin-invite flows without the website verification marker still go to `/reset-password`. Website recovery carries `returnTo=/dashboard` into that form's validated `next`; it never skips password reset. The existing password-update endpoint and global signout remain unchanged. Afterwards, website users return to website login and app users retain `/login`. An invalid website password link can request a replacement without losing the continuation.

No Supabase provider configuration or email template was edited. Live verification depends on the existing Supabase project's Site URL, redirect allowlist, email templates/delivery and PKCE same-browser requirements. Those settings, real delivered links and native binary project configuration require credentialed review. This implementation does not establish that they are deployed correctly.

## Tests and limitations

Automated unit tests cover redirect allowlisting/open-redirect inputs, unchanged invite paths, website verification/recovery destinations, existing password-session fragment clearing/error handling, signup rules, basic-identity projection (excluding sensitive fields), and signout success/failure transport behavior. The browser script uses a fresh signed-out context and explicitly mocked credential/session responses where noted. Full browser execution was blocked as described below; scripted assertions are not automatically counted as completed tests. No user was created, no real password submitted and no email requested.

Run:

- `node node_modules/tsx/dist/cli.mjs --test lib/auth/returnTo.test.ts lib/auth/websiteFlow.test.ts lib/auth/passwordSession.test.ts lib/auth/signup.test.ts lib/website/playerIdentity.test.ts lib/website/signOut.test.ts`
- `node scripts/test-website-auth-browser.cjs`
- `node scripts/test-website-player-dashboard-browser.cjs` for the separate design reference and both marketing preview groups.
- Scoped ESLint, `node scripts/check-marketing-boundary.cjs`, repository TypeScript and workflow generation/check.

| Test | Evidence boundary |
| --- | --- |
| Signed-out dashboard access, including supplied profile ID | Actual local guarded route, fresh browser; no credentials required. |
| Desktop/mobile website login links | Scripted, but not reached successfully in this run because page navigation timed out. |
| Successful website vs default V2 redirect and hostile destination | Return-path unit tests passed. Browser success-response mocks are scripted but were not reached in this run; no real Supabase credential acceptance tested. |
| Password reset website vs V2 continuation | Callback/return-path and fragment/recovery unit tests passed. Browser form submission assertions were not reached. No delivered email or real password change. |
| Verification completion/error | Fixed callback paths and PKCE/fragment helper behavior unit-tested. Browser completion/error assertions were not reached. |
| Sign Out | Transport success/failure unit tests. Real session revocation and signed-in header lifecycle need an approved test account. |
| Real private identity, refresh/persistence and My Dashboard | Require approved Supabase test credentials; not represented by a mocked login success. |
| Actual email verification/recovery and cross-device flows | Require approved mailbox, test credentials and configured redirect origins. Not exercised against a real user. |

### Existing check failures investigated

The earlier `round-pars/route.ts:68` error arose because the course-load result allowed `pars` to be null even after the success status check. At continuation, other in-progress work had already changed the result to a discriminated union: `status: ok` includes `pars: number[]`; unavailable statuses do not. This phase made no golf API/type/scoring changes and does not claim ownership of that fix. TypeScript is rerun against the current workspace to report its current state.

The production build was retried in `.next-website-auth-check` without modifying deployment configuration. It still failed fetching the five pre-existing Google Fonts (Barlow, Barlow Semi Condensed, Inter, Roboto and Spectral). A direct connection probe to `fonts.googleapis.com:443` also failed. This is a build-time network dependency from existing root/notification components, not a new auth dependency. No font replacement, network/proxy configuration or production deployment change was made. A successful production build remains unverified.

## Feature review

Scope revision 1, 2026-10-21. Status: `review_required`. Read against `LEGAL_COMPLIANCE_SPEC.md`, `FEATURE_COMPLIANCE_CHECKLIST.md` and the existing feature registry. The marketing review references this assessment; registry metadata is unchanged.

| Categories | Findings / remaining evidence |
| --- | --- |
| Privacy, personal data, retention, logging | Real display name/username now appear only after server session validation. No new collection, analytics or persistence. Confirm notices, inherited provider/log retention and user-isolated caching with credentialed tests. |
| Accounts, security, deletion, minors | Existing auth/RLS/ownership path reused. No client-selected private owner. Verify revoked/deleted/incomplete accounts, refresh, session revocation and deployment audience before release. |
| IP, ownership, media, open source | No new media, vendors or dependencies; existing fonts/brand/icon rights and contribution ownership still need release evidence. |
| UGC, organizer and historical records | No posts, uploads, scores, memberships or historical links changed. Real golf sections remain unconnected; no duplicated player records or scoring/handicap calculations. |
| Payments, subscriptions, tax, advertising/sponsorship | No monetary flow or placement introduced. Reassess if scope expands. |
| Platform/provider rules and professional review | Confirm Supabase redirect/email settings and native/web shared-project deployment, policy ownership, markets and counsel review. All unresolved questions remain `review_required`; tests are not compliance or deployment clearance. |

## File scope

Route/session composition: `app/dashboard/page.tsx`, `app/dev-website/page.tsx`, `components/nav/SiteChrome.tsx`, `lib/website/playerSession.ts`, `playerIdentity.ts` and tests; real website presentation/account controls in `WebsiteAccountDashboard.tsx`, `WebsiteAccountActions.tsx`/CSS and `lib/website/signOut.ts`/tests.

Auth continuation: `lib/auth/returnTo.ts`/tests, `websiteFlow.ts`/tests; existing login/welcome/signup/forgot/reset forms and page entries; signup/resend/forgot/signout APIs; existing callback and new `app/auth/website-complete/page.tsx`/`WebsiteVerification.tsx`. Existing V2 default destination and native UI are preserved.

Boundary/verification/docs: marketing navigation, scoped boundary allowlist, browser scripts, marketing README/review, phase 1 assessment status, workflow Markdown/generated HTML and renderer mapping. Unrelated in-progress golf/detection files are preserved. No commit or deployment performed by this task.

## Final verification results for this run

2026-10-21: 17 unit tests passed; scoped ESLint, marketing-boundary and repository `tsc --noEmit --incremental false` passed. Workflow Markdown/HTML generation and consistency check passed; the change panel, navigation and search were opened and checked in Chromium. The original round-pars nullability error is no longer present in the current workspace; no golf-source fix was made by this task.

Browser attempts on the normal dev server reached and passed the signed-out dashboard guard once, including an untrusted profile ID, then timed out loading the marketing page while inherited season requests failed under restricted outbound access. A supplemental isolated attempt using the existing fake-Supabase infrastructure also timed out during cold app compilation, including a retry with a 180-second navigation limit. It did not complete signed-in checks. Temporary isolated-server/font mocks and helper changes were removed; no production font or deployment configuration was changed. The reusable browser script remains for a configured environment. No real credential, private-profile, refresh-token renewal, real signout revocation or delivered-email test is claimed.

The normal production build still failed on existing Google Fonts downloads, and a direct public-font connection probe failed. Build output was removed. No successful production build, commit or deployment was performed by this task.
