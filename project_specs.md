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
- Course lookup on "Submit a score" (`/portal/handicap/new`): the wizard's first
  step is now a course-lookup screen — a search box that filters the course
  library live as you type, plus a "Recently played" list of this player's own
  most-recently-played courses (deduplicated, newest first, capped at 8; empty if
  they've never submitted a round). Picking a course moves into the existing tee
  set/date/tee-time step (unchanged, just without the course dropdown), then
  holes entry, then review, same as before. New
  `components/portal/handicap/HandicapCourseLookup.tsx`; `HandicapRoundSummary`
  gained a `courseId` field so "recently played" can map back to a course in the
  library reliably. `npm test`, `npx tsc --noEmit`, `npm run lint`, and
  `npm run build` all clean.
- 3-tab course picker on that same course-lookup screen: below the search box,
  **Recently Played** (default tab, same list as above), **Nearby**, and
  **My Courses**. My Courses = courses starred via a toggle on every course row
  (search results, Recently Played, My Courses alike); favorites live in
  `localStorage` (new `components/portal/handicap/useFavoriteCourses.ts`,
  mirrors the existing unused `useFavoritePlayers` hook) — per-device, not
  account-synced. Nearby is a "coming in a later round" placeholder (no course
  location data exists to compare against yet — see Known gaps below). Search
  still overrides all 3 tabs regardless of which is active. `npm test`,
  `npx tsc --noEmit`, `npm run lint`, and `npm run build` all clean.
- GHIN-style hole scoring card on both `components/portal/handicap/HandicapHoleEntry.tsx`
  (Submit a score) and the signed-in player's own fields in
  `components/portal/ScoringPanel.tsx` (live scoring): a total-score/to-par
  strip, a horizontal scrollable score picker, a `0 1 2 3 4+` putts pill row,
  and a 4-arrow-and-checkmark compass for Fairway/GIR (center = Hit, arrows =
  which way it missed) — new shared `components/portal/ShotDirectionPicker.tsx`,
  `ScorePicker.tsx`, `PuttsPicker.tsx`, `ScoreToParHeader.tsx`,
  `HoleActionBar.tsx` (the GPS + Next Hole bar; GPS is decorative — taps show
  "coming in a later round", no location call). Miss direction is now actually
  saved: `handicap_round_holes` and `live_hole_scores` each gained nullable
  `fir_direction`/`gir_direction` columns (migration
  `supabase/hole_shot_directions.sql`, run in Supabase 2026-09-10); the
  existing `fir`/`gir` hit-or-miss values are unchanged and the handicap
  formula doesn't use any of this. `/api/portal/scoring/state` now also
  returns the round's course holes (par/yards), which live scoring didn't have
  before. `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`
  all clean.
- Reworked that same scoring card per follow-up feedback: `ScorePicker` now
  shows real scorecard bubble notation (circle = birdie, double circle = 2-or-more
  under, box = bogey, double box = 2-or-more over, plain = par), sized larger,
  scored from 1 up to double par, and always keeps the selected score centered
  — tap a bubble or swipe the strip to it. `ShotDirectionPicker` gained a
  GIR-only "Penalty" button (top-right of the compass) for a missed green from
  a penalty stroke/lost ball rather than a directional miss — new
  `ShotDirection` value `"penalty"`, needs another migration (see Known gaps).
  Submit-a-score specifically (not live scoring, which still needs to jump
  between holes to confirm a partner's entries) also: dropped the 18-button
  hole selector and the player-name label — the card's top-left now shows
  "Hole N · Par P · Y yards" instead; score preselects at par per hole, and
  whatever's showing when you tap Next Hole is what's recorded (no separate
  "N of 18 entered" gate); Next Hole becomes "Review Round" on hole 18,
  replacing the old always-visible Review button; on mobile the whole screen
  becomes a fixed, non-scrolling full-screen card (`fixed inset-0`, `h-dvh`) —
  reverts to the normal in-page layout at the `lg` breakpoint. That mobile
  fixed-screen fit is a best-effort first pass and the most likely thing to
  need visual tuning once seen on a real phone. `npm test`, `npx tsc --noEmit`,
  `npm run lint`, and `npm run build` all clean.
- Second follow-up pass on the Submit-a-score card, on top of the round
  above: dropped the bordered card — the fixed full screen itself is now the
  only "box". Hole/Par/Yards and Total/To Par merged into one flush,
  edge-to-edge dark nav bar at the very top (bigger text), with a small "✕
  Edit setup" link in its corner replacing the old separate title/link.
  `ScorePicker` bubbles no longer recolor on selection — they always show
  their own par-relative shape (bigger now too); a translucent maroon box
  stays fixed in the picker's center and the strip slides scores through it.
  `ShotDirectionPicker` is bigger, moved its Penalty toggle next to the "GIR"
  label instead of into the compass grid (which also fixed uneven Left/Right
  spacing — the grid is now a fixed width so all 3 columns stay equal), and
  Fairway/GIR now sit in a 2-column layout split by a center divider, each
  compass centered in its half. `HoleActionBar`'s GPS and Next Hole buttons
  are now equal width. Live scoring is unchanged by this pass. `npm test`,
  `npx tsc --noEmit`, `npm run lint`, and `npm run build` all clean.
- Wired archived Maroon Masters tournament rounds into the real handicap
  index, closing a gap where the types/math for it already existed
  (`ArchivedHandicapRound.teeSetup`, `archiveIndex.ts`'s
  `combinedHandicapIndexes`) but nothing populated or read the data.
  `getArchivedHandicapRounds` (`lib/data/archivedScorecards.ts`) now reads
  the `handicap_setup`/`played_on` columns `supabase/archived_handicap_tees.sql`
  added (also folded into `schema.sql`); `/portal/handicap`'s page now calls
  `combinedHandicapIndexes` so "Overall Handicap"/"Low Index" include
  archived rounds and "Maroon Masters" shows a real number instead of a
  hardcoded "—"; `HandicapHome.tsx`'s archive rows show the assigned tee
  name/rating/slope instead of always "— / —". New Tiger-only bulk action
  ("Assign tees for handicap tracking" on `/portal/admin/scorecards`,
  `components/portal/tiger/ArchiveTeeAssigner.tsx` →
  `POST /api/portal/tiger/scorecards/archive-tees`) sets the course/tee
  set/date-played for every player's archived row of one tournament round
  at once — the write path that table never had. `npm test`,
  `npx tsc --noEmit`, `npm run lint`, and `npm run build` all clean.

## Known gaps / not yet built

- **Host scoring tools (Tasks 5-7 of the live scoring plan, not started):**
  `/portal/host` — pairings, round start/reset, direct score edits for
  Tiger — does not exist yet. `/portal`'s host view still shows "Host tools
  are coming in a later round." Until this ships, pairings/round management
  still needs to happen outside the site.
- **`SCOREKEEPER_SERVER_SECRET` is not yet configured** in `.env` or in the
  Google Sheet's Apps Script properties — player scoring will not work live
  until this is set on both sides (see Rule-2 walkthrough owed to the user).
- **`supabase/hole_shot_directions_penalty.sql` has not been run yet — same
  urgency as the migration before it.** The GIR compass's new "Penalty"
  button sends `gir_direction: "penalty"`, which the database will reject
  (its check constraint still only allows left/right/short/long) until this
  script runs once in the SQL Editor. Until then, tapping Penalty on the GIR
  compass will fail to save — everything else on both scoring screens is
  unaffected. (`hole_shot_directions.sql`, the migration this one follows, was
  run 2026-09-10.)
- **Players cannot edit their own profile info** (bio, contact info, photo,
  or any other `PlayerProfile` field in `lib/data/players/*.ts`). All of
  that data is still hand-edited, static TypeScript files — there is no
  form, no database column, and no code anywhere in this repo for it. The
  old standalone "MM-Scorekeeper" app (a separate codebase/deployment this
  site used to proxy `/portal/*` to, retired 2026-08-04) may have had
  something like this, but its code was never part of this repository — it
  lived in that other app's own repo, whose current status is unknown to
  this project. This needs its own spec before any code is written.
- **Course "Nearby" tab has no location data.** `live_courses` has no
  lat/long or city/state column at all, and nothing populates one today
  (GolfAPI.io's course-search endpoint returns a location string, but the
  import path that saves a course into the library discards it). The "Nearby"
  tab (My Handicap → Submit a score → course lookup) is a visible "coming in a
  later round" placeholder for this reason.
- **`supabase/archived_handicap_tees.sql` has not been run yet — this is what
  makes every archived Maroon Masters round in `/portal/handicap` show
  "— / —" instead of a real tee/rating/slope right now.** Confirmed missing
  by querying production directly (`column
  archived_scorecard_rounds.handicap_setup does not exist`). Run it in the
  SQL Editor before using the new "Assign tees for handicap tracking" panel
  on `/portal/admin/scorecards` — until then that panel's saves will fail.
  Even after it's run, each tournament round still needs tees assigned
  through that panel one round at a time; nothing is backfilled
  automatically, and the Maroon Masters index needs at least 3 assigned,
  eligible rounds before it shows a number (real WHS rule).

## Out of scope for this round

Any functional Real Wagers mode, real fourball market data, the final
entry-splash image asset (placeholder background until provided), the host
scoring tools listed above, player profile editing, or making "Nearby" actually
work (needs course location data — see Known gaps above).
