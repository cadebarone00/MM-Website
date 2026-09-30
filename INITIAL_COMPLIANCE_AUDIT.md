# Initial Compliance Audit

Date: 2026-09-29. Baseline HEAD observed: `4af173ae4bb3e6080c71bdf1c3b63e0dd7158e39`, plus the current working tree. Other agents are actively changing the repository; this is a source snapshot, not a release certification or a guarantee that later code is unchanged.

## Scope and method

Read-only inspection of representative application routes/helpers, checked-in SQL, dependency manifests/lockfile/local license metadata, static data references, footer links and existing compliance documents. Searches covered authentication/permissions, table definitions/RLS, media upload/deletion, browser storage, common analytics/payment integrations, deletion/export and policy acceptance.

No protected file was modified. No packages were installed. No production queries, migrations, backups, invitations, uploads, payments or account actions were run. This audit did not execute scoring/tenant tests, penetration tests, a vulnerability-feed scan, or end-to-end production checks. Existing test files are evidence of intended verification only, not tests passed during this audit. Configuration secrets, personal production records and private contracts were not inspected.

Migration text does not prove a migration was deployed; code guards do not prove every endpoint is guarded. RLS is bypassed by service-role calls. Repository comments are not treated as stronger evidence than implementation. For example, the service-client comment describes a narrower use than the multiple service-role call sites observed.

Read with [DATA_INVENTORY.md](DATA_INVENTORY.md), [OPEN_SOURCE_LICENSES.md](OPEN_SOURCE_LICENSES.md), [LEGAL_REVIEW_REQUIRED.md](LEGAL_REVIEW_REQUIRED.md), and the existing [master spec](LEGAL_COMPLIANCE_SPEC.md)/[checklist](FEATURE_COMPLIANCE_CHECKLIST.md). No feature-registry status is changed by this document.

## Ratings

| Rating | Meaning |
| --- | --- |
| GREEN | **No obvious implementation gap identified.** Limited to the stated inspected control; not legal certification, a security guarantee or deployment verification. |
| YELLOW | Partial controls or incomplete evidence; further verification/implementation may be needed. |
| RED | A specific observed implementation gap or missing workflow needs resolution before claiming readiness for the affected scope. Not a legal violation finding or an instruction to modify protected code. |
| LEGAL REVIEW | A rights, policy, jurisdiction, commercial or tax question requires professional/business review. Does not assert that use is unlawful. |

## Findings

### A-01 Authentication — RED

- **Evidence:** [signup route](app/api/auth/signup/route.ts), [username matcher](lib/portal/matchPlayerUsername.ts), [login route](app/api/auth/login/route.ts), [requirePlayer](lib/portal/requirePlayer.ts), [password session](app/api/auth/password-session/route.ts).
- **Observed:** Supabase Auth handles password/session operations; routes verify users with `getUser()`. Login escapes username LIKE patterns and uses a dummy login for unknown usernames. Password-session exchange checks same-origin JSON. Signup matches an unclaimed reserved username and sets `profiles.player_slug` before claiming the slot.
- **Gap:** The inspected signup claim path checks username/unclaimed status but does not compare the signup email to the on-file slot email or require an invitation/organizer approval before linking that player identity. A reserved username is not demonstrated proof of entitlement to a player's scoring/profile identity. Email verification of a new account, by itself, does not prove that linkage.
- **Next / owner:** Identity engineering owner (unassigned): design and verify rightful-player claim binding, recovery and abuse/rate controls in a separately authorized change; LR-21/22. Do not claim exploit success: no attack or account creation was performed. Supabase anti-abuse/MFA settings remain unverified.

### A-02 Account/profile data — YELLOW

- **Evidence:** `profiles` and own-row SELECT in [base schema](supabase/schema.sql), [signup](app/api/auth/signup/route.ts), [public name endpoint](app/api/players/names/route.ts), [data inventory D-01–04](DATA_INVENTORY.md).
- **Observed:** Email, display name, username and account/player linkage are stored; writes use service role. Selected display names are intentionally exposed publicly through a separate reader.
- **Gap/limit:** Source-row RLS alone does not describe downstream publication. No approved minimization, contact/privacy notice or per-class retention decision was observed. Actual stored rows and deployed policies were not checked.
- **Next / owner:** Privacy/product and identity owners (unassigned): validate field-level purposes and public/private projections; LR-02/15/21.

