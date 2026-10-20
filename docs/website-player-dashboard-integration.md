# Website merger phase 1: player dashboard and authentication

2026-10-20. Implementation assessment from repository source, not verification of the deployed Supabase project, native binaries, database migrations or domain configuration. Production integration and release are not approved or implemented by this phase.

## Implemented boundary and file ownership

The existing Website desktop and Website mobile groups still render `/dev-website`. Its development-only entry now accepts `?view=dashboard`; the landing-page footer's Player Dashboard link opens that view inside the same simulator frame. Return to website restores the landing view. Sign In immediately precedes Download and links to existing `/login/email`. That login is functional existing code, uses real accounts when configured, and currently lands on `/profile`; it does not authenticate the mock dashboard or promise a dashboard redirect. No credentials were submitted during verification.

`WebsitePlayerDashboard.tsx` is an independent desktop-first website composition using `playerDashboardFixture.ts`, fixed fictional content with no auth IDs or email addresses. Sections cover profile, handicap/performance, rounds, current/past trips, tournaments/results and account settings. Statistics are illustrative constants, not a second handicap/scoring calculation. Settings are read-only presentation; no fake Save, logout or privacy control invokes account APIs. Section anchors, return navigation, dashboard discovery and Sign In navigation work. No mock values are persisted or substituted into real account responses. Signed-in and signed-out visitors see the same fixture in this development view. No automatic My Dashboard replacement is implemented yet.

Marketing retains relative, presentation-only imports: no profile UI, business logic, Supabase client, service key or live profile read enters `components/marketing`. The existing root middleware/layout still has inherited session/provider/season behavior; this is not a separate runtime. Production `/dev-website` still returns not-found before selecting a view. There is no new production page, route rewrite, auth handler, schema or migration.

Only the root agent was visible in the collaboration tree at the ownership check. This task owns the new dashboard/fixture/style and this assessment; it makes narrow edits to the website entry, marketing navigation, shared workflow documentation and rendered workflow mapping. Existing uncommitted V2 scoring, simulator and compliance-registry work is outside its ownership and is preserved. No cross-agent message could be sent to agents absent from this thread.

## Existing authentication audit

| Area | Current source and behavior | Integration consequence |
| --- | --- | --- |
| Shared identity | `lib/supabase/server.ts` creates the cookie-bound anon client against `SUPABASE_URL`; the service-role client is server-side and bypasses RLS. `lib/profile/currentProfile.ts` verifies `auth.getUser()` and reads the own `profiles.id = user.id` row. | Reuse the same Supabase project/auth user and profile. Never create another user/player table or infer ownership from names, email or a URL ID. The service-client comment understates its actual wider RPC usage; assess callers rather than relying on that comment. |
| Legacy V1 portal | `app/portal/page.tsx` checks the same session/profiles, requires `is_host` or `player_slug`, redirects hosts to `/portal/admin` unless using its guarded preview. | This is a legacy entitlement gate, not the access rule for all V2 golfers. Do not reuse it to exclude modern users without a V1 slot. |
| Login | `/login` renders `LoginWelcome`; `/login/email` renders `LoginForm`. POST `/api/auth/login` resolves username to email server-side, uses `signInWithPassword`, and attempts idempotent profile initialization. | Link to the existing form now. No new form/backend. Username lookup keeps the email server-side; preserve generic credential failures. |
| Signup | `/signup` and POST `/api/auth/signup` create only the Supabase login. `lib/auth/signup.ts` validates shared password rules and provides non-enumerating existing-email replies. | Preserve verification and the single initialization path; never create or claim a second player row on the marketing side. |
| Initialization/native contract | `lib/profile/profileInitialization.ts` validates a cookie session or bearer token with Supabase `getUser`, calls `initialize_my_profile`, and supports `/api/account/initialize`. `CurrentProfile` distinguishes signed-out, missing, incomplete and complete profiles, with closed accounts treated as signed-out. | Existing code supports shared native/web identity. Actual iOS/Android build configuration and project parity still need deployment evidence. Bearer support is endpoint-specific; do not assume every account API accepts it. |
| Redirects | `LoginForm` defaults to `/profile`; `lib/auth/returnTo.ts` permits only exact invite paths. Signup is separate from complete profile setup. | `/dashboard` is currently not an allowed `next` destination. Do not add a dashboard return parameter and assume it works. A future change needs explicit allowlist and regression tests, preserving invite flows. |
| Callback/recovery | `/auth/callback` exchanges a code, initializes the account when successful, and always redirects to `/reset-password`; errors map to invalid-link. Invite/recovery fragments are handled by the password flow (`/api/auth/password-session`, `/api/auth/reset-password`). | This callback is not a general dashboard/OAuth redirect endpoint. Keep recovery isolated. Review email confirmation templates and configured redirect origins before a future dashboard callback change. No working Apple/Google OAuth was found in the inspected login form; `AuthMethods` has email plus a disabled Mobile method. |
| Sessions/logout | `middleware.ts` refreshes cookies using `getUser`; server components tolerate non-writable cookie contexts. POST `/api/auth/signout` handles local web/bearer signout; `/api/account/sessions` supports other-device/global signout with password reauthentication; password reset globally signs out. | Reuse these mechanisms, preserve revocation/deletion behavior, and never interpret a mock view as an authenticated session. Browser and native sessions need not share cookies to share the same account. |
| Legacy session descriptor | `/api/account/me` classifies host, linked player or fan. | This is a legacy session summary, not the full V2 profile read model and not a substitute for server authorization. |

