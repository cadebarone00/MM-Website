# Shared Motion patterns

Use `useAppMotion()` in a client component and spread one returned pattern onto an existing `motion.button`, `motion.article`, `motion.main`, or `motion.div` from `motion/react`. Keep existing classes, children, handlers and semantic tags. Do not combine CSS transform animations with these patterns. For disabled buttons, omit `buttonPress`.

| Pattern | Behavior | Duration |
| --- | --- | --- |
| `buttonPress` | Press to 98% scale, release to normal | 120 ms |
| `cardInteraction` | Hover rises 2 px; tap scales to 99.5% | 160 ms |
| `pageEntrance` | Fade in and rise 4 px on mount | 200 ms |
| `panelEntrance` | Fade in and rise 6 px on mount | 200 ms |
| `success` | Single scale pulse: 100%, 102.5%, 100% | 240 ms |
| `errorShake` | Single horizontal shake, maximum 3 px | 240 ms |

Entrances run on mount; mount panels when they open. Success/error patterns run on mount: mount a dedicated feedback element only when feedback occurs, or change its key for a new event. Do not mount feedback patterns continuously or use them to determine application state. These patterns do not manage modal focus, dismissal, exits, routing or messages.

All patterns use a short tween without bounce, loops or delays. Reduced motion disables all animation, including fades; an unresolved preference is treated as reduced motion. `useReducedMotion` responds to preference changes. No global provider or shared Button/Card behavior is changed.

## Pilot

Only two elements on `/` opt in: the Discover category button (`buttonPress`) and the first Join Tournament article (`cardInteraction`). Hover the first card or press its Join Tournament link; hold the Discover button to see its press feedback. Existing links and category selection remain unchanged. The other four patterns are available but unapplied.

## Scope review — 2026-10-02

Reviewed against `LEGAL_COMPLIANCE_SPEC.md`, `FEATURE_COMPLIANCE_CHECKLIST.md`, and `lib/compliance/featureRegistry.ts`. This is a bounded presentation/accessibility change rather than a material product feature. It introduces no new data collection, personal-data processing, UGC, retention, permissions, security decisions, money flows, subscriptions, advertising/sponsorship or external services. It uses the already installed Motion dependency and existing first-party markup; no new media or copied design assets. Platform/provider behavior and professional-review triggers are unchanged. Existing unresolved legal, asset-rights and dependency-license findings remain `review_required`; this scope review is not legal clearance or release authorization. Deployment is not verified.
