# Active / Settled trip games review

2026-11-10; scope revision 1; local implementation, not deployed. Status: review_required.

Scope: add display categories over existing game definitions, inputs and participant scorecards. Full participant scores, completed pre-round team setup, required per-hole picks and Snake putts derive Settled. Exact historical round snapshots supply past scores; unknown history remains Active, and corrections can reopen the display category. Settled is a read-only UI view, not a server-enforced lock, immutable archive or payment operation. No new storage, participant exposure, vendor, analytics, schema, API, money flow or distribution channel.

Privacy/personal data/accounts/security: existing membership loaders, saved participant identities and permissions remain; no new recipients. Retention/deletion: existing saved-game and localStorage lifetimes remain unresolved; no automatic deletion is added. UGC, IP/media/third-party golf content, provider rules, organizer responsibility and minors retain existing review_required findings. Payments/subscriptions/tax/ads/sponsors/affiliate flows are not introduced. Entity, contractor ownership, audit requirements, platform obligations and professional legal review are not cleared by this change.

Follow-ups (owners/dates unassigned): establish durable historical score coverage for saved trips, retention/deletion policy and policy/legal review for existing side-game methodology and audience. All unresolved applicability remains review_required. Registry metadata unchanged. Tests cover complete/incomplete/missing/empty participants, historical round isolation and score correction. No release clearance is claimed.
