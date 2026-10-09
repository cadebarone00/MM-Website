# Round momentum and push review

Review date: 2026-10-09. Feature ID: trip-round-momentum, scope revision 1. Status: review_required; release decision pending. Owners, reviewers, jurisdiction, audience ages, reviewed release commit and next-review date remain unassigned. Implementation is local, not deployed or production-certified.

Before: the trip bell controlled local presentation settings with no feed or delivery. After: a saved trip has a member-only Home momentum feed and opt-in device push. The app can be closed while a configured server scheduler sends notifications. Draft/development trips retain an empty feed and cannot subscribe. No production database, secrets, subscription, native app or external push was changed during implementation.

## Approved big-play rules and wording

| Cause | Header | Subheading example |
| --- | --- | --- |
| Hole recorded AND matching designated attester score of 1 | All it takes is 1! | Hole in 1 for Cam |
| Exactly 2 consecutive attested gross birdies | Another one! | 2 birdies in a row for Cam |
| Exactly 3 consecutive attested gross birdies | Heating Up! | 3 birdies in a row for Cam |
| Exactly 4 consecutive attested gross birdies | Catching fire! | 4 birdies in a row for Cam |
| Published official win decided on hole 15 or earlier | That was quick! | Cam won 5&4 before hole 16 |

Each bucket in lib/platform/momentumCopy.ts starts with the owner's exact line. Additional wording requires owner approval. No runtime generated wording. A birdie is gross strokes exactly one below that hole's actual par. Eagles, unplayed holes, missing pars and disagreement break a streak. Streaks follow hole-number order, not entry timestamps; this currently covers normal hole-1 starts, not wraparound shotgun order. Only the approved 2/3/4 thresholds emit; no fifth-birdie phrase is invented. A correction or repeated attestation does not create another event for the same cause/ending hole. Invalidated moments are withdrawn from the feed and suppressed before delivery; corrected official winner/result labels are refreshed. Already delivered alerts cannot be recalled. Attested moments include the scorer as a push recipient; optional every-score notifications exclude the score's author.

Saved-trip pars are optional because existing trip creation stores course names without per-hole pars. Organizer Round alerts includes Set round pars using the actual course scorecard, requiring all 18 values; pars lock once scoring starts. No UI default par is used for event classification. Early-win events require a real linked tournament, matching edition/round/date and published official mathematical result. Standalone trips without a tournament link have no authoritative match outcome source and cannot emit early-win alerts. Existing scoring/rules are not replaced by this feature.

## Data map

| Class | Source/use | Visibility/storage | Deletion and open follow-up |
| --- | --- | --- | --- |
| Momentum events: name, cause, round, source key, timestamp | Scoring database triggers and official result publication | Supabase service-only table; authenticated trip members via API | Trip deletion cascades; named text remains after actor account deletion; approved retention/anonymization unresolved |
| Endpoints, p256dh/auth secret, device preferences and account/trip association | Browser permission and PushManager subscription | Supabase service-only; endpoint is sent only to its browser push provider over HTTPS | Disable/device sign-out/profile/trip deletion cascades; 404/410 cleanup; provider retention unresolved |
| Push delivery attempts, leases and acknowledgements | Transactional outbox | Service-only database; no raw tokens/endpoints in logs | Trip/subscription/event deletion cascades; expiry purge and operational retention unresolved |
| Hole pars | Organizer's course scorecard | Saved trip round; organizer-only configuration API | Trip deletion cascades; scoring-start lock; source rights and correction procedure need review |
| Push payload | Owner-approved headline and named cause | Browser push provider receives ciphertext; device receives visible named alert | Already delivered notifications cannot be remotely recalled; OS history/retention requires review |

No new media, payments, subscriptions, prizes, advertisements, sponsorships, analytics SDKs or affiliate flows. That scope observation does not close their reviews. No new third-party dependency was added.

## Category findings

All findings remain review_required. Engineering evidence does not substitute for policy or professional approval. Owners, due dates, reviewer and next review date must be assigned before readiness review.

