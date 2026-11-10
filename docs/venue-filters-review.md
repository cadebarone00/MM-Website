# Venue filters review

2026-11-10. Scope revision 1. Implemented locally; not deployed. Status: review_required.

The sheet filters already-loaded venue data in page memory by selected trip/venue coordinates, straight-line miles, category, existing aggregate rating and group saves. Sort changes display order only. No location lookup, device location permission, provider call, server query, account boundary, score, rating submission, upload or schema changes. Blank radius means all currently loaded places, not unlimited geographic coverage. Native dialog contains focus, supports Escape, and returns focus to its trigger. Closing does not apply draft edits.

Privacy/personal data/security/retention: selections and derived distances stay in component memory and disappear on unmount; existing trip-member authorization, saves and aggregate rating reads are reused. No analytics or new external recipient is added. Existing location, save, account deletion and retention governance remain review_required; no claim of legal clearance.

Intellectual property, third-party golf content, UGC/course reviews and provider/platform rules: existing place import rights, attribution, review provenance, incentives, disputes and ranking methodology remain review_required. Filters do not change reviews, recommended ranking or attribution. No copied media or new dependency. The rating threshold uses unrounded average / 2; displayed averages still round to one decimal.

Payments, subscriptions, tax, advertising, sponsorship and affiliates: this scope adds no money flow, paid placement, promotion, tracking or partner integration. Organizer duties, minors, entity/contractor ownership, logging and professional legal review retain existing unresolved operating facts; no new audience, jurisdiction or distribution channel is asserted.

Follow-ups (owners and due dates unassigned): product owner to confirm desired geographic lookup/import coverage; policy/legal owners to resolve existing place rights and review methodology, privacy/retention and provider obligations before production readiness. These remain review_required. No professional legal decision or deployment approval is recorded. Registry metadata is unchanged.
