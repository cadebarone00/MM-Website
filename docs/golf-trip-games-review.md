# Golf Trip Games preview review

2026-10-02; scope revision 1; feature ID `golf-trip-games-preview`.
Decision pending. All registry categories remain `review_required`; this record is not production readiness or legal approval. Owners, professional reviewers, markets, audience ages, next review date and release build are unassigned. No deployment verified.

## Scope and data map

Before: Games was a placeholder. After: `/dev/tournament` demonstrates optional player-created side games through scope, group size, compatible games and setup. It remains available in competitive and non-competitive preview scenarios. Real trip pages retain the placeholder.

| Data class | Source and purpose | Visibility, destination and lifecycle |
| --- | --- | --- |
| Fictional player names and group labels | Checked-in invented fixture; partner and cross-group selection | Preview browser only; no account identifiers or external recipients |
| Fictional course names, dates and rounds | Checked-in invented fixture; single-round scope demonstration | Preview browser only; no golf data provider |
| Game, scope, size, round, player choices and handicap preference | Local button/select interactions | Component memory only; reset on reload/unmount; no storage, invitations, exports, analytics additions or score writes |

Evidence: `lib/platform/golfTripGames.ts`, `components/platform/GolfTripGames.tsx` and `components/platform/GolfTripHome.tsx`. No additional packages, services, assets or money/value flows. Side-game controls have no reference to official scoring or organizer Competition updates.

## Category assessment and open follow-ups

All findings below remain `review_required`. Owners and due dates are unassigned, actions open; reassess before real-data integration or release.

- Privacy, personal-data, user-accounts, retention and account-deletion: fictional data and transient selections only. Engineering must map actual participant authority, visibility, invitations, deletion and retention before adding real participants or persistence; policy owners must review notices and jurisdictions.
- UGC, security, organizer-responsibility and audit-logging: predefined choices only; no free text or messages. Player-controlled UI is a demonstration, not enforced authorization. Engineering must implement participant consent/access and tenant isolation, abuse handling, score-read boundaries and appropriate audit evidence before live integration.
- Intellectual-property, contractor-ownership, open-source, media-rights and third-party-golf-content: original short descriptions, invented fixture labels and existing styles/fonts; no logos, copied rules or new dependencies. Policy/legal owners must resolve existing provenance, brand/font/license rights and contribution ownership; familiar game names do not establish clearance.
- Payments, subscriptions, taxes, advertising, sponsorship, affiliate-links and course-reviews: no stakes, prizes, purchasing, paid placements, rankings, affiliate links or monetization added. Counsel/CPA must review any future money, prizes or regulated contest interpretation. Commercial real-money wagering remains excluded by the master specification.
- Business-ownership, minors, platform-rules and legal-review: entity, intended audience, markets and distribution readiness unresolved. Policy/release owners must establish scope and complete the checklist; qualified professionals must resolve triggered questions before a production-ready designation.

Engineering acceptance evidence must establish zero official Competition writes and authorized real-player access before integration. Policy/document acceptance requires a complete category checklist and data map. Professional review must supply restricted decision references for triggered legal/tax questions. Structural registry validation cannot establish compliance or authorize deployment.
