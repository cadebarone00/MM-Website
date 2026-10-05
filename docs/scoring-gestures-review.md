# Scoring gestures review

Reviewed 2026-10-05. Local implementation; deployment and physical-device testing are not verified.

Scope: remove the grabber decoration, align the center Scoring pill, and add a 200ms stationary touch press followed by vertical sheet dragging in Slide mode. Quick scrolling remains available; fields and dialogs are excluded. No touch pressure is collected. Gesture coordinates and timers exist only in component memory and are discarded when the gesture ends or the component unmounts.

Privacy/personal data/retention: no additional records, identifiers, telemetry, storage, exports or recipients. Existing round and local default-view storage behavior is unchanged. Security/accounts: no permission or server changes. Intellectual property/open source: existing React and browser APIs only; no new assets, dependencies or golf data. UGC/media, payments, subscriptions, advertising/sponsorship: no changed flows. Platform/provider rules: browser touch handling only; real-device map and scrolling interactions require follow-up testing. Legal review: this narrow interface change introduces no identified new professional-review trigger; existing unresolved platform-wide legal questions remain review_required, and this record does not certify compliance or authorize release.

Follow-up: engineering owner unassigned; verify press-then-drag, quick scrolling, map panning, cancellation/multi-touch, and controls on iOS/Android before release. Existing registry metadata remains unchanged.

Validation: ESLint passed for GolfTripScoring.tsx. Local Chromium mobile emulation measured all three pills at 118.796875 by 40.59375px with identical 19px top positions and no grabber element. CDP touch input confirmed a held downward content drag closes the sheet and a held upward page drag reopens it. Workflow generation/check and browser change-panel, navigation and search checks passed. Physical-device testing remains outstanding.
