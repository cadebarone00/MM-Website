# Maroon Masters Website — Project Spec

## What the app does

A public website for "The Maroon Masters" — an annual golf trip/tournament between two
friend groups, Team Maroon and Team White. It shows the history of every edition, team
rosters, live and historical leaderboards, hole-by-hole scorecards, and (this round) a
player/course statistics section. Visitors are the players themselves, their families,
and friends who want to follow the trip.

A companion Google Sheet (one per year, e.g. "2026 Maroon Masters") is where scores are
recorded during the trip. A Google Apps Script (`appscript/live-feed.gs`) reads that
sheet and feeds the live leaderboard during the event. Historical years are hand-entered
once into this repo's `lib/data/*.ts` files after the trip ends — there is no live sync
for past years.

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4
- **Data:** Static TypeScript data files in `lib/data/` — no database. Each past
  tournament is one file (`2024-pinehurst.ts`, `2025-danzante.ts`, `2026-palm-springs.ts`)
  conforming to the `Tournament` type in `lib/data/types.ts`. The upcoming tournament
  (`2027-upcoming.ts`) is a lighter `UpcomingTournament` type until its roster is final.
- **Live data:** Google Apps Script web app (`appscript/`) reads the live year's Google
  Sheet and feeds `lib/data/live.ts` / the live leaderboard components during the trip.
- **Hosting:** static Next.js build (no server-side secrets beyond what's already in `.env`).

## Pages / flows (existing, unchanged by this task)

- `/` — home
- `/history` — list of every past edition, links to that year's leaderboard
- `/leaderboard`, `/leaderboard/[slug]` — team + individual leaderboard for a given year;
  `/leaderboard/[slug]/players/[player]` — that player's scorecard for that year, with an inline
  hole-by-hole detail panel (stats + shot video) that fills in below the scorecard when a hole is
  clicked — there is no separate hole-detail page/route
- `/teams`, `/teams/[slug]` — roster directory for a given year (Maroon / White / Rankings tabs)
- `/schedule`, `/schedule/[slug]` — match schedule for a given year

All pages are public, no auth.

## Data model (existing)

- `Tournament` (`lib/data/types.ts`): slug, venue, location, dates, roster, team points,
  `matches: RealMatch[]`, `individualLeaderboard: IndividualStanding[]`, optional
  `scorecards: PlayerScorecard[]` (per-player, per-round, per-hole detail).
- `PlayerProfile` (`lib/data/players/*.ts`): id, slug, fullName, avatarSrc, bio, history —
  one file per player, looked up via `getPlayerProfile`/`getPlayerDisplayName`/`getPlayerAvatar`.

## Previously shipped rounds

- Fixed 2026 venue label to "Mission Hills CC".
- Trimmed the Rankings tab on Teams pages (rank + player + team only, no score/Bio).
- Added the career-wide "Stats" tab (Player / Course views) to the Teams page.
- Home page: two-column quick-glance row (Highlights left, Leaderboard/Teams/Schedule
  quick cards right) — `components/home/QuickLeaderboardCard.tsx`,
  `QuickTeamsCard.tsx`, `QuickScheduleCard.tsx`.
- Mobile home & navigation redesign (bottom tab bar, More panel, Account menu shell) —
  see `docs/superpowers/specs/2026-08-04-mobile-home-nav-redesign-design.md`. The
  Sign Up/Login buttons it added were inert placeholders, wired up in the round below.
- Accounts foundation: Supabase-backed Sign Up / Login / password reset, a post-login
  fork screen (`/account/choose`), a minimal player/host `/portal` (retiring the old
  separate scorekeeper app), and a Tiger-only `/portal/admin` for assigning player
  usernames — see `docs/superpowers/specs/2026-08-04-accounts-foundation-design.md`.
  Shipped in code and reviewed (`npm test`, `npx tsc --noEmit`, `npm run lint`,
  `npm run build` all clean); live verification against a real Supabase project,
  following `docs/supabase-setup.md`, is the one remaining step before this is fully
  in production use. Known non-blocking follow-up: `middleware.ts` uses the
  Next.js-16-deprecated "middleware" file convention rather than the newer "proxy"
  convention — a deliberate, open item for whoever picks it up next.

## Previously shipped rounds (continued)

- Kalshi-style layout redesign of the Wagers section — nav bar with
  back-button stack, 5 category pages (Team Futures, Player Futures, Matches,
  Fourballs, Props), a My Portfolio page, an entry loading splash, and an
  "MM Coins / Real Wagers" toggle (Real Wagers shows "Coming soon" — the real
  system is being built separately, see
  `docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md`).
  Visual/routing only — no changes to odds math, wallet, or wager placement
  logic. See `docs/superpowers/specs/2026-08-05-wagers-layout-redesign-design.md`.
- Live scoring, Tasks 1-4 of 7 (merged from `worktree-live-scoring-platform`):
  `/portal` now has a real player scoring panel — players enter hole-by-hole
  scores for themselves and their round partner, written through to the same
  Google Sheet that feeds the public `/leaderboard`. The Apps Script backend
  (`appscript/write-scores.gs`) was rewritten to trust one shared server
  secret (`SCOREKEEPER_SERVER_SECRET`) instead of the old player-code/
  host-password system. See
  `docs/superpowers/plans/2026-08-14-live-scoring-platform.md`.
- Two full-bleed loading screens, both using real photo backgrounds
  (`public/loading/desktop.png` / `mobile.png`, swapped at the `lg`
  breakpoint) with "The Maroon Masters" in the site's serif wordmark style:
  `components/LoadingScreen.tsx` is the shared presentational piece (a
  `raised` prop moves the title up to make room for content below it).
  `components/home/HomeEntrySplash.tsx` wraps the homepage and shows it,
  centered, once per browser session (`sessionStorage`) for ~1.2s before
  revealing the page — for fans and signed-out visitors. `/account/choose`
  (the post-login fork screen) now uses the `raised` variant with "Portal"
  and "Website" as plain-text links stacked underneath instead of the old
  boxed buttons; the existing server-side redirect (fan-only accounts skip
  straight to `/`) is unchanged.

## Known gaps / not yet built

- **Host scoring tools (Tasks 5-7 of the live scoring plan, not started):**
  `/portal/host` — pairings, round start/reset, direct score edits for
  Tiger — does not exist yet. `/portal`'s host view still shows "Host tools
  are coming in a later round." Until this ships, pairings/round management
  still needs to happen outside the site.
- **`SCOREKEEPER_SERVER_SECRET` is not yet configured** in `.env` or in the
  Google Sheet's Apps Script properties — player scoring will not work live
  until this is set on both sides (see Rule-2 walkthrough owed to the user).
- **Players cannot edit their own profile info** (bio, contact info, photo,
  or any other `PlayerProfile` field in `lib/data/players/*.ts`). All of
  that data is still hand-edited, static TypeScript files — there is no
  form, no database column, and no code anywhere in this repo for it. The
  old standalone "MM-Scorekeeper" app (a separate codebase/deployment this
  site used to proxy `/portal/*` to, retired 2026-08-04) may have had
  something like this, but its code was never part of this repository — it
  lived in that other app's own repo, whose current status is unknown to
  this project. This needs its own spec before any code is written.

## Out of scope for this round

Any functional Real Wagers mode, real fourball market data, the final
entry-splash image asset (placeholder background until provided), the host
scoring tools listed above, or player profile editing.
