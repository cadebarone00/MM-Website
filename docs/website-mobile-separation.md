# Website and mobile frontend separation

2026-10-19. Local implementation; independent deployment is not implemented or verified. No public homepage/routing switch, mobile refactor, backend duplication or monorepo migration.

## Website-owned files

| Files | Responsibility |
| --- | --- |
| `app/dev-website/page.tsx` | Development entry, metadata, zoom-enabled viewport, production 404 gate |
| `components/marketing/MarketingWebsite.tsx` | Landing-page composition, navigation, features, story, steps and footer |
| `components/marketing/WebsiteHero.tsx` | Static photo hero, with no tournament/season/account dependency |
| `components/marketing/WebsiteBrand.tsx` | Website-owned text wordmark |
| `components/marketing/WebsiteDownloads.tsx` | Noninteractive iOS/Android coming-soon placeholders |
| `components/marketing/MarketingWebsite.module.css` | Scoped website layout, brand styling and responsive rules |
| `components/marketing/README.md` | Boundary and asset provenance |
| `public/marketing/course-hero.jpg` | Website-owned copy of existing course photograph |
| `public/marketing/fairway.svg` | Original illustration, retained as unused alternative |
| `scripts/check-marketing-boundary.cjs` | Source import and asset boundary guard |
| `docs/marketing-website-review.md`, this document | Review findings and separation inventory |

## Mobile-owned UI and development files

The following are concrete V2 entry/UI examples with no marketing imports, not a claim that every file under their parent directories is mobile-exclusive:

| Files / area | Responsibility |
| --- | --- |
| `components/platform/PlatformHome.tsx` | Current authenticated V2 home UI |
| `components/platform/GolfTripHome.tsx`, `GolfTripHome.module.css` | V2 trip workspace UI |
| `components/platform/GolfTripMatch.tsx`, `GolfTripMatch.module.css` | V2 match/scorecard UI |
| `app/dev/page.tsx`, `app/dev/layout.tsx` | Existing development mobile simulator entry and development gate |
| `components/dev/DevSimulator.tsx`, `DevSimulator.module.css`, `SimulatorBridge.tsx` | Mobile simulator controls, viewport and bridge |

These files remain in place and are not edited for this change. `components/platform` and `lib/dev` contain a wider mix of app, organizer, development and compatibility responsibilities; do not move or delete whole directories based on this list. Re-run an import audit when extracting or deleting individual modules.

## Shared dependencies and current coupling

- Both frontends currently use the same Next.js/React installation, TypeScript/ESLint configuration, lucide-react package and root application shell. No dependency was added.
- `app/layout.tsx` still imports global CSS, loads Barlow/Spectral fonts, reads season data and mounts `ModalScrollLock`, `SeasonCatalogProvider` and `SiteChrome`. Marketing inherits these even though its own components do not use their data or account hooks. This is presentation isolation, not separate bundling or runtime isolation.
- `components/nav/SiteChrome.tsx` has an exact `/dev-website` bypass from the initial preview work. It remains shared integration code; this change does not modify it. Other routes keep their current chrome.
- Existing authentication infrastructure, database access, APIs, scoring engines and tournament rules stay in their current locations. Marketing introduces no copies or direct imports. Future website features that need them should use the same service contracts or suitably extracted shared non-UI modules after a separate dependency review.

## V1 reuse audit and remaining dependencies

| V1 source inspected | Consumers / coupling found | Website decision |
| --- | --- | --- |
| `components/home/VideoHero.tsx` | `/website`; season context, tournament override, champion calculations and countdown | Adapt full-width imagery, overlay and text placement in `WebsiteHero`; no runtime import |
| `components/home/HomeDashboard.tsx` | `/website`; season panels, highlights, schedule and tournament media | Do not copy/import into marketing |
| `components/home/HomeEntrySplash.tsx`, `LiveLeaderboardStripSection.tsx` | `/website`; legacy entrance and leaderboard behavior | Do not copy/import |
| `components/Header.tsx`, `Footer.tsx` | Shared `SiteChrome`; header account/navigation hooks, footer sponsor/tournament data | Adapt maroon presentation and footer structure using website CSS; retain originals |
| `components/Wordmark.tsx` | V1 header/footer, `nav/PortalHeader`, V2 `platform/OrganizerStudioShell` | Leave shared original untouched; implement small website-owned text mark |
| `components/home/SectionHead.tsx` | Home/editorial callers and global utility styles | Adapt visual divider locally, no runtime import |
| `public/images/tourneys/course-hero.jpg` | `app/tournaments/join/page.module.css` | Copy to website asset namespace; preserve original |

Marketing has **no direct V1 source-module dependency**. Remaining V1 coupling is inherited through the shared root layout, global stylesheet and shared shell import graph, plus asset provenance and existing font configuration. Removing this infrastructure is outside this task and must not happen through a global refactor that affects V2.

## Future production extraction

1. Relocate `components/marketing`, `public/marketing` and the boundary/documentation files into the future website application. Replace the development-only entry with its approved public page.
2. Supply a website-only root layout, CSS reset and font declarations. The CSS owns brand values and uses Arial/Georgia fallbacks if the existing font variables are absent. Do not copy root season reads, account providers, mobile scroll locks or the legacy `SiteChrome` into the new application.
3. Leave V2 UI, simulator, scoring, rules, authentication and backend services where they are until their own migration is reviewed. Inventory any truly shared business logic before extracting it; do not clone it into the website.
4. Configure independent domains/builds and backend/service access only in a separately approved deployment change. Backend sharing does not require shared UI bundles or duplicated authentication implementations.
5. Clear photo/brand/font rights, policy copy, app availability claims and actual store/support/social destinations before launch. Current review status remains `review_required`.

No production routing or deployment configuration was changed. Because another agent is migrating V1/V2, these website files form the handoff boundary; this inventory is not permission to delete the V1 sources or shared assets listed above.
## Validation for this change

- Full repository `npx tsc --noEmit --incremental false`: passed.
- Marketing-only TypeScript check using a temporary scoped config: passed; temporary config removed.
- Targeted ESLint for the marketing entry, components and boundary script: passed.
- `node scripts/check-marketing-boundary.cjs`: passed (6 source/style files).
- Headless browser at 1440px, 768px and 390px: HTTP 200, hero photograph loaded, one header, no horizontal overflow and working Download anchor; desktop and mobile screenshots visually inspected.
- `/dev`, `/website` and `/` navigation smoke checks: successful final HTTP responses; simulator title confirmed, no browser page errors. This is a smoke check, not exhaustive V2 feature testing.
- Generated workflow HTML: change panel, search and navigation checked in a browser. `npm run docs:workflow` and `npm run docs:workflow:check`: passed.
- `npm run compliance:check`: passed structure validation only; legal review remains unresolved.
- `npm run build`: failed because existing Google Font downloads (Barlow, Barlow Semi Condensed, Spectral, Inter and Roboto) could not be reached. Also reports the existing middleware convention deprecation. Font configuration was not changed; production build and runtime 404 behavior were not verified.
- Package manifests and lockfile unchanged. No deployment attempted.