### A-03 Tournament memberships — YELLOW

- **Evidence:** `tournament_members`, `tournament_creator_access`, `profiles.platform_role` and grants in [foundation SQL](supabase/platform_foundation.sql); [legacy host guard](lib/portal/requireHost.ts).
- **Observed:** Foundation defines owner/organizer/player/viewer roles with RLS and service-role access. Legacy administration uses `is_host`.
- **Gap/limit:** Existence of role tables does not prove all routes enforce tournament membership, revocation or ownership transfer. Deployment, live membership population and pending migration work were not verified.
- **Next / owner:** Platform/security owners (unassigned): after the parallel architecture review, verify a route/action/role matrix and revocation cases in an authorized environment; LR-18/21. No role migration changes are made here.

### A-04 Tenant isolation — YELLOW

- **Evidence:** Composite edition/roster foreign keys and restricted grants in [foundation SQL](supabase/platform_foundation.sql); [edition scope helper](lib/platform/editionScope.ts); public legacy SELECT policies in [base schema](supabase/schema.sql).
- **Observed:** The inspected helper rejects non-Maroon live-table scopes; existing filters still use `season_year`. Foundation composite keys constrain certain cross-tenant roster relationships. These are useful safeguards for their stated scope.
- **Gap/limit:** Arbitrary-tenant private live scoring is not established. Foundation constraints and a tournament privacy field cannot make all legacy public readers tenant-private. C3/C4 completion and deployed RLS are outside this audit.
- **Next / owner:** Platform/security owners (unassigned): require negative cross-tenant tests and private/public reader review before widening scope; LR-18/21. This is a readiness limit, not a demonstrated data leak or a request to change C3.

### A-05 Live scoring — YELLOW

- **Evidence:** [hole route](app/api/portal/scoring/hole/route.ts), [reliability SQL](supabase/scoring_reliability.sql), [publication SQL](supabase/live_match_publication.sql), [local queue](lib/live/useHoleQueue.ts).
- **Observed:** The inspected write route derives player/actor from a verified session, validates input and invokes a reliability RPC with request identity and expected prior submission. Publication retry/audit structures and local queued drafts exist.
- **Gap/limit:** Actual RPC deployment, every write/read route, replay/dispute behavior and scoring privacy were not exercised. Public score/history and persistent device data need retention/visibility decisions.
- **Next / owner:** Scoring/privacy owners (unassigned): retain separate scoring verification evidence and define disclosure/deletion rules; LR-02/15/22. No scoring code or database test was changed/run.

### A-06 Admin permissions — YELLOW

- **Evidence:** [requireHost](lib/portal/requireHost.ts), representative [invitation](app/api/portal/admin/invite/route.ts) and [video](app/api/portal/admin/scorecards/video/sign/route.ts) routes.
- **Observed:** The shared guard verifies Auth identity and server-read `profiles.is_host`; inspected sensitive operations call guards rather than trust a client host flag.
- **Gap/limit:** This global legacy privilege is not a tenant-scoped organizer policy. No complete route coverage, privileged-access recertification or deployed privilege audit was performed.
- **Next / owner:** Security/platform owners (unassigned): verify least privilege and privileged action coverage after migration review; LR-18/22.

### A-07 Player profiles — YELLOW

- **Evidence:** [profile route](app/api/portal/profile/route.ts), [editable fields/overrides](lib/data/players/overrides.ts), [profile types](lib/data/types.ts).
- **Observed:** Proposed edits require player linkage, a permitted field and bounded values. Approved overrides are public. Optional profile fields include birthday/age, physical attributes, residence, employment and social links.
- **Gap/limit:** Moderated edits do not establish participant consent, minimization, minor handling or safe removal of static fallback fields. Public publication authority and completeness of review remain unresolved.
- **Next / owner:** Privacy/content owners (unassigned): approve each public field and test removal/correction end-to-end; LR-02/03/11/21.

### A-08 Invitations — YELLOW

