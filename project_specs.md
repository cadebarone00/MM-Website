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
  `/leaderboard/[slug]/players/[player]` — that player's scorecard for that year;
  `/leaderboard/[slug]/players/[player]/[round]/[hole]` — hole detail
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

## This round's work

### Accounts foundation (Sign Up / Login / player & host portal access)

Full design: `docs/superpowers/specs/2026-08-04-accounts-foundation-design.md`.

Adds the site's first real backend (**Supabase** — Postgres + built-in Auth) and turns
the placeholder Sign Up/Login buttons into working account creation and login for
anyone (fans, family, players). Players and Tiger (host) additionally reach a
minimal `/portal` after a post-login fork screen (`/account/choose`). The old,
separate "scorekeeper" Vercel app is retired — `/portal` is now a real route in this
app, not a proxy. Tiger pre-assigns each of the 13 `lib/data/players` a username on a
new host-only `/portal/admin` page; a person who signs up with that exact username is
automatically linked to that player's profile (name/team/avatar), everyone else gets
an ordinary fan account. See the design doc for the full data model, page list, and
error handling.

**Done when:** `/signup`, `/login`, `/forgot-password` work end to end against
Supabase; the desktop header (previously had no logged-out entry point at all) and
mobile Account menu both link to them; a fan sign-up produces an ordinary account with
no portal access; signing up with a Tiger-assigned player username links the account
to that player and shows `/account/choose` on next login, from which "Portal" reaches
`/portal` with correct player identity and "Website" continues normally;
`/portal/admin` is reachable only when signed in as Tiger.

## Out of scope for this round

- Scoring, pairings, round start/reset, or live score editing (future rounds).
- Whether portal scoring will write to the existing Google Sheet or a new database
  table (deferred decision, see design doc).
- Real content for `/my-team`, `/fantasy`, `/vault`, `/merchandise`, `/settings` —
  stay as "Coming soon" stubs.
- Any change to `/leaderboard`, `/teams`, `/schedule`, `/history`, or the public
  live-feed pipeline (`appscript/live-feed.gs`, `/api/live-feed`).
- Social login (Google/Apple) — email/username + password only for now.
