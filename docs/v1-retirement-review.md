# V1 interface retirement and Tap In

2026-10-28. Scope revision 1. Implemented locally; deployment and native builds are not verified. Status: review_required. Feature owner, security/policy reviewer, operating entity, markets, age scope and next review date remain unassigned.

## Authorized product scope

The owner approved retiring V1 areas A1–A7/A10 and B/C/E/F/G/H. A8/A9 become the marketing footer with real destinations rather than dead links. D retains the broadcast display layer and leaderboard graphics for signed-in Tap In; music, video, comments, highlights, countdown and producer UI are retired. V2 player details, profiles, accounts, organizer settings, Predict and Play remain. This decision is UI retirement, not deletion of participant records, account identities, score history, shared rules, schemas or APIs, and does not establish that every V1 operation has a verified native replacement.

Old page URLs redirect to current destinations. The old website URL becomes the marketing website; the app homepage remains the app homepage. The V1 simulator group is removed. Source UI with no remaining import consumers can be removed; shared modules remain, including the handicap UI used by V2 Profile. API-only legacy operational modules remain until separately migrated; they are not newly exposed through organizer settings.

Tap In initially reuses existing founding Maroon tournament leaderboard/match data. It does not claim arbitrary saved Golf Trip broadcasting, TV pairing/casting, iOS or Android support. Those need separate membership-scoped data integration and device verification. Signing in on the TV/browser and using fullscreen is the supported web interaction. Existing result calculations are reused, not reimplemented.

## Data, assets and money

| Class | Source / purpose | Visibility / destination | Retention / removal |
| --- | --- | --- | --- |
| Account/session | Existing Supabase verified identity; gate Tap In and display | Same account system, server gate; no credentials in display props | Existing session lifecycle; no new persistent token or device pairing |
| Tournament scores, names, teams | Existing broadcast leaderboard/match readers | Signed-in display; no new public trip feed | Existing records retained unchanged; retention decisions remain review_required |
| Photos, fonts, motifs, logos | Existing marketing and broadcast assets | Existing presentation assets reused; no new third-party media provider | Ownership/license evidence remains review_required; retirement does not clear rights |
| Legacy participant/history/UGC | Existing data and API modules | UI removed, access policies unchanged | No database/media deletion or invented retention schedule |

No payment, subscription, ad SDK, new sponsor placement, affiliate tracking, media upload, music playback or external video embed is introduced. Marketing footer adapts navigation/branding, without copying sponsor assets or fabricated policy pages.

## Checklist category assessment

All unresolved assessments remain review_required; none is legal clearance. Evidence: LEGAL_COMPLIANCE_SPEC.md, FEATURE_COMPLIANCE_CHECKLIST.md, lib/compliance/featureRegistry.ts, this change's routes and source dependency report.

| Categories | Finding / follow-up | Status |
| --- | --- | --- |
| business-ownership, contractor-ownership, intellectual-property, open-source | Existing code/assets reused, no dependency added. Obtain chain-of-title and distribution/license evidence; owner/reviewer unassigned. | review_required |
| privacy, personal-data, user-accounts, security | Verify the server gate, API session loss and absence of cached authenticated responses. No new public visibility or account linking. Arbitrary trip access is excluded. | review_required |
| retention, account-deletion, audit-logging | Existing records/APIs preserved. No new stored broadcast preferences or audit stream. Verify existing retention, deletion and backups separately. | review_required |
| ugc, media-rights, third-party-golf-content, course-reviews | Remove old presentation/embeds rather than import content. Existing names/photos/golf datasets still require rights/privacy evidence. | review_required |
| payments, subscriptions, taxes, advertising, sponsorship, affiliate-links | No new money flow or commercial placement in this scope. Existing backend features are not cleared by UI retirement; reassess before monetization. | review_required |
| organizer-responsibility, minors, platform-rules, legal-review | Organizer/native parity is not established by removing admin UI. Verify supported operations, audience, current provider/store requirements and professional-review triggers before release. | review_required |

## Actions and verification

Engineering: trace imports before pruning UI; retain V2/shared rules and API modules; test old URL destinations, new marketing footer, authentication, TV controls, scrolling and V2 profile/trip rendering. Policy/operations: assign owners and verify retained historical data access, required admin operations, rights and retention. Attorney/CPA: resolve jurisdictional/privacy/IP/provider and commercial triggers before public/native release. All professional follow-ups remain open, owner/due date unassigned. No production release approval is recorded.
