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

## This round's work

### Home page: quick-glance cards + Highlights takes the left column

Redesign the top block of `components/home/HomeDashboard.tsx` (currently 3 big square
`ActionCard`/`ScheduleCard` tiles plus a `HighlightsRail` sidebar) into a single
two-column row that stays side-by-side at every viewport width (it shrinks to fit on
narrow screens — it does not reflow into a mobile stack):

- **Left column:** the existing `HighlightsRail` content/styling, now the dominant,
  wide element in the row (roughly 75% width at desktop). What populates the highlight
  entries is out of scope here (a manually-curated list today; will later be filled by
  a separately-trained AI writer) — only the layout slot changes.
- **Right column:** a slim, fixed-ish-width stack of three new small rectangle cards,
  each a `Link` to its full page, each pulling from the same `/api/live-feed` polling
  already used elsewhere on the site (via `useLiveTournament`) — no backend changes.

1. **Leaderboard card** (`components/home/QuickLeaderboardCard.tsx`) — top 5 rows of
   `individualLeaderboard` sorted by `toPar` ascending (rank + player name + `ScoreBadge`
   sm). Uses live 2027 data once `LIVE_FEED_URL` is configured and the leaderboard has
   entries; until then, falls back to `latestCompleted` (2026)'s top 5, with a small
   "2026" label so it's clearly not live. Links to `/leaderboard`.
2. **Teams card** (`components/home/QuickTeamsCard.tsx`) — two mini-columns, Maroon
   roster (6 names) left / White roster (6 names) right, with the live
   `fmtPt(maroonPts)`–`fmtPt(whitePts)` total across the top. Same live-2027-else-
   fallback-to-2026-labeled behavior as the Leaderboard card, driven by the same
   `roster`/`maroonPts`/`whitePts` fields `mergeLiveTournament` already produces. Links
   to `/teams`.
3. **Schedule card** (`components/home/QuickScheduleCard.tsx`) — replaces the existing
   `ScheduleCard`. Default state shows the placeholder "Round 1 starts 1/6/2027 · Mission
   Hills CC" (from `nextTournament`). If any match in the live feed has
   `status === "live"`, it swaps to that match's day + session + format, e.g.
   "Round 2 — Afternoon: Fourball". Links to `/schedule`.

**Done when:** home page renders the new two-column row (Highlights left, 3 stacked
quick cards right) at mobile/tablet/desktop widths with no reflow/reordering; each quick
card shows live 2027 data when the feed has it and a clearly-labeled 2026 fallback when
it doesn't; the Schedule card correctly swaps to the in-progress round when a match is
live; News and Socials sections below are unchanged; no hydration errors introduced
(verify per the earlier `RoundCountdown` hydration fix pattern — no `new Date()`/`Math.random()`
evaluated directly in render).

## Out of scope for this round

- What content fills the Highlights rail (curation/AI-writer pipeline is separate work).
- Any change to the live-feed backend, Apps Script, or `/api/live-feed` response shape.
- The News and Socials sections on the home page.
- Per-player links/avatars inside the Teams quick card — names only, whole card links to `/teams`.
