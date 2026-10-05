# Golf Trip Games preview review

2026-10-02; scope revision 2; feature ID `golf-trip-games-preview`.
Decision pending. All registry categories remain `review_required`; this record is not production readiness or legal approval. Owners, professional reviewers, markets, audience ages, next review date and release build are unassigned. No deployment verified.

## Scope and data map

Before: Games was a placeholder. After: `/dev/tournament` demonstrates optional player-created side games through scope, group size, compatible games, setup and isolated v1 score calculations. It remains available in competitive and non-competitive preview scenarios. Real trip pages retain the placeholder.

| Data class | Source and purpose | Visibility, destination and lifecycle |
| --- | --- | --- |
| Fictional player names and group labels | Checked-in invented fixture; partner and cross-group selection | Preview browser only; no account identifiers or external recipients |
| Fictional course names, dates and rounds | Checked-in invented fixture; single-round scope demonstration | Preview browser only; no golf data provider |
| Game, scope, size, round, player choices, handicap preference, manual gross/net hole scores, Wolf choices, Heads/Tails sides and derived results | Local button/select interactions | Component memory only; reset on reload/unmount; no storage, invitations, exports, analytics additions or score writes |

Evidence: `lib/platform/golfTripGames.ts`, `lib/platform/game-engine/`, `components/platform/GolfGameScoringPreview.tsx`, `components/platform/GolfTripGames.tsx` and `components/platform/GolfTripHome.tsx`. No additional packages, services, assets or money/value flows. Side-game controls have no reference to official scoring or organizer Competition updates.

## Category assessment and open follow-ups

All findings below remain `review_required`. Owners and due dates are unassigned, actions open; reassess before real-data integration or release.

- Privacy, personal-data, user-accounts, retention and account-deletion: fictional data and transient selections and scores only. Engineering must map actual participant authority, visibility, invitations, deletion and retention before adding real participants or persistence; policy owners must review notices and jurisdictions.
- UGC, security, organizer-responsibility and audit-logging: predefined participant choices and bounded numeric score inputs; no free text or messages. Player-controlled UI is a demonstration, not enforced authorization. Engineering must implement participant consent/access and tenant isolation, abuse handling, score-read boundaries and appropriate audit evidence before live integration.
- Intellectual-property, contractor-ownership, open-source, media-rights and third-party-golf-content: original short descriptions, invented fixture labels and existing styles/fonts; no logos, copied rules or new dependencies. Policy/legal owners must resolve existing provenance, brand/font/license rights and contribution ownership; familiar game names do not establish clearance.
- Payments, subscriptions, taxes, advertising, sponsorship, affiliate-links and course-reviews: no stakes, prizes, purchasing, paid placements, rankings, affiliate links or monetization added. Counsel/CPA must review any future money, prizes or regulated contest interpretation. Commercial real-money wagering remains excluded by the master specification.
- Business-ownership, minors, platform-rules and legal-review: entity, intended audience, markets and distribution readiness unresolved. Policy/release owners must establish scope and complete the checklist; qualified professionals must resolve triggered questions before a production-ready designation.

Engineering acceptance evidence must establish zero official Competition writes and authorized real-player access before integration. Policy/document acceptance requires a complete category checklist and data map. Professional review must supply restricted decision references for triggered legal/tax questions. Structural registry validation cannot establish compliance or authorize deployment.

## Local validation evidence

2026-10-02: nine deterministic game-engine tests and six compliance metadata tests pass. Targeted ESLint and scoped TypeScript validation for Games/engine/compliance files pass. The repository-wide TypeScript run reports an unrelated existing badge type error in `components/platform/GolfTripHome.tsx:119`; this feature does not modify that file. The six Games components were exercised in an isolated browser harness at mobile width for setup, simulation, results, Record hole and Undo, with no runtime errors or horizontal overflow. Generated workflow HTML was opened in a browser and its change panel, mapped navigation and search checked; `docs:workflow:check` and `compliance:check` pass. These checks verify local behavior/metadata only, not production deployment, participant permissions or legal approval.

