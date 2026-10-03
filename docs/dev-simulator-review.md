# Development app simulator review

Date: 2026-10-02. Scope revision: 1. Local implementation; deployment not verified. Release decision: pending. Unresolved legal findings remain `review_required`; reviewer/owner unassigned.

Read LEGAL_COMPLIANCE_SPEC.md, FEATURE_COMPLIANCE_CHECKLIST.md and lib/compliance/featureRegistry.ts before implementation. This review covers the development environment, not a redesign or release of the production app.

## Scope and data flow

`/dev` is guarded by NODE_ENV=development in its page and layout. It frames existing same-origin app routes, using an iframe's real viewport/document scroll for media queries, sticky/fixed elements and viewport units. Static `/dev` page routes are discovered from the filesystem; trip section shortcuts use the same navigation constants as GolfTripHome. `/dev/play` entries remain conditional on DEV_PLAY_DEMO=true and retain their standalone wrapper outside the simulator. Public entry routes are a small existing-route allowlist; they use their normal loaders/session. Dynamic authenticated routes are not automatically invented.

Messages require matching origin, the exact parent/frame window, channel and validated fixture/state fields. No messages bypass auth or grant roles. Development fixture settings stay in component memory, without new storage, telemetry, vendors or database work. The actual app loaded in the frame retains its existing session and permissions; following links into other app routes uses their ordinary behavior.

Real data uses palmSprings2026 through tournamentToGolfTrip adapters. Mock uses generic draft/format fixtures; empty supplies an empty draft/roster/flights; busy deterministically supplies 32 fictional players and eight rounds. Optional overrides clone presentation data. No source mutations, scoring-engine changes, payments, subscriptions, ads, sponsors, UGC submission flows or new data retention are introduced. Settings updates the trip title but retains its established independent local configuration fixture; Games and other shared placeholders retain their current fixture behavior.

Trip-state controls support competition visibility, format metadata (does not recalculate scores or pairings), player count answer (also busy roster size), not-started score presentation and the existing weather Suspense fallback. User role and notifications are explicitly disabled extension points. They do not pretend to establish authorization or a notification service.

## Device references and limitations

Portrait CSS reference sizes: iPhone 16 393 × 852; 16 Pro 402 × 874; 16 Pro Max 440 × 956; 17/17 Pro 402 × 874; 17 Pro Max 440 × 956. Apple panel dimensions divided by the standard 3× iPhone display scale establish these reference dimensions: [iPhone 16](https://support.apple.com/en-euro/121029), [16 Pro](https://support.apple.com/en-us/121031), [17](https://support.apple.com/en-us/125089), [17 Pro/Max](https://www.apple.com/nz/iphone-17-pro/specs/). These are full reference viewports; mobile browser toolbars can reduce usable height.

Google Pixel means Pixel 9; Pixel Pro means Pixel 9 Pro (user-selected generation). Android reference viewports are 412 × 924 and 412 × 918. Android display-size settings, browser bars and density can change these; custom width/height remain editable. [Google hardware specifications](https://support.google.com/pixelphone/answer/7158570?hl=en) describe the physical panels, not a guaranteed web viewport.

Display scaling changes only the visual frame, never iframe CSS dimensions. Insets are editable testing inputs (Apple defaults 59/62 top, 34 bottom; Pixel 24/24), not certified browser/hardware values. Browsers cannot set env(safe-area-inset-*) for an iframe: development-only CSSOM substitutions apply custom inset variables to the frame's existing same-origin declarations. Styles are revisited after navigation/HMR. Cross-origin styles retain native env values. Guides show the test zones without introducing fake application padding. Components ignoring safe-area CSS remain visibly unchanged so problems can be identified in their actual implementation.

This is a viewport/layout simulator, not iOS Safari, Android, touch/pointer, DPR, on-screen keyboard, browser toolbar or device-performance emulation. Verify those on devices or browser device tools; [Chrome's device-mode documentation](https://developer.chrome.com/docs/devtools/device-mode) describes that additional tooling.

## Applicable findings and follow-ups

Privacy/personal data, source/asset IP, third-party golf content, organizer publication authority, security and retention remain relevant to viewing the existing real tournament. Existing consent/rights/retention questions are not cleared. No new disclosures, personal-data collection, media uploads, minor audience, payment, subscription, advertising or sponsorship mechanics are added by the development shell. Platform/provider rules and professional legal review still require review before any broader distribution.

Open actions (`review_required`, owners/dates unassigned): assign a feature owner; verify participant/source/asset authority before sharing the simulator or screenshots outside the existing local audience; review provider/session/access behavior before exposing remotely; obtain professional review for unresolved privacy/IP/publication/retention questions. Registry metadata validates structure only and does not authorize release.