## Data and authorization reuse

| Dashboard section | Existing implementation to reuse later | Authorization and limits |
| --- | --- | --- |
| Profile summary | `loadMyProfile()` in `lib/profile/myProfileServer.ts`, `getCurrentProfile()`, `loadProfileReadModel()` in `profileReadModelServer.ts` | Viewer and subject must both come from the verified current profile for a private dashboard. The read model excludes emails/auth IDs. No arbitrary client-supplied viewer identity. |
| Handicap/performance | `ProfileReadModel.modernStats`, existing `modernStats`/`calculateHandicapIndex` in `profileReadModel.ts`/`lib/handicap/whs.ts`; legacy owner summary through `getHandicapSummaryForPlayer`, archive rounds and `combinedHandicapIndexes` | Preserve current modern/legacy handling and null/unavailable states. Do not average indexes, sum duplicate rounds or invent an official handicap certification. |
| Round history | `list_profile_rounds`, `list_profile_historical_rounds` through `profileReadModelServer.ts`; underlying `player_rounds.sql` and `historical_import.sql` | Linked historical records are read through participant links, not copied; legacy duplicate imports are filtered when linked history exists. Service-role-only RPCs depend on server-derived viewer/owner IDs. |
| Golf Trips | `ProfileReadModel.trips` from `get_profile_history`; `getUserGolfTrips()` / `getGolfTrip()` in `golfTripsServer.ts` for canonical trip pages | Trips are owner-only in the read model. Membership/accepted status and profile role still gate trip detail; only organizers may see other members' emails. Do not treat public profiles as public trip lists. |
| Tournament history/results | `ProfileReadModel.tournaments`, `teamHistory`, legacy archive years/latest scorecard and existing catalog/archive adapters | History has year/team membership; it is not a universal tournament finish-position API. The preview's winner/runner-up strings remain placeholders until mapped to canonical published results/scorecards with event access checks. Never infer rank from membership or duplicate historical players. |
| Account settings | Existing `/api/account/profile`, `/privacy`, `/photo`, `/password`, `/sessions`, `/delete` and account initialization/setup helpers | Keep current ownership, validation, privacy, reauthentication, revocation and deletion checks. Add website adapters/UI only after approval. No writes from this preview. |

Privacy is enforced in `assembleProfileReadModel` and the SQL helpers as well as own-row RLS. Private non-owner profiles expose only limited identity; public profiles still exclude private trips and owner-only legacy details. `profiles.player_slug` is a historical bridge, not the modern identity. `supabase/profile_read_model.sql` and `player_rounds.sql` restrict trusted viewer-parameter functions to `service_role`; the server is responsible for deriving trusted viewer IDs. Preserve those grants and never expose a service key in client bundles. Missing functions/data must remain unavailable, not become permissive or fall back to fixture data for an account.

## Proposed production routes and access controls (not implemented)

| Proposed route | Access and behavior |
| --- | --- |
| `/` on themaroon.site | Public marketing entry only after explicit routing approval; current production homepage remains unchanged now. |
| Existing `/login`, `/login/email`, `/signup` | Reuse current Supabase auth. Future exact `/dashboard` return-path support must be explicitly approved and tested alongside invites/recovery. |
| `/dashboard` | Server-verified session on every private read; missing session goes to login, missing/incomplete profile to existing setup, deleted/revoked account denied. Load only own profile data through the existing read model. Authenticated marketing header may then show My Dashboard via a safe server-provided presentation prop. |
| `/dashboard/settings` | Same owner/session gate; reuse account endpoints and reauthentication. No user-ID parameter granting access, no service-role browser client. |
| Existing canonical trip/event routes | Keep membership, organizer and published-event rules. Dashboard summaries must not grant additional access. |
| `/dev-website?view=dashboard` | Development-only fixture view; production not-found. Must never become the fallback for failed real account reads. |