- **Evidence:** [invite route](app/api/portal/admin/invite/route.ts), [slot email SQL](supabase/player_slots_email.sql), [password-session helper](lib/auth/passwordSession.ts).
- **Observed:** Host authorization, use of an on-file address, duplicate-claim checks and failure cleanup are present. Supabase sends an actual invitation and creates account/profile/claim state.
- **Gap/limit:** No complete invitation permission/notice history, recipient correction/suppression process or delivery-vendor retention assessment was observed. Provider expiry/revocation and failures require environment verification.
- **Next / owner:** Communications/identity owners (unassigned): review recipient authority, token lifecycle and operational recovery; LR-02/21/23. No invitation was sent.

### A-09 Media — RED

- **Evidence:** Shot-video [sign](app/api/portal/admin/scorecards/video/sign/route.ts)/[confirm](app/api/portal/admin/scorecards/video/confirm/route.ts), [R2 URL helper](lib/r2/client.ts), [playlist delete](app/api/portal/admin/broadcast/playlist/delete/route.ts), [URL import](app/api/portal/admin/broadcast/playlist/upload/from-url/route.ts).
- **Observed:** Host or owning-player checks and scorecard linkage checks precede shot-video signing. URLs expire after 300 seconds. Confirm writes metadata/public playback references; it deliberately performs no object inspection. URL import has host restrictions, type/size checks and a basic hostname SSRF filter.
- **Gap:** Shot-video signing accepts any string extension without an allowlist and has no inspected byte/type validation step; confirm does not verify object content/existence. Playlist deletion continues to remove the database reference when object deletion fails, leaving a potential orphan with no demonstrated cleanup workflow. The URL-import comments explicitly acknowledge incomplete DNS-rebinding hardening.
- **Next / owner:** Media/security/content owners (unassigned): define validated uploads, orphan reconciliation, robust URL-fetch boundaries and rights/moderation/takedown processes; LR-03/04/06/20/22. No exploit, bucket configuration or actual orphan object was verified.

### A-10 Analytics — YELLOW

- **Evidence:** Dependency/import searches in `package.json`, `app`, `lib`, `components` for common analytics/event SDKs; observed console errors, Auth middleware and R2/provider usage.
- **Observed:** No dedicated product analytics integration or analytics table was identified in those searches.
- **Gap/limit:** This does not rule out hosting dashboards, Auth/storage logs, injected scripts, external embeds or development/build telemetry. No production network or vendor-console audit occurred.
- **Next / owner:** Privacy/operations owners (unassigned): inventory actual configured telemetry before making tracking/consent claims; LR-02/24.

### A-11 Open-source dependencies — LEGAL REVIEW

- **Evidence:** [full inventory](OPEN_SOURCE_LICENSES.md), `package.json`, lockfile and local metadata/license text.
- **Observed:** All 20 direct dependencies and 507 lockfile entries were inventoried; 400 have local installed metadata and 107 are lockfile-only. LGPL-containing Sharp/libvips declarations, MPL packages, CC-BY data and bundled notices need attention. Lucide's license file includes MIT-covered derived icons beyond its ISC metadata label.
- **Gap/limit:** Declared licenses are not a final distributed-component notice manifest or commercial-use clearance. Native/browser binaries, Next bundled components, fonts, assets and contractor ownership are not fully reconciled. No vulnerability audit was performed.
- **Next / owner:** Engineering/IP owners and counsel (unassigned): reconcile target artifacts, notices/source obligations and unknown asset provenance; LR-05/06/19.

### A-12 Audit logging — YELLOW

- **Evidence:** `live_score_audit_events` in [publication SQL](supabase/live_match_publication.sql), publication jobs/receipts in [reliability SQL](supabase/scoring_reliability.sql), [backup tooling](scripts/backup-production.ts).
- **Observed:** Scoring events record actor, type, time and JSON context. The audit table has RLS and no public SELECT policy in the inspected SQL.
- **Gap/limit:** This does not demonstrate a general log for policy assent, access grants/revocation, deletion/export, moderation or financial actions. No approved audit retention/redaction/hold policy or deployed tamper/access verification was observed.
- **Next / owner:** Security/privacy owners (unassigned): define necessary event coverage and minimal payloads, access and retention; LR-15/22.

### A-13 Account deletion — RED