| Category | Status | Finding/follow-up |
| --- | --- | --- |
| business-ownership | review_required | Entity, service ownership and accountable launch owner unassigned. |
| intellectual-property | review_required | Owner supplied alert phrases; record brand/code ownership and authorization for future bucket entries. |
| contractor-ownership | review_required | Contribution assignment and contractual evidence need a named reviewer. |
| open-source | review_required | No new dependencies; native Node crypto/HTTPS transport implements RFC 8291/8292, tested against the published vector. Existing dependency notices remain under review. |
| privacy | review_required | New named activity feed and lock-screen subheadings need accurate participant notices and recipient authority review. Push only after explicit action. |
| personal-data | review_required | Names, confirmed strokes, subject IDs, endpoints and subscription secrets are personal/device data. No emails in feed or push. |
| user-accounts | review_required | Session identifies subscription owner; accepted trip access uses existing member checks; endpoint cannot be reassigned to a different account. Device sign-out removes its account subscriptions. |
| retention | review_required | Feed and delivery rows persist until trip deletion; subscription rows until disable, expiry or deletion. Automated expiry of stored records and approved durations remain unresolved. 15-minute push freshness is delivery policy, not retention. |
| account-deletion | review_required | Subscriptions cascade from profiles; actor ID becomes null but text names remain in historical events. Anonymization and rights handling require review and implementation before release. |
| ugc | review_required | Organizer/member names and scores remain user-entered; confirmed scoring is not moderation. Complaint/correction policy needed. |
| media-rights | review_required | No uploads or new external media; existing icon/brand rights still require evidence. |
| third-party-golf-content | review_required | Real hole pars supplied by organizers for saved trip rounds; course scorecard use/provider rights need review. |
| security | review_required | Service-only tables, same-origin writes, endpoint allowlist, authenticated feed, bounded subscription count, encrypted payloads, secret-authenticated scheduler, lease tokens and suppressed delivery rechecks are implemented. Production security review remains open. |
| payments | review_required | No money flows added; launch scope exclusions need human review. |
| subscriptions | review_required | No billing or paid entitlements added; no subscription billing implied by push subscriptions. |
| taxes | review_required | No new payment or prize flows; applicability still needs a reviewer. |
| advertising | review_required | Only round service alerts, no marketing or targeting; counsel must assess actual service-versus-marketing treatment. |
| sponsorship | review_required | No sponsored content introduced; reassess before adding sponsor text to buckets. |
| affiliate-links | review_required | No affiliate links or cookies added. |
| course-reviews | review_required | No rankings or reviews added. |
| organizer-responsibility | review_required | Organizer supplies actual round pars and participant names; allocation of participant notices and disclosure duties unresolved. |
| minors | review_required | Audience ages and guardian strategy unknown; named lock-screen activity must be reviewed. |
| platform-rules | review_required | Web/PWA only. iPhone/iPad requires Home Screen installation and gesture-based permission. Provider terms, delivery behavior, native-store distribution and hosting scheduler limits need release review. |
| audit-logging | review_required | Events and deliveries are operational evidence; no endpoint/secret logs. Separate consent-policy version evidence and retention procedures are still required. |
| legal-review | review_required | Counsel must resolve notices, participant authority, child audiences, device/provider data, retention, deletion and jurisdictions. No legal approval asserted. |

## Deployment and verification

1. Apply supabase/golf_trip_momentum.sql after the platform editions, scoring and official publication migrations in an isolated environment first. It adds tables/functions/triggers atomically and is rerunnable. Installation on production was not performed.
2. Run node scripts/generate-push-keys.cjs locally. Store WEB_PUSH_VAPID_PRIVATE_KEY only in the deployment secret manager; set NEXT_PUBLIC_WEB_PUSH_VAPID_KEY to its matching public key. Set WEB_PUSH_VAPID_SUBJECT to an authorized mailto or HTTPS contact, and a strong CRON_SECRET. Rebuild when changing the public key. Do not commit key output.
3. vercel.json schedules /api/internal/trip-push every minute. Vercel documents once-per-minute on Pro and once-per-day on Hobby (https://vercel.com/docs/cron-jobs/usage-and-pricing). Verify the hosting plan supports this frequency before deployment; otherwise use an authorized scheduler making GET requests with Authorization: Bearer plus CRON_SECRET. No scheduler was provisioned or tested externally.
4. Use HTTPS (localhost for development). The existing manifest now opens installed apps in standalone mode. On iPhone/iPad install on the Home Screen, open there, then explicitly Enable push alerts. Denied permission needs browser/device settings. No prompt occurs on page load.
5. Feed reads the latest 50 events every ten seconds while visible and on reconnect/tab return. Errors retain the last snapshot except access failures, which clear it. Service worker handles push and clicks only; it caches no scoring/private pages. Push clicks open the saved trip at #momentum.
6. Default opt-in: big moments on, every-score updates off. Preferences are per account/trip/device. Disabling deletes only this trip's subscription on this device; sign-out removes this account's subscriptions for the device endpoint across trips. Other devices/trips remain independent. Delivery membership/preferences are rechecked after lease acquisition. A delivery already handed to the provider cannot be unsent.
7. Worker claims up to 20 items, sends in groups of 5 with 10-second timeouts, two-minute leases and at most 5 attempts. No send after 15-minute event freshness. Expired endpoints are deleted. Delivery is at least once: a provider acknowledgement followed by database failure can retry the same notification tag. Native push, email and SMS are not implemented.
8. Required release evidence: subscribe/deny/disable/re-enable, account switch/sign-out, revoked membership, corrected scores, background and closed-app delivery on real target devices, provider failures, scheduler health, load/capacity and deletion/retention rehearsal. Local tests cannot prove device delivery or release compliance.

Protocol references: RFC 8291 (https://www.rfc-editor.org/rfc/rfc8291), RFC 8292 (https://www.rfc-editor.org/rfc/rfc8292), and WebKit Home Screen Web Push (https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Consulted 2026-10-09; professional and provider review remains open.