For production: keep private responses uncached across users (`private, no-store` where applicable), no shared static personalization, noindex private pages, and handle loading/empty/unavailable states distinctly. Verify deployment Supabase URLs, cookie origin/security, domain and email redirect allowlists, session refresh/revocation, CSRF/origin and rate-limit controls, account deletion, and RLS/grants in a controlled environment. Repository source is not proof those settings or SQL files are deployed. Do not broaden redirects, OAuth providers or cross-domain cookies implicitly.

## Feature/compliance review

Scope revision 1, 2026-10-20. Status: `review_required`. Extends the marketing review in `docs/marketing-website-review.md`; existing registry seed `marketing-website-development` references that review. Registry metadata is not changed in this task because it has concurrent edits. No legal clearance or release authorization is asserted.

| Categories | Findings and follow-ups |
| --- | --- |
| Privacy, personal data, retention, logging | Fictional local constants, no new collection/storage/analytics; existing inherited root requests/logs remain. Real dashboard integration requires a data-flow/retention review, notices and no cross-user cache leaks. |
| Identity, security, accounts/deletion | Existing login destination is functional; no new authentication, authorization, schema or credential handling. Private account reads/writes await approval and tests for own/other/deleted/revoked/incomplete profiles. |
| IP, media, open source, ownership | No new photos, fonts, provider or dependency. Existing brand/type/icon rights and contribution ownership still require evidence before release. |
| UGC, organizer responsibility, historical data | Fixture names/rounds/events are fictional; no posts/uploads or legacy record modification. Future rounds/trips must honor membership, visibility, provenance and canonical historical links. |
| Payments, subscriptions, taxes, advertising/sponsors | No commercial flow or placement added. Reassess if monetization is introduced. |
| Platform/provider rules, audience, professional review | Same-account native/web is a repository-supported integration direction, not verified native availability. Determine launch audience/markets, policy ownership and counsel review of claims, privacy and account behavior. |

Open follow-ups: assign feature/policy/security/release owners and review date; approve route and redirect design; verify shared-project configuration and installed SQL/grants; test auth/privacy/deletion and cache boundaries; validate canonical tournament result mapping; resolve professional-review findings before calling production-ready. All unresolved applicability remains `review_required`.

## Local verification

2026-10-20: marketing-boundary check and ESLint on the changed entry/marketing TypeScript files passed. `node scripts/test-website-player-dashboard-browser.cjs` verifies both existing simulator website groups, Sign In ordering/destination, dashboard sections, anchor/return navigation, no API writes, unknown-view fallback, and landing/dashboard widths 320/393/768/1440 without horizontal page overflow. Desktop/mobile screenshots were visually inspected. The generated workflow change panel, navigation and search were checked in Chromium. `npm run docs:workflow` and `npm run docs:workflow:check` passed.

Repository-wide `tsc --noEmit --incremental false` failed at the pre-existing untracked `app/api/golf-trips/[tripId]/round-pars/route.ts:68` (`course.pars` possibly null), outside this task. A production build was attempted with an isolated `.next-website-merger-check` output and failed fetching the existing Barlow, Barlow Semi Condensed, Inter, Roboto and Spectral Google fonts; no successful production build or deployment is claimed. The temporary build output was removed; auth/RLS/database/native deployment behavior was not exercised. These limitations do not establish a production-ready designation.

## Files changed by this phase

New: `components/marketing/WebsitePlayerDashboard.tsx`, `components/marketing/WebsitePlayerDashboard.module.css`, `components/marketing/playerDashboardFixture.ts`, `docs/website-player-dashboard-integration.md`, `scripts/test-website-player-dashboard-browser.cjs`.

Updated: `app/dev-website/page.tsx`, `components/marketing/MarketingWebsite.tsx`, `components/marketing/MarketingWebsite.module.css`, `components/marketing/README.md`, `docs/marketing-website-review.md`, `docs/app-workflow.md`, generated `docs/app-workflow.html`, and `scripts/render-workflow.cjs`. Existing uncommitted changes in these files were retained. No registry, simulator, V2, schema/migration or production auth/routing file was edited by this phase.
