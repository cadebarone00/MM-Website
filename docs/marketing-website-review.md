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
