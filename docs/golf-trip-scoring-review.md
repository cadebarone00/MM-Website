# Golf Trip starting-score review

2026-10-05: Implemented locally; deployment not verified. Unresolved legal review remains `review_required`. Reviewed LEGAL_COMPLIANCE_SPEC.md, FEATURE_COMPLIANCE_CHECKLIST.md and lib/compliance/featureRegistry.ts.

Scope: GolfTripScoring initializes both local stroke arrays from supplied scores, then supplied par, then null. Defaults appear in the normal color and count toward totals and completion. No new service, persistence, permission, collection, sharing or authentication path. Required stats, opponent agreement and local confirmation/locking remain intact; reload resets local edits. Official live scoring is unchanged.

Privacy, personal data, organizer authority, retention and third-party golf-content/IP questions remain applicable to supplied participant/course data. This change adds no UGC transport, assets, dependencies, payments, subscriptions, advertising or sponsorship. Existing provider/platform, security and professional legal requirements are not declared cleared. No registry metadata or release authorization changed.

Follow-ups (`review_required`, owner unassigned): before production readiness, assign an accountable reviewer for source rights, participant visibility, retention and provider rules, and qualified counsel for unresolved privacy/IP/organizer responsibility. Validate intended acceptance of default scores with the release owner.

## 2026-10-05 - Penalty markers

PEN adds two independent per-hole fairway/green booleans held in component memory. User requested markers only: strokes, stats, completion and opponent agreement are unchanged. Buttons toggle off on a second tap and lock on submission; fairway penalties are disabled on par 3s. No transport, persistence, public display, provider, monetary or new asset flow. Scorecard-table representation remains unimplemented. Existing privacy, personal-data, retention, security, organizer authority, golf-content/IP, platform and professional follow-ups remain `review_required`; no release clearance or registry metadata change.

## 2026-10-05 - Explicit acceptance of par

Supersedes initial default initialization: untouched stroke state remains null while displaying supplied par in the normal color. Submission eligibility and scorecard preview resolve null to supplied par; only explicit Submit Score confirmation records these defaults. Thru and filled tiles use actual entered stroke state until submission. No automatic submission, network write, changed permissions or retention. Existing unresolved legal findings remain `review_required`.
