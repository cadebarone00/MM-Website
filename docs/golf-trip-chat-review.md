# Golf Trip chat layout feature review

Review date: 2026-10-04. Scope revision 1. Feature ID: `golf-trip-chat-layout`. Internal review is pending; all registry categories remain `review_required`. Accountable engineering, policy, security, release and professional reviewers, jurisdictions, audience ages and next review date remain unassigned. No deployment or production readiness is claimed.

## Behavior and data map

Before: the shared trip-header chat button had no action. After: it opens a leaderboard-style inbox, always pins Trip Chat first, searches supplied match participants, opens a direct conversation and composes local text messages. Empty direct threads are absent from the inbox until a message exists. Direct conversations with messages are ordered by latest activity. Closing preserves local state; refreshing or unmounting the trip component clears messages and drafts.

| Data | Source and purpose | Visibility and destination | Retention/deletion |
| --- | --- | --- | --- |
| Participant display names | Existing match participants supplied to GolfTripHome; deduplicated and excluding the existing scoring viewer | Browser search and thread titles; no new request or directory endpoint | Component memory; existing source retention is unchanged |
| Message text, thread names, local timestamps and drafts | User entry; local conversation layout | Current browser component only; no server, recipient, analytics, export or notification transmission | Refresh/unmount discards state; closing alone preserves it |
| Reference design | User-supplied screenshot; visual guidance | Original CSS pattern and general bubble layout | No screenshot asset copied into the application |

Saved/draft trips without supplied match participants have the pinned group conversation but no searchable directory. No received messages are fabricated. Incoming bubble styling exists, but receiving messages and cross-user messaging are not implemented. Outgoing timestamps indicate local composition only; no delivery/read receipt, encryption, call or attachment claims appear. Plain text is rendered through React, not HTML. Input is limited to 4,000 characters.

## Category findings and follow-ups

- Privacy, personal data, user accounts, organizer responsibility and security: existing names may include organizer-entered non-account participants. Before shared messaging, establish actual signed-in identity, verified trip membership, recipient identifiers and authorization on reads/writes/search. A display name is not an account identifier. Owner/due date unresolved; `review_required`.
- Retention, account deletion and audit logging: local state has no persistent copy or dedicated message logs. Before persistence, assign retention/deletion owners, durations, deletion propagation and redacted audit policy. Owner/due date unresolved; `review_required`.
- UGC, minors and platform rules: no moderation, reporting or blocking is implemented. Before shared delivery, review acceptable-use terms, abuse controls, complaint/removal procedures, audience ages, provider terms and native-store obligations. Owner/due date unresolved; `review_required`.
- Intellectual property, contractor ownership, open source, media rights and third-party golf content: no added package, branding, screenshot copy or third-party pattern; uses existing Lucide icons and original CSS/SVG decoration. Rights to existing names/data/code and reference-inspired design need accountable review; no clearance inferred. Owner/due date unresolved; `review_required`.
- Payments, subscriptions, taxes, advertising, sponsorships, affiliates and course reviews: this scope adds no money flow, commercial placement, vendor or ranking calculation. Exclusion rationale must be confirmed by accountable reviewers; categories remain `review_required`.
- Business ownership and legal review: operating entity, jurisdictions, notices and contracting responsibility remain unresolved. Counsel should assess participant data authority, hosted messaging/UGC responsibilities and retention requirements before transport/persistence is enabled. No new financial flow triggers a specific CPA question in this scope; applicability still requires review.

## Readiness and evidence

Implementation references: `components/platform/GolfTripChat.tsx`, its CSS module and shared header integration in `GolfTripHome.tsx`. Workflow description: section 22 of `docs/app-workflow.md`. Registry seed remains unreviewed with a pending release decision. Structure checks and UI verification do not constitute legal approval. Reopen scope before adding persistence, transport, receiving, unread counts, vendors, notifications or attachments.
