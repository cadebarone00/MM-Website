# Copilot instructions for MM-Website

## Repo snapshot

This repo is a Next.js 16 app for The Maroon Tournament: public historical/leaderboard pages, a live event feed, and a signed-in portal for players/admins. The app mixes static data files, Supabase-backed account and portal features, and Google Sheets/Apps Script integrations for live scoring.

Key files to read before making changes:
- `project_specs.md` — product summary and data model
- `AGENTS.md` — repo-specific workflow and compliance requirements
- `docs/app-workflow.md` — workflow and scoring model changes
- `lib/data/types.ts` — canonical types for tournaments and scorecards
- `app/page.tsx` and `components/platform/PlatformHome.tsx` — entry points to the current app shell

## Build, test, and lint

Use the scripts in `package.json`.

- Install dependencies: `npm install`
- Start local app: `npm run dev` (runs on port 3001)
- Production build: `npm run build`
- Lint: `npm run lint`
- Full test suite: `npm test`
- Workflow docs sync: `npm run docs:workflow` then `npm run docs:workflow:check`
- Compliance metadata check: `npm run compliance:check`

Run a single test instead of the whole suite when debugging a targeted issue:
- `npx tsx --test lib/portal/requireHost.test.mts`
- `npx tsx --test lib/portal/requirePlayer.test.mts`
- `npx tsx --test components/platform/tournament-site/tournament-site.test.tsx`

Run ESLint on one file when iterating:
- `npx eslint app/page.tsx`
- `npx eslint components/platform/PlatformHome.tsx`

Useful browser smoke scripts exist for specific flows:
- `node scripts/test-public-site-browser.mjs`
- `node scripts/test-scoring-reliability.mjs`
- `node scripts/test-tournament-dashboard-browser.mjs`

## High-level architecture

### 1) Public site and tournament data

The public site is mostly route-driven under `app/` with components under `components/`. Historical tournament data is static TypeScript data under `lib/data/` and follows the shapes in `lib/data/types.ts`.

The site is not just a static marketing page: a lot of the content is generated from tournament objects, player profiles, and archives. If a change affects leaderboard logic, match data, or historical results, start in `lib/data/` and the matching page/component rather than treating the repo as a generic Next.js app.

### 2) Live data and Apps Script feed

The live event pipeline is split between:
- `appscript/live-feed.gs` — reads the live Google Sheet feed and powers the live leaderboard
- `appscript/write-scores.gs` — writes score submissions from the portal
- `supabase/*.sql` — database schema and migrations for portal/live scoring features
- `lib/data/live.ts` and supporting libs — live data consumed by UI components

Changes in scoring flow, live match publication, or sheet-backed data should be checked against the workflow docs and the relevant SQL schema before shipping.

### 3) Supabase-backed portal and auth

The site includes authenticated flows for the player portal/admin area, using Supabase and route logic under `app/portal/*`, `app/account/*`, and `lib/supabase/*`. These pages are intentionally separate from the historical/public pages even though they live in the same Next.js app.

When working on auth, portal permissions, or player/admin access, read the route file plus the relevant helper in `lib/portal/` or the matching Supabase client/server module before changing behavior.

### 4) Workflows and scoring rules are documented, not implicit

This repo has a lot of domain-specific workflow logic: tournament scoring, handicap tracking, wallet allocation, odds, broadcast, and course libraries. When a change touches user-visible workflow behavior, update `docs/app-workflow.md` and regenerate the HTML version, not just the source code.

For material feature work, also read:
- `LEGAL_COMPLIANCE_SPEC.md`
- `FEATURE_COMPLIANCE_CHECKLIST.md`
- `lib/compliance/featureRegistry.ts`

If the change updates compliance registry metadata, run `npm run compliance:check`.

## Key conventions

- Prefer matching the existing data types and route patterns; this repo uses explicit TypeScript models (`Tournament`, `UpcomingTournament`, `PlayerProfile`, etc.) instead of ad hoc shapes.
- Keep route pages under `app/` thin. Page-level logic is usually delegated to components under `components/` and helpers under `lib/`.
- Treat `lib/data/` as the source of truth for historical tournament content. Avoid creating duplicate data structures for the same tournament information.
- When changing score, handicap, or live-match behavior, check the related SQL in `supabase/` and the workflow docs in `docs/app-workflow.md`/`docs/superpowers/*` before patching the UI.
- Specific repo rules from `AGENTS.md` still apply: update workflow docs with user-visible changes and do not assume compliance without documenting it.
- For route or feature work affecting admin/player splitting or access control, look for existing patterns in `app/portal/*` and `lib/portal/*` rather than inventing one-off auth checks.

## Practical guidance for future Copilot sessions

- Start with `project_specs.md` and the relevant `app/` route; do not jump straight into a random component.
- If the change is a workflow or scoring feature, read `docs/app-workflow.md` and the related `supabase/*.sql` migration before editing behavior.
- If the issue is tied to data integrity or user-visible tournament logic, check the Google Sheets/App Script pipeline as well as the static TypeScript data.
- Keep changes localized and consistent with the repo’s existing patterns; many features are more domain-specific than generic web app code.

## MCP servers

If you want, I can add a relevant MCP server setup for this project (for example Playwright for browser-based verification, or anything else that matches the repo’s app/workflow tooling).
