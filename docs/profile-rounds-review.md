# Profile Rounds review

2026-10-05. Implemented locally; deployment not verified. Release review remains `review_required` under the existing player-profiles registry entry.

Rounds replaces event lists with the existing My Handicap read-only score history: submitted personal rounds and eligible 18-hole tournament archives, score sorting, differential, course/tee and rating/slope. No new submissions, index formula, storage, export, vendor or public endpoint is introduced.

Security and personal data: the server resolves the player slug only from the authenticated user's own profiles row, then calls the existing handicap and archive loaders. No request-supplied identity is accepted. Fans receive an empty state; loader failures show unavailable without blocking the other profile sections. Read-only rendering omits submission and local draft controls.

Privacy, retention, deletion, organizer authority and golf-data provenance remain subject to the existing unresolved review. This adds an authenticated display destination for existing personal round records; it does not establish consent, rights or legal compliance. Existing code and assets are reused; no new media, UGC collection, dependencies, advertising, sponsorship, payment or subscription flow is added. Existing platform/provider rules still apply. Jurisdiction, audience/minors, ownership, retention periods and professional legal review remain unresolved (`review_required`); accountable owners and release evidence must be assigned before production readiness is claimed.

Validation: targeted profile and handicap history/index tests, lint, workflow regeneration and source check. These establish implementation behavior only, not legal compliance or deployment approval.