- **Evidence:** Account routes under `app/api/auth`, signup/invite `auth.admin.deleteUser` failure rollback calls, [base schema foreign keys](supabase/schema.sql), [signout route](app/api/auth/signout/route.ts), [data inventory](DATA_INVENTORY.md).
- **Observed:** Signout and failed-provisioning cleanup exist. SQL includes some cascades/set-null behavior and restrictive relationships; static player data/media/history are separate stores.
- **Gap:** No dedicated authenticated deletion-request/fulfillment route, cross-store erasure orchestration, exception tracking or user-facing deletion workflow was identified in the inspected code. Rollback cleanup and signout do not provide that capability.
- **Next / owner:** Privacy/identity owners plus counsel (unassigned): define requests/verification, transfer/retention exceptions and test all-store fulfillment before promising deletion; LR-15/21. A manual off-repository process may exist but was not evidenced.

### A-14 Data export — RED

- **Evidence:** [backup script](scripts/backup-production.ts), [table export helper](lib/platform/tableBackup.ts), API route search, [data inventory](DATA_INVENTORY.md).
- **Observed:** Service-role operator tooling exports REST-exposed tables to local JSON for backups.
- **Gap:** No subject-scoped, identity-verified portability/request workflow with safe delivery was identified. Bulk operator backup is not an appropriate user export and is not proven to cover Auth objects/media or all derived records.
- **Next / owner:** Privacy/identity owners (unassigned): define scope, third-party redaction, secure delivery and evidence of completion with counsel's applicability assessment; LR-02/21. No export was executed.

### A-15 Policy acceptance and published policies — RED

- **Evidence:** [Footer](components/Footer.tsx) maps Privacy Statement and Terms Of Use to `#`; [signup route](app/api/auth/signup/route.ts) accepts name/email/username/password; route/source/schema searches for policy/terms version acceptance.
- **Observed:** Existing compliance documents are internal frameworks, not approved public policies. No versioned acceptance record was identified in inspected signup/schema paths.
- **Gap:** Placeholder footer links cannot communicate actual policies. No demonstrated approved-policy publication/versioning and assent evidence process was found where required by the eventual reviewed design.
- **Next / owner:** Business/privacy owners + counsel and frontend/identity engineering (unassigned): approve actual policies, determine notice/assent requirements, publish working links and record required versions; LR-01/02/16. Do not invent legal boilerplate or imply every privacy notice requires contractual consent.

### A-16 Payment infrastructure — LEGAL REVIEW

- **Evidence:** `package.json`, payment-provider searches across app/lib/components, [product monetization plan](THE_MAROON_PRODUCT_SPEC.md), [entitlements](lib/platform/entitlements.ts).
- **Observed:** No implemented Stripe/PayPal/Paddle checkout/payment-provider flow was identified. Platform plan/entitlement data and MM Coins are separate from card billing.
- **Gap/limit:** Merchant/seller roles, refund language, payment scope, accounting and tax decisions are not established. This is future readiness work, not a claim that an existing card flow mishandles payments.
- **Next / owner:** Commercial owner + counsel/CPA (unassigned): resolve LR-08/09/10 before collecting payments; authorize engineering separately.

### A-17 Subscription infrastructure — LEGAL REVIEW

- **Evidence:** [entitlements](lib/platform/entitlements.ts), `platform_plans` in [foundation SQL](supabase/platform_foundation.sql), [product spec](THE_MAROON_PRODUCT_SPEC.md).
- **Observed:** Plans grant features; source does not establish a recurring billing/cancellation system. Product architecture describes paid provider integration as later work.
- **Gap/limit:** No verified subscription assent, renewal/trial rules, cancellation/refunds or provider event reconciliation exists in the inspected paths.
- **Next / owner:** Commercial owner + counsel/CPA (unassigned): approve rules/markets/channels and verify billing behavior only when implemented; LR-07/08/09/10.

### A-18 Advertising and sponsorship — LEGAL REVIEW

- **Evidence:** [sponsor data](lib/data/sponsors.ts), [footer display](components/Footer.tsx), application/dependency searches for ad/affiliate integrations.
- **Observed:** Sponsor logos are displayed from static assets; the footer uses sponsor wording. No automated ad-network or affiliate-accounting integration was established by this review.
- **Gap/limit:** A sponsor label alone does not establish rights, contract terms, claim substantiation or adequate disclosure for every relationship. Tracking/vendor configuration remains unknown.
- **Next / owner:** Commercial/editorial owner + counsel/CPA (unassigned): inventory relationships, rights, consideration, disclosure placement and any tracking; LR-06/12/13/14/24.

### A-19 Wagers/fantasy — LEGAL REVIEW

