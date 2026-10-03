# Dev tournament data selector review

2026-10-02: Local implementation only; deployment not verified. Review status: `review_required` for unresolved legal matters. Read LEGAL_COMPLIANCE_SPEC.md, FEATURE_COMPLIANCE_CHECKLIST.md and lib/compliance/featureRegistry.ts before implementation.

Scope: development-only, page-local React state switches props to existing shared components. Existing Maroon participant/course data passes through unchanged adapters; generic fictional fixtures provide the alternate view. No collection, database writes, exports, analytics, new retention, authentication, UGC submission, payments, subscriptions, advertising or sponsorship behavior. Existing development route restriction remains server-side. Settings and shared placeholder fixtures retain their existing behavior.

Privacy/personal data, organizer authority, third-party golf content and intellectual property remain applicable to the existing real source. This selector does not establish participant consent, ownership or publication rights. Security review confirms the route retains its development-only guard; selection adds no persistence or permissions. Existing retention, provider/platform requirements and professional review are not declared cleared.

Follow-ups (`review_required`, owner unassigned): before expanding beyond development, assign an accountable reviewer to confirm participant display authority and source/asset rights; assess access, retention and provider rules for the proposed audience; obtain professional review for unresolved publication/privacy/IP questions. No release authorization is recorded. This small dev control adds no registry metadata or production feature.
