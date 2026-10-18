# Timed match draft review - 2026-10-17

Scope revision 7 adds organizer-configured rank, put-forward and response windows (1-120 minutes, defaults 10) to existing global/per-round setup JSON. Ranks locks explicit singles/pairings at its shared deadline. Response locks submitted complete groups, resets at each stage and auto-fills expired turns from same-team unused players, preserving valid pending players. Deadlines catch up across throttled tabs without extending time. All active groups/clocks remain component memory; close/unmount discards them. No server timer, background job, shared captain authorization, cross-device synchronization or scoring publication is added. Implemented locally; deployment unverified.

Privacy/personal data, security and retention: reuses existing loaded roster IDs/names/team membership and existing organizer settings storage. No new recipients, vendor, account fields or draft-state storage. Mutation guards reject expired, wrong-team, duplicate, over-capacity and started-round changes. Follow-up before shared use: authoritative server clocks/state, authenticated captain/team actions, replay and concurrent-write controls, privacy-preserving persistence and retention/deletion evidence. Owner unassigned; due before any shared/official launch; review_required.

Automated selection/organizer responsibility: user requested random auto-fill on Response expiry; partial groups are preserved and no cross-team player is selected. Insufficient rosters stop with an organizer-action message. Ranks retains incomplete spots at expiry. Follow-up: resolve participant notice, fairness, correction/dispute process, audit evidence and approved timeout policy before official publication. Owner unassigned; due before production; review_required.

IP/UGC, provider/platform rules and professional legal review retain review_required findings. Existing assets and roster labels only; no new media, payments, subscriptions, prizes, advertising or sponsorship flows. No existing category is assumed compliant. Structural registry validation is not release authorization.

Validation: focused engine tests cover rank-pair locks, complete group submission, independent timer resets, partial-pair timeout preservation, original-deadline catch-up, roster constraints and settings bounds. Browser checks exercise the local room and settings. These do not establish legal compliance.

## Prior reviews

Timing follow-up (2026-10-17): Home shows Team Draft or Match Draft exclusively, requiring assigned two-team rosters before match entry. Organizer edits and saved setup validation enforce a 10-minute minimum between complete team/match schedules; incomplete forms remain editable. Dev method previews represent already formed teams; Upcoming Team Draft is separate. No new storage, recipients or collection; unresolved legal/security/retention reviews remain review_required.

# Match Draft grouping review - 2026-10-17

Dev conditional follow-up (2026-10-17): Home and Match Selector can display memory-only Response/Ranks/Randomized samples, including an eight-player fictional fallback for incomplete sources. No settings writes, additional data collection or external recipients. Existing unresolved review statuses remain unchanged.

Scope revision 5: Home card reads existing saved-trip/scoped development match settings and opens a format-aware, two-team grouping room. Response alternates opening teams per match; editable Ranks creates corresponding ranked groups; Randomized uses independent team shuffles. Existing setup is read-only here. Group placements/ranks live in component memory and are discarded on close, with no official writes or multiplayer/captain authorization. Implemented locally; deployment not verified.

Engineering findings: known roster IDs and sides constrain selection; duplicate selections per round, side capacity overflow and started rounds are rejected. Only organizers can generate/select/reset/rank; members view only. Saved setup provider takes precedence over development storage. No new collection, recipients, vendors, persistence, notification, payment, subscription, advertising or sponsorship flows. Reuses repository styling and already loaded names/handicaps; underlying rights and participant authority remain unresolved.

Privacy/personal-data, retention, security, IP/UGC, organizer responsibility, provider rules and professional legal review remain review_required under LEGAL_COMPLIANCE_SPEC.md and FEATURE_COMPLIANCE_CHECKLIST.md. All other categories retain their existing review_required status; no legal clearance is inferred.

Follow-ups (release owner unassigned, due before production release): verify member roster visibility and source team mapping; review rank fairness, ties, exclusions and participant correction expectations; establish persisted-draft retention/audit and captain authorization before any shared official assignment or multiplayer publication; resolve underlying IP/provider and legal requirements with qualified owners. No release readiness or deployment authorization is claimed.

Validation: focused grouping/schedule engine tests and browser regression cover the implemented local behavior; these cannot establish compliance.

## Previous foundation review (2026-10-12)

# Match Selector review — 2026-10-12

Scope: draft-room presentation foundation in `TripMatchDraftRoom`, organizer Match Draft round entry and development page selector. Reuses existing configured rounds, team-player names and settings. Round switcher, roster search and team filters work; match slots remain unassigned. No Response, Ranks or Randomized assignment algorithm, countdown enforcement, multiplayer, messaging or official writes. Implemented locally; deployment unverified.

Reviewed against LEGAL_COMPLIANCE_SPEC.md and FEATURE_COMPLIANCE_CHECKLIST.md; registry trip-draft-room scope revision 4. Accountable legal/release owner, jurisdictions and professional review remain unresolved (`review_required`). This is not compliance certification or release authorization.

Privacy/personal data: existing loaded names are displayed within the existing settings surface; no new collection or external recipient. Follow-up: confirm organizer/member visibility and data minimization before production.

Security/permissions: development selector inherits existing development-only settings route. Existing settings entry provides the UI foundation; no authorization or server assignment API is added. Production draft access and organizer authority require review.

Retention: no new player-pick storage. Existing browser setup stores draft method/date/time; room search/filter/round selection is component memory. Existing retention and account-deletion requirements remain `review_required`.

IP/UGC: reuses repository draft-room styles and already-loaded roster labels; provenance and name-display permissions remain part of existing review. No new upload or third-party content ingestion.

Payments, subscriptions, advertising/sponsorship, prizes and new providers: none added by this scope. Platform/provider rules and professional legal review remain under existing feature review, with no assumed compliant status. Before introducing actual automated assignments, review fairness, correction/audit controls, participant visibility and persistence separately.
