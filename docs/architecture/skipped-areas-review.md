**Side:** Website / Server (review only — nothing removed)

# Skipped areas: code review (app-first rebuild order, step 7) — 2026-11-25

Owner decision 2026-11-24: Pick'ems, Fantasy, Wagers (MM Coins), Watch Live, Schedule and Contact are **not** rebuilt in the Expo app. This is the map of their code and what still depends on it, so removal can be planned safely. **Nothing here is approved for deletion** — every removal needs Cade's OK (Claude.md: ask before deleting important files), and anything touching SQL is run by Cade.

## Headline

Every website **page** for these six areas is already retired: each `page.tsx` is a few-line `redirect()` ("Retired V1 URL"). Removing pages is cheap. The risk is in the **backend** (lib, API routes, database tables), because kept features still lean on parts of it.

## Per area

| Area | Pages today | Backend still used by kept features? | Safe to remove first | Do NOT remove without a plan |
|---|---|---|---|---|
| **Pick'ems** | `/pickems` → `/leagues`; `/my-team`, `/fantasy`, `/wagers/*` redirect through it | No backend | Unused `app/pickems/page.module.css`, `PickemsIcon` (unused) | `/pickems` itself until `/fantasy`, `/wagers/*`, `/my-team` point straight at `/leagues` |
| **Fantasy** | `/fantasy` → `/pickems` | `lib/fantasy/*` only used by `app/api/fantasy/*` | `app/api/fantasy/*` + `lib/fantasy/*` (+ tests) | `fantasy_teams` table (database only, no SQL file); the `"fantasy"` entitlement + `maroonAdapter` "More" links + `accessPolicy` patterns (update tests with them) |
| **Wagers / MM Coins** | `/wagers/*` and admin wager pages redirect | **Yes**: live match close-out (`close_live_match_atomic` settles MM Coins markets), `refreshFutures` in live scoring + handicap + closeout routes, `lib/odds` feeds live match odds, test-season reset | Unused `lib/hooks/useMMCoinsAccount.ts`; the public `/api/wagers/*` market routes once nothing links to them | `mm_coin_bets`, `wagers_accounts`, `wagers_market_settlements` — **account deletion SQL counts and deletes them** (`supabase/account_deletion.sql`, the daily deletion cron, `deletionCopy.ts` "open MM Coins bet"), and match close-out calls them |
| **Watch Live / broadcast** | `/watch-live` → `/tap-in`; `/broadcast` still renders the Tap In display | **Yes, heavily**: `lib/broadcast/*` + `components/broadcast/scenes` + broadcast tables power Tap In (The Maroon Live), live standings and the season catalog | Only the `/watch-live` page entry point | `lib/broadcast`, the scenes, the broadcast tables, `/broadcast` (Tap In uses it). `/watch` (tournament/league watch codes) is a different, kept feature |
| **Schedule** | `/schedule*` → `/golf-trips` | Barely: `/api/upcoming-round-schedule` (no caller), `/api/countdown` → only an unused `RoundCountdown` | Those two routes + `useCountdownTarget` + `RoundCountdown` | `public/schedule/*` images (Golf Trips content + the app use them); `lib/data/liveCourseSchedule.ts` (shared); the `schedule` website-section setting + its SQL check constraint |
| **Contact** | `/contact` → `/website#support` | No backend | — | The route itself: Settings (website **and the Expo app**), Request access and Creator access link to it; the App Store needs a support contact. Repoint links to `/website#support` or the email first |

## Shared places to update together with any removal

`components/app/AppShell.tsx` (`IN_APP` list), `components/app/AppComingSoon.tsx`, `lib/platform/maroonAdapter.ts` (More links), `lib/platform/entitlements.ts`, `lib/account/accessPolicy.ts`, `lib/website/settings.ts`, `next.config.ts` (`/broadcast` frame header), `scripts/app-first-baseline.json`, and the tests that name these routes (`accessPolicy`, `entitlements`, `maroonAdapter`, `website/settings`, `siteBottomNav`, `accountDeletionDatabase`, `test-v1-retirement-browser.mjs`, `test-main-nav-browser.mjs`).

## Suggested order (proposal — needs Cade's approval per step)

1. **Clean-ups with no users:** Fantasy API + lib, `useMMCoinsAccount`, `RoundCountdown` + countdown hook/route, `upcoming-round-schedule`, unused Pick'ems CSS/icon. One commit, tests updated.
2. **Short-circuit redirects:** point `/fantasy`, `/wagers/*`, `/my-team` straight at `/leagues`; then retire `/pickems` and `/watch-live` page files (and their `.app.tsx`), updating the shared lists above.
3. **Wagers backend (needs a spec + SQL, Cade runs it):** first take MM Coins out of match close-out and account deletion, then the futures routes / `refreshFutures`, and only then drop the three tables.
4. **Keep:** broadcast engine (Tap In), `/watch`, `public/schedule/*`, Contact (repoint, don't remove).