## 2026-10-02 engine scope review

Before: setup-only illustrations. After: all six v1 engines process fictional/manual local gross or supplied net scores, per-hole side choices, results and running totals. No persistence, real-player source, external service, telemetry addition, official Competition import/write, payment, subscription, advertising/sponsorship or prize is introduced. Original rule implementations follow the user-supplied defaults; existing asset/dependency provenance remains unresolved. Simulated scores are invented and are not an official handicap computation. Numeric validation and deterministic engine tests support the local engineering scope; they do not establish authorization for real players.

Privacy, personal data, UGC, security and retention follow-ups: establish participant consent/access, tenant-scoped score access/corrections, retention/deletion and abuse procedures before persistence or real-data integration. IP/professional review: resolve contribution/asset rights, intended audience/markets, organizer responsibility, provider/distribution requirements and any contest interpretation before release. No money/value flows are approved. All prior category findings remain review_required with owners/due dates unassigned and release decision pending. Engineering evidence: gameEngine.test.ts and local validation commands; no production deployment verified.


## 2026-10-02 configurable settings scope addendum

Before: organizer Games dropdown controls were inert and displayed an unconditional Started / Locked label. After: the existing sections offer typed Standard/Custom scoring settings and reset, immediate local scoring previews for the six side games and Skins, and a one-way local started lock after the first recorded hole. No redesign, official Competition update, schema/database/persistence, external data source/destination, invitation, vendor, dependency, asset, payment, subscription, advertising/sponsorship or prize is added. Settings, entered gross/net scores, hole par and derived results stay in browser component memory and reset on reload or leaving the settings route; numeric controls are bounded and validated. Existing fixtures remain fictional. The UI lock plus state edit guard is preview behavior, not server authorization.

Privacy/personal-data/retention and UGC/security findings: this adds transient scoring preferences, numeric par and optional Blind Wolf choices to the existing fictional data map; no new personal data or recipient. Before persistence or real participants, engineering must establish tenant-scoped organizer authority, immutable started configurations, score correction/audit rules, visibility, consent and retention/deletion. IP/media/provider findings: no copied rules, new third-party assets or provider calls; existing contribution, brand/font/license provenance and distribution-channel requirements remain unresolved. Payments/subscriptions/advertising/sponsorship findings: numeric points have no money or redeemable value; no monetization, stakes or prize flow is introduced. Organizer/professional legal review findings: game-option semantics and intended audience/markets require accountable owner and applicable professional review before live integration; no release clearance is inferred. All prior category findings and release decision remain review_required/pending, with owners and due dates unassigned. No deployment verified.

Engineering evidence: `scoringConfig.test.ts` covers Standard parity, configurable awards/options, handicap precedence, numeric validation, per-round carryovers and state edits rejected after start. Focused UI verification checks the same disabled fieldset and local started transition. Policy/professional follow-ups above remain open; tests cannot establish legal compliance.

## Library dialog presentation follow-up - 2026-10-05

The small scope sheet becomes a centered, scrollable library containing existing setup. All six definitions appear immediately; scope and optional group filters remain local. Selecting without a size filter initializes the first supported non-single size. Native dialog provides modal focus and Escape dismissal; Close/backdrop clicks dismiss too. No new collection, persistence, sharing, UGC, vendors, assets, payments, subscriptions, advertising/sponsorship or permissions are introduced. Fictional players/rounds and scoring remain in component memory until unmount/reload. Existing privacy/personal-data, IP/open-source, security, retention, platform/provider and professional legal findings remain review_required; prior owner/reviewer follow-ups remain unresolved. No deployment or legal clearance is asserted. Evidence: components/platform/GolfTripGames.tsx and its CSS module.

Validation: focused ESLint and workflow generation/source matching passed. Browser checks passed for all six library entries, Wolf setup/scoring, round selection, reopening, Escape dismissal and workflow change panel/navigation/search. Phone screenshot inspected locally. Deployment not verified.