- **Evidence:** MM Coins tables/policies in [schema](supabase/schema.sql); [fantasy team](app/api/fantasy/team/route.ts)/[leaderboard](app/api/fantasy/leaderboard/route.ts) routes; [product boundary](THE_MAROON_PRODUCT_SPEC.md).
- **Observed:** Account-linked MM Coins bets and authenticated fantasy team/leaderboard code exist for Maroon. Fantasy readers reference `fantasy_teams`; the SQL search did not locate its CREATE TABLE definition. Real-money wagering is excluded from commercial V1 in the product architecture.
- **Gap/limit:** Labels such as coins/fantasy and entitlement flags are not legal clearance. Live table policies, consideration/prize/value flows, audience/geography and all endpoint gating were not verified.
- **Next / owner:** Business owner + qualified gaming counsel/CPA (unassigned): assess current Maroon scope and keep real-money wagering excluded from commercial V1; LR-17. No expansion, payment wiring or migration is authorized here.

### A-20 Security controls — YELLOW

- **Evidence:** [Next headers](next.config.ts), [cookie/service clients](lib/supabase/server.ts), [middleware](middleware.ts), [password-session origin check](app/api/auth/password-session/route.ts), A-01/A-09.
- **Observed:** HTTPS/HSTS, same-origin frame policy, nosniff and referrer-policy headers are configured; representative routes verify sessions and server privileges; secrets are referenced through server environment variables in inspected helpers.
- **Gap/limit:** No common application rate limiter/CAPTCHA was identified in sampled Auth routes; provider/edge defenses are unknown. CSP is not configured in inspected Next headers. CSRF/origin coverage across all mutations, secret handling across the whole repo, deployed headers, dependency vulnerabilities and incident controls were not verified. A-01/A-09 remain concrete follow-ups.
- **Next / owner:** Security/operations owners (unassigned): perform scoped threat-model and deployment verification, prioritize identity/media gaps and document incident response; LR-21/22. Missing evidence is not proof of a deployed exploit or absent provider controls.

### A-21 Configured baseline browser headers (narrow control check) — GREEN

- **Evidence:** [next.config.ts](next.config.ts) global header list.
- **Observed:** HSTS, SAMEORIGIN framing, nosniff and strict-origin-when-cross-origin referrer policy are configured explicitly.
- **Finding:** **No obvious implementation gap identified** in declaring these four baseline headers in the inspected config. This does not rate the whole security program green, attest CSP completeness, validate production responses or certify compliance.
- **Next / owner:** Operations owner (unassigned): verify actual release responses/edge behavior as deployment evidence; retain A-20 follow-up.

## Prioritized follow-up, without changing protected code

1. **A-01:** establish rightful player-identity claim binding before broader account onboarding; track through LR-21.
2. **A-09:** validate media uploads and provide reliable deletion/orphan handling before broader hosted-media availability; track through LR-20/22.
3. **A-13/14/15:** resolve account deletion/export and working public policy/required assent processes before claiming commercial compliance readiness; track LR-01/02/15/21.
4. **A-03/04/06:** let the parallel architecture review finish, then verify scoped role/tenant boundaries against a fixed release and an authorized environment. Do not treat migration source as deployed proof.
5. **A-11/16–19:** obtain target-artifact rights review and professional commercial/tax/gaming decisions before the relevant expansions. Real-money wagering remains excluded from commercial V1.

All proposed accountable owners are unassigned. Completion requires a named owner, precise scope/version, accepted evidence and appropriately qualified review through the existing checklist/registry. No finding is silently converted into a compliant registry status.

## Verification performed for these artifacts

Checked local package/version/license evidence and exact lockfile paths, compared direct dependencies with the inventory, and reviewed source references for findings. Artifact checks passed for local Markdown links and coverage: 507 package entries, 22 data categories with explicit unresolved retention, 24 professional-review items and 21 audit findings. A consistency check also verified the inventory's lockfile hash, installed/locked versions and declared licenses. Writes for this task were confined to the four new documentation artifacts; the existing framework and protected application files were not edited. These checks do not test the production application or resolve legal questions.

## What changed

2026-09-29 — Documentation-only initial audit. Recorded observed controls, concrete gaps, unknowns and professional-review triggers. No remediation, protected-code edit, migration, database operation, deployment or legal certification occurred.
