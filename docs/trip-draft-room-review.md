# Trip Draft Room feature review

Review date: 2026-10-10. Scope revision 1. Internal decision: pending; all unresolved legal findings remain `review_required`. Accountable release owner, policy reviewer, jurisdictions, audience ages, next review date and professional reviewers remain unassigned. Web implementation only; no deployment verified.

## Scope and flows

Previously Home offered a temporary coming-soon message. Now its existing pre-draft button opens a two-team board and a slide-up Available/Team A/Team B roster panel. Existing loaded leaderboard names and handicaps, or travel member names, pass through existing Home props into a native modal. Search and Snake/Straight picks run in React memory. Closing unmounts the room and discards picks. No API, database, localStorage, analytics, export, new vendor, chat, invitations, official assignment or scoring destination is added. No per-pick timer or multiplayer draft is represented as implemented. Existing parent access and draft visibility are retained; local draft controls do not authorize official mutations.

| Data class | Source / purpose | Visibility / destination | Retention / deletion |
| --- | --- | --- | --- |
| Player names and handicaps | Already-loaded trip leaderboard; travel member names as fallback | Current viewer in existing trip UI; React memory | Existing source policies unchanged; copied view ends on unmount |
| Search text and draft picks | Viewer input for local roster exploration | Current room only; React memory | Discarded on closing; no durable writes |
| Design assets | User reference used for layout inspiration; existing app fonts/colors and installed lucide icons | Existing app bundle | No reference screenshot, third-party brands or player images copied |

## Category findings

Every registry category retains `review_required` pending accountable human review. Findings below describe implementation scope, not compliance approval.

| Categories | Findings and follow-ups |
| --- | --- |
| business-ownership, contractor-ownership, intellectual-property, open-source | Entity and contribution rights remain unresolved. Reuse existing fonts and icon dependency; no dependency added. Confirm licenses, contribution ownership and rights before production review. Screenshot inspires structure only. |
| privacy, personal-data, user-accounts, organizer-responsibility, minors | Existing loaded names/handicaps only. Confirm existing viewer visibility, participant authority, notices, audience age and jurisdiction. No email displayed. |
| retention, account-deletion | No new persistent records. Source retention/deletion remains governed by existing unresolved processes; document and verify before release. |
| ugc, media-rights, third-party-golf-content | Existing names may be organizer-authored. No new posts, uploads, media, golf content imports or copied screenshot assets. Confirm existing name handling and rights. |
| security, audit-logging | No server mutations, credentials or new logs. Modal focus/Escape and body-scroll restoration should be verified. Any future official draft requires captain/organizer authorization, tenant isolation, atomic pick validation and audit review. |
| payments, subscriptions, taxes, advertising, sponsorship, affiliate-links, course-reviews | No new money, fees, fantasy value, ads, sponsors, affiliates or course reviews in this scope. Human reviewer must confirm exclusions; existing product-wide issues are unresolved. |
| platform-rules, legal-review | Existing web distribution and providers only. No new native distribution. Qualified reviewers must resolve applicable ownership, privacy, audience, retention and provider issues before production readiness. |

## Open actions

Engineering owner (unassigned): verify modal and roster interactions; design official draft authorization, persistence and synchronization only in a separately reviewed change.

Policy owner (unassigned): confirm visibility notices, organizer authority, participant rights, retention/deletion and license evidence. Due date and next review date unassigned.

Attorney/CPA owner (unassigned): assess applicable professional triggers with business owner and record restricted decision references. No professional approval or release designation is inferred from structural checks.

## Local verification evidence

TypeScript and scoped ESLint passed. Browser component harness verified Snake A/B/B pick order, board and team lists, search, Escape, Close and reopen reset, with mobile/desktop screenshots in ignored test-results/draft-room. The harness uses sample names and does not establish saved-trip integration or multi-user authorization. Generated workflow HTML was opened in Chromium; its change panel, search and section-22 navigation passed. Compliance structure and workflow regeneration/check passed; none of these establishes legal compliance or deployment approval.

## 2026-10-10 header/countdown follow-up

Presentation change: header row lowered 28px and scheduled-start countdown added below it. Countdown values come from the existing Home draft target and ticking trip clock; no additional data, vendor, persistence, authorization or money flow. It does not implement a per-pick deadline. Existing unresolved review_required findings remain unchanged.
