# Golf Trip competition preview review

2026-10-02; scope revision 2; feature ID `golf-trip-competition-preview`.
Decision: pending; all registry categories remain `review_required`. No production-readiness or deployment approval is asserted. Accountable owner, jurisdictions, audience, reviewers and next review date remain unassigned.

## Scope and evidence

Before: Competition was a styled placeholder. After: local organizer settings under settings wheel > Organizer > Competition and a read-only Golf player view share round configuration in development-layout React state across client navigation. Evidence: `lib/platform/golfTripCompetitionPreview.ts`, `components/platform/GolfTripCompetition.tsx`, and `components/platform/GolfTripHome.tsx`. The development-only `/dev/tournament` route supplies fictional data; no additional vendors, packages or assets are introduced.

| Data | Source/purpose | Visibility/storage/lifecycle |
| --- | --- | --- |
| Fictional round dates, courses, format, flags and explicit status | Checked-in preview fixture; demonstrate UI | Local browser React state; both visual views; retained across client navigation, reset on reload; no writes, exports or backups |
| Format and boolean edits | Preview controls; configure demonstration | Same local state; no personal data fields or free-text input |

## Findings and follow-ups

- Privacy, personal data, retention, deletion, accounts and UGC: no new collection or persistent storage in this scope. Before real data integration, map participant visibility, organizer authority, retention/deletion and notices. Status: `review_required`.
- Security, organizer responsibility and audit logging: visual organizer/player distinction is not authorization. Started status guards individual and bulk local updates only. Before live integration, implement server authorization, authoritative start state, concurrency protection and review appropriate audit evidence. Status: `review_required`.
- Intellectual property, contractor ownership, open source, media rights and third-party golf content: reuse app styles and fonts; invented course labels; no new packages, logos or copied media. Existing rights and contribution provenance remain unresolved. Status: `review_required`.
- Payments, subscriptions, taxes, advertising, sponsorship, affiliate links and course reviews: no money, prizes, rankings, marketing or provider integrations are added. Nassau is a boolean label only. Counsel must assess any later stakes, prizes or financial interpretation before activation. Status: `review_required`.
- Business ownership, minors, platform rules and legal review: operating entity, markets, audience and distribution readiness are not established by this prototype. Assign policy/release owners and qualified review before a real release. Status: `review_required`.

All follow-ups are open, owners and due dates unassigned. Engineering must supply real-data authorization/locking tests before integration; policy owners must complete the category checklist and data map; counsel/CPA must resolve triggered questions. This record describes the narrow prototype and does not waive existing unresolved requirements.

## 2026-10-02 navigation scope review

Organizer controls moved from Golf to the Competition card in the development settings wheel. Existing format, flags and started-round guards are reused. No new personal data, UGC, vendors, assets, payments, subscriptions, advertising or sponsorship are introduced. Retention remains memory-only until reload or leaving the preview layout; no storage or server writes. The preview selector is not permission enforcement. Existing IP, provider/platform, security and professional legal-review follow-ups above remain review_required; this move does not establish release readiness. Evidence: app/dev/tournament/layout.tsx and components/platform/GolfTripCompetitionPreviewProvider.tsx. Registry metadata is unchanged.

## 2026-10-02 presentation and summary scope review

The Organizer Competition box now displays fictional days, round numbers and courses and opens the existing settings screen. The screen reuses the site maroon/gold palette and Spectral font. No additional data collection, storage, permissions, vendors, UGC, money flows, advertising, sponsorship or provider integration is introduced. Existing privacy, retention, security, IP, platform and professional-review follow-ups remain review_required. Deployment is not verified. Evidence: components/platform/GolfTripSettingsPreview.tsx and the settings/competition CSS modules.

## 2026-10-02 intermediate round-selection scope review

Supersedes the summary placement above: Competition is title-only; a separate sheet lists one fictional day/round/course box per round and opens settings for the selected round. Individual edits are explicitly scoped to that round ID; bulk controls are omitted there. Data sources, memory retention, started-round guards and permission boundaries are unchanged. No new collection, UGC, assets, vendors, payments, subscriptions, advertising or sponsorship. Existing privacy, security, IP, retention, platform and professional-review findings remain review_required. No deployment verified. Evidence: components/platform/GolfTripSettingsPreview.tsx and GolfTripCompetition.tsx.

## 2026-10-02 head-to-head format preview scope review

Golf Competition restores fictional match-play versus cards/pairings and adds local format selection across the loaded format catalog plus Chapman. Stroke/points formats reuse leaderboard presentation; Custom has sample stroke presentation only. Preview selection is component memory, resets on remount/reload and never changes organizer round configuration, scores, permissions or storage. No new personal data, vendors, assets, UGC, payments, subscriptions, advertising, sponsorship or provider integrations. Existing IP, security, privacy, retention, platform and professional-review follow-ups remain review_required. No deployment verified. Evidence: GolfTripCompetitionMatchPreview.tsx and golfTripPreviewFixture.ts.

## 2026-10-04 competition overview scope review

Overview summarizes existing fictional round formats, flags, schedule and status. Missing competition type and point/handicap/tiebreak rules explicitly remain Not configured. No new collection, personal data, UGC, assets, vendors, permissions, storage, retention destinations, payments, subscriptions, advertising or sponsorship. Existing privacy, IP, security, retention, organizer authority, platform/provider and professional legal-review findings and owner-assignment follow-ups remain `review_required`. No release or deployment verified. Evidence: components/platform/GolfTripSettingsPreview.tsx.


## 2026-10-09 — Development setup parity amendment

Scope revision 2; locally implemented, not deployed. Real/mock/busy development Settings now persist schedule and competition setup in source-scoped localStorage, connecting dates/courses/formats, assigned tee times, players and draft choices to shared trip surfaces. Imported tournament standings and untouched match outcomes remain intact. The older provider-backed round editor remains memory-only. No production database, permissions, live push identity or official scoring change. This supersedes blanket no-persistence statements for the source-scoped Settings path.

All unresolved findings remain review_required. Browser-local names, travel and configuration require privacy/personal-data/UGC, device retention/deletion and access review; same-origin localStorage is not an account boundary. Existing course/source rights, security, minors, organizer responsibility, platform and professional review remain open. No new payments, subscriptions, advertising, sponsorship, affiliate, media or transmission provider is introduced. Owners, due dates and reviewer remain unassigned. See docs/dev-simulator-review.md revision 3 for the data map, source isolation, limitations and follow-ups.
