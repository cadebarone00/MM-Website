# Player Portal readiness: 2026-10-21

Implemented locally; not committed or deployed. Scope: replace build-time font downloads, preserve existing typography, and prepare account verification. No authentication behavior, V1/V2 UI, simulator groups, marketing design, Supabase schema/RLS, production routing or deployment configuration was changed in this phase.

## Fonts and license review

All five previously configured Google families now use next/font/local. Shared brand fonts: Spectral 300-800 normal/italic; Barlow 300-700 normal/italic; Barlow Semi Condensed 400-700 normal. Notification-only fonts: Inter 400-700 normal; Roboto 400/500/700 normal. The unchanged native/system/generic stacks remain. Inter and Roboto are not imported into the root layout. No additional weights or substitute families were added.

The former next/font/google loaders required fonts.googleapis.com/fonts.gstatic.com during compilation. This network dependency caused the prior build blocker. No active remote font loader/request remains in app/components/lib. Local configuration preserves CSS variables, swap and the former fallback metric profiles.

All 33 unmodified official font binaries include retained upstream SIL OFL 1.1 notices, metadata and URL/hash manifests. OFL permits embedding/self-hosting with its conditions. Engineering licensing/integrity verification passed; broader distribution/legal review remains review_required. Details: ../public/fonts/README.md and ../OPEN_SOURCE_LICENSES.md. Full-coverage TTF assets total about 6.48 MB; compression/subsetting optimization was not introduced.

## Actual verification

| Check | Result | Evidence/limits |
| --- | --- | --- |
| Fresh TypeScript | PASS | tsc --noEmit --incremental false, exit 0 |
| Auth unit tests | PASS | 17 passed, 0 failed across returnTo, websiteFlow, passwordSession, signup, playerIdentity, signOut |
| Changed-file ESLint | PASS with warnings | Layout, notifications, font modules, integrity script: 0 errors; 7 existing no-img-element warnings in notification markup |
| Repository-wide ESLint | FAIL | npm run lint exited 1: 2,255 errors and 18,949 warnings, including generated .next-savedtrip-check build chunks and existing source diagnostics. A retry excluding .next outputs was stopped after remaining slow. No unrelated lint fixes made; no repository-wide lint pass claimed. |
| Marketing boundary | PASS | 12 files; no prohibited imports |
| Font integrity | PASS | 33 binaries and all retained license/metadata SHA-256 hashes; upstream Git blob hashes where supplied |
| Workflow generation/check | PASS | npm run docs:workflow and npm run docs:workflow:check |
| Workflow browser check | PASS | Chromium opened generated HTML; change panel and navigation present, search accepted input; screenshot inspected |
| Production build | PASS | Real next build using existing NEXT_BUILD_OUTPUT override, no mocked fonts; compilation, TypeScript and all 261 page-generation tasks completed, exit 0 |
| Notification font browser metrics | PASS, limited | Chromium canvas sample text against cached original Latin Google WOFF2: Inter/Roboto configured weights differed by at most 0.013px at 32px; this is not whole-page screenshot parity |
| Whole-page font visual regression | NOT RUN | No claim of full V1/V2/marketing/dashboard screenshot comparison |
| Real authentication browser tests | BLOCKED / pending | No approved account session or mailbox actions used in this phase; unit tests/build are not real Supabase session evidence |

The first local-font build exposed Turbopack's rejection of quoted option keys; correcting the declarations resolved it. Build emitted the existing middleware-to-proxy deprecation warning; no unrelated migration was performed. Temporary build-generated TypeScript include entries were removed after verification; deployment configuration remains unchanged.

## Account verification handoff

Exact steps are in [the manual browser checklist](player-portal-browser-checklist.md). Website sign-in/dashboard identity, refresh persistence, authenticated navigation/signout, real V2 default, anonymous guard, delivered verification/recovery and cross-user RLS must be recorded individually against existing authorized development accounts. No credentials were requested/logged, accounts created, emails sent, passwords changed or Supabase settings modified. Two separate approved account browser sessions and working backend connectivity are needed for real privacy verification; email/password mutations need explicit approval.

## Files in this phase

- app/layout.tsx; components/notifications/NotificationPreviews.tsx: replace font imports, retain UI.
- lib/fonts/brand.ts, notifications.ts, fallbacks.css: centralized local declarations and existing fallback profiles.
- public/fonts/: 33 TTF binaries, five OFL notices, metadata/provenance manifests and README.
- scripts/check-local-fonts.cjs: offline integrity check.
- OPEN_SOURCE_LICENSES.md: font redistribution supplement.
- docs/app-workflow.md and generated app-workflow.html: dated change, presentation description, Mermaid annotation; overview paths/mapping unchanged.
- docs/player-portal-browser-checklist.md and this report: manual verification preparation/results.
- test-results/font-workflow.png: local workflow browser screenshot, untracked verification artifact.

Other pre-existing working-tree authentication/UI/documentation changes were preserved; they are not new changes in this font phase.
