# Marketing website development review

Date: 2026-10-19. Scope revision 2. Status: `review_required`. Owner, policy/security reviewer, counsel, jurisdictions, audience ages and release commit remain unassigned. Re-review before public deployment or any new collection, links, analytics or store distribution.

Before: no independent marketing development route. After: development-only `/dev-website`, static marketing sections and noninteractive coming-soon store/footer destinations. No release or deployment verified. Evidence: `app/dev-website/page.tsx`, `components/marketing/`, `public/marketing/fairway.svg`.

## Data, assets and value

The page adds no forms, account flow, storage, analytics, uploads, embedded services, payment or subscription flow. Existing root layout still loads season data/providers and existing Google font integration; this route does not remove that inherited infrastructure. Hosting requests may enter existing server/provider logs; vendor regions, retention and notices require review. No new personal data source or destination is introduced by the marketing component.

The golf SVG is an original code-authored illustration retained as an unused alternative. The active hero now uses a byte-for-byte copy of the existing course photograph at public/images/tourneys/course-hero.jpg, stored independently at public/marketing/course-hero.jpg. Photographer/venue rights and permitted commercial reuse remain review_required; existing repository presence is not evidence of a license. No player imagery or sponsor marks are copied. Wordmark uses text. Existing font and lucide-react licenses and brand rights require release evidence. No new dependency. Founding narrative and native capabilities are draft marketing copy, not validated availability claims; mobile apps are explicitly coming soon.

## Category assessment and follow-ups

All categories remain `review_required`, with owner/reviewer/next review unassigned; observations below describe the bounded engineering scope, not legal clearance.

| Categories | Findings and required evidence before launch |
| --- | --- |
| business-ownership, intellectual-property, contractor-ownership, open-source | Confirm entity/domain/brand control, contribution ownership and existing fonts/icon licenses. Preserve SVG provenance above. |
| privacy, personal-data, retention, audit-logging | No added collection; map inherited hosting logs, root data reads and font delivery, retention/deletion and accurate privacy notices. |
| user-accounts, account-deletion, ugc, course-reviews, organizer-responsibility | No account/content/review/organizer operations in this canvas. Reassess if connected to the app. |
| media-rights, third-party-golf-content | Existing course photograph copied to the website namespace; confirm photographer/venue rights and permitted marketing use before release. Original illustration provenance retained. |
| security, minors | Development environment gate and noindex are implemented; noindex is not access control. Determine audience and deployment access before publishing. |
| payments, subscriptions, taxes, advertising, sponsorship, affiliate-links | No monetary flow, sponsor placement or affiliate destination. Reassess any future commercial additions with counsel/CPA as applicable. |
| platform-rules, legal-review | Validate eventual iOS/Android availability and store badge/brand rules; add approved legal/privacy/support/social destinations. Counsel reviews public claims and policies before launch. |

Engineering follow-up: validate responsive canvas, keyboard navigation, route gating and existing route smoke checks. Policy follow-up: approve final copy, legal pages, support destination and store links. Professional follow-up: resolve entity, markets, privacy/IP and distribution questions. All open; no compliance or release authorization asserted. Registry seed `marketing-website-development` links this scope and leaves every assessment `review_required`.

## Moving to a separate application later

Copy `components/marketing` and `public/marketing`; mount `MarketingWebsite` from the new entry page. Provide the Barlow/Spectral CSS font variables or accept the built-in Arial/Georgia fallbacks. Recreate metadata, viewport and an appropriate root layout there. The present page inherits this repository's root server data reads; it is a reusable UI boundary, not a separate runtime or deployment. No monorepo change is made.


## 2026-10-19 separation revision

Revision 2 adapts V1 full-width hero, maroon chrome, text wordmark and section rules in website-owned components after checking import consumers. No V1 module, authentication, scoring or season logic was copied. Existing shared V1/V2 sources remain untouched. Source boundary guard: `node scripts/check-marketing-boundary.cjs`. Ownership and extraction inventory: `docs/website-mobile-separation.md`. No independent production runtime or deployment is claimed. Photo rights and inherited root coupling require resolution before launch.

## 2026-10-20 shared preview navigation

The existing desktop/mobile groups share one marketing renderer. Added an on-page Support anchor and availability copy; no contact address, form, collection, persistence, vendor, payment, subscription, advertising or user-content flow is introduced. Existing privacy, security, retention, media/IP, provider/store and professional-review findings above remain `review_required`. Support operations and an approved contact destination remain follow-ups before launch. No deployment verified.

## 2026-10-20 hero app capture

The hero adds a static screenshot of the actual V2 Golf Trip Home UI, captured from the existing `/dev` simulator with Mock golf trip data, iPhone 16 (393?852 CSS pixels, 2? raster). Source route: `/dev/tournament?simulator=1`; navigation: Home. It shows The Invitational and fictional fixture content, with no authenticated browser session. The Next.js development indicator was hidden during capture only. Asset: `public/marketing/v2-golf-trip-home.png`. No V2 source modification or app-runtime import. Recapture through the same simulator controls when the approved product presentation changes.

No new data collection, UGC, persistence, security permission, vendor, retention, payment/subscription or advertising flow is added. Existing brand/UI/font/icon and photograph rights, fixture naming/provenance, marketing claims, platform distribution and counsel review remain `review_required`; this capture does not establish release clearance. Reduced-motion preferences suppress hero entrance and hover animation. No store links, commit, deployment or production routing change.

## 2026-10-20 multi-device showcase

Added a presentation-only section after Features. The phone reuses the documented mock-data V2 capture; desktop trip planning and Apple Watch yardage are website-owned HTML/CSS concepts, with explicit concept/availability copy. Fictional itinerary and yardage values are illustrative, not live travel, competition or GPS information. No additional assets, vendors, personal data, user content, permissions, retention, payments, subscriptions, sponsorship, analytics or external destinations. Existing inherited privacy/security and IP/media/font/brand findings remain `review_required`. Platform branding, device representation and final availability/marketing claims require policy and professional review before public launch; no desktop/watch product or release is asserted. No V1/V2, simulator, production routing or deployment change.

## 2026-10-20 website account entry and dashboard

Marketing Sign In links to existing `/login/email`; it does not change authentication or return-path rules. The new `/dev-website?view=dashboard` view uses isolated fictional constants with no auth/data imports or writes. Functional navigation, mock-only sections, proposed production guards, reusable profile/history/statistics queries, ownership boundaries and category review are recorded in `docs/website-player-dashboard-integration.md`. All unresolved privacy/security/IP/provider and professional questions remain `review_required`. No production integration, commit or deployment is asserted.

## 2026-10-21 website authentication scope

The server website entry now supplies existing-account navigation, and `/dashboard` renders the own profile name/username through existing verified-session conventions. No marketing module imports auth/data and no real page imports the fixture. Website login/verification/recovery continuations are exactly validated; Sign Out reuses the local-session endpoint and reports failure. This expands beyond the prior static canvas: identity, session caching, privacy, incomplete/deleted accounts, native/web consistency, provider redirect configuration and real-credential QA require review. Category findings, scope, outstanding evidence and actual test results are recorded in `docs/website-player-portal-auth.md`. All unresolved categories remain `review_required`; no deployment or compliance clearance asserted.
