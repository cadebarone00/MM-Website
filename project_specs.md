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
- **Course location (City, State, Zip).** `live_courses` gained optional
  `city`, `state` (two-letter code), `zip_code` columns — migration
  `supabase/course_library_location.sql`, run in production 2026-09-11.
  Course Library home page and the Review/edit tees page both show "City, ST"
  in small grey text under the course name (blank if not set), with an "Edit
  location" control (new `components/portal/tiger/CourseLocationEditor.tsx`)
  that opens a City text box / State dropdown / optional Zip box, next to the
  existing "Edit course name" control (the name column was widened to fit
  both). My Handicap → Submit a score shows the same "City, ST" line
  everywhere a course name appears: the lookup/search list, the confirmed-course
  step, and the final review screen. Zip is never displayed — it's stored only
  for a future "Nearby" lookup (see Known gaps). New shared
  `lib/data/usStates.ts` (dropdown options) and `lib/data/courseLocation.ts`
  (`formatCourseLocation`, pure, tested). `npm test`, `npx tsc --noEmit`,
  `npm run lint`, and `npm run build` all clean.
- **Real handicap calculation, live end-to-end.** Two bugs kept
  `/portal/handicap`'s "Maroon Masters"/"Overall Handicap" (and the smaller
  copy of the same number on the `/portal` home screen) stuck on "—" for
  every player, even though the WHS math itself was already correct and
  Tiger had already assigned tees for several rounds:
  1. `/portal`'s home-screen number only ever looked at self-submitted
     "Submit a score" rounds (none exist yet), ignoring the Maroon Masters
     archive the dedicated page already combines in — now it calls the same
     `combinedHandicapIndexes` the dedicated page uses, so the two screens
     never disagree.
  2. Every archived tournament round had a blank `format`, so
     `archivedDifferential` (`lib/handicap/archiveIndex.ts`) — which only
     counts rounds where a player posts their own individual score
     (Fourball, Singles; never Alternate Shot/Foursomes, confirmed with
     Cade 2026-09-11 — you don't play your own ball the whole round) — threw
     every single round out.
  Fixing #2 turned into a real data-model correction, not just a backfill:
  the archived `round` numbers for 2026-palm-springs only counted rounds
  with an individual score (1-6), skipping Alternate Shot entirely, so
  "Round 5" in the archive was actually the trip's 7th round. Cade wanted
  `round` to always mean the true round of the trip going forward. Fixed
  for **2026-palm-springs only** (12 players): `scripts/rebuild-2026-round-numbering.ts`
  renumbered every row (old 1→1, 2→3, 3→4, 4→5, 5→7, 6→8 — 2 and 6 are
  Alt Shot, no row exists for them) and, while there, ran the already-coded
  but never-executed Cove/Classic course-name swap from the gap below —
  turned out that swap had already happened some other way (0 rows
  matched), so it was a no-op. Then `scripts/backfill-archived-round-format.ts`
  (rewritten to read format straight from the new
  `lib/data/tournamentRoundSequence.ts`, tested) tagged all 72 rows.
  Verified end-to-end against real production data:
  `combinedHandicapIndexes` now returns a real number for every 2026
  player. `npm test`, `npx tsc --noEmit`, `npm run lint` (pre-existing,
  unrelated failures elsewhere untouched), and `npm run build` all clean.
- **Real handicap calculation, part 2 — 2025-danzante.** Same fix as above,
  applied to the other tournament. Every player had 5 archived rounds
  where only 4 were expected (2 Fourball + 2 Singles); opened the actual
  trip spreadsheet (`Maroon Masters Danzante (1).xlsx`, "Player Input"
  sheet) to find the real cause instead of guessing — its own column
  headers label 5 saved scorecards "Round 1/2/3/5/6" (genuinely skipping
  "Round 4"), and per Cade (2026-09-14) the real story is: the trip played
  7 rounds total (2 Fourball, 2 Alt Shot, 2 Singles, **plus one extra
  individual-champion round unrelated to the Maroon-vs-White match play**),
  and that extra round got saved under "Round 2" in the original
  spreadsheet by mistake — Alt Shot still has no archived row for either
  of its two rounds, same as every other year. Fixed via
  `scripts/rebuild-2025-round-numbering.ts`: old round 1→1, **2→0** (the
  individual-champion round, format set directly to "Individual"), 3→3,
  4→5, 5→6. Round 0 is a new concept — a real archived round that isn't
  part of a tournament's numbered match-play sequence — so it needed an
  actual display convention, not just a backfill: new
  `lib/data/roundLabel.ts` (`formatRoundLabel`, tested) shows it as **"Round
  INDI"** everywhere a round number appears (My Handicap history, the
  admin scorecard editor + rounds list, the "Assign tees" panel, the public
  leaderboard scorecard page). Surfaced and fixed a real bug along the way:
  `validateAssignArchiveTeesInput` (`lib/handicap/validate.ts`) rejected
  round 0 outright, which would have permanently blocked assigning a
  tee/date to Round INDI. Before writing anything, built a full
  player-by-player verification table (round, partner, opponents, real
  score, cross-checked against the database) and had Cade manually confirm
  it — Alt Shot's match-level results (no individual score exists, but the
  team result does, in `lib/data/2025-danzante.ts`'s `matches`, a
  completely separate table from the handicap archive) were checked the
  same way. Verified end-to-end after applying: hole-by-hole totals
  unchanged, formats correctly tagged, `combinedHandicapIndexes` computes
  correctly (still `null` for 2025-only players like Peyton Vos until tees
  are assigned — see Known gaps, not a bug). `npm test`, `npx tsc
  --noEmit`, `npm run lint` (pre-existing, unrelated failures elsewhere
  untouched), and `npm run build` all clean.

- **Real "Send Invite" button on Players & Teams**, replacing "Copy
  Invite Link" (`/portal/admin/master-settings/[year]/players-teams`,
  `components/portal/PlayerSlotsAdmin.tsx`). Copy Invite Link only ever
  copied a `/signup?code=<username>` URL for Tiger to send by hand —
  nothing in this repo had ever emailed a player. Clicking "Send Invite"
  now expands an email box (pre-filled from any address already on file,
  same expand-a-row pattern as "Edit directly") and, on submit, calls new
  `POST /api/portal/tiger/invite` (host-gated, mirrors
  `/api/auth/signup`'s create-then-rollback shape): Supabase's
  `auth.admin.inviteUserByEmail()` creates the player's login and sends
  Supabase's own built-in invite email (no new third-party service or
  secret), then their `profiles` row is inserted (known `fullName`, the
  slot's already-assigned `username`, `player_slug`) and the slot is
  marked claimed — Status flips straight to "Claimed," same as self-serve
  signup does today. The emailed link lands them on the *existing*
  `/reset-password` screen (unchanged) to set a password — no separate
  sign-up form, since name/username/team are already known. `player_slots`
  gained a nullable `email` column to remember the address for a resend
  (migration `supabase/player_slots_email.sql`, a standalone one-off file
  like `course_library_location.sql`/`hole_shot_directions.sql` —
  `schema.sql` turns out not to actually carry those later columns either,
  despite an earlier round's notes claiming otherwise; not fixed now, just
  not repeated here). The existing "Unlink" button is the undo path for a
  wrong email or an invite the player never completes — no new undo
  mechanism needed. `npm test` (one pre-existing, unrelated failure in
  `lib/wagers/navBarContent.test.ts`, confirmed to fail the same way with
  this round's changes stashed out), `npx tsc --noEmit`, `npm run lint`
  (clean on every file this round touched), and `npm run build` all
  clean. **Not yet verified against a real Supabase project** — running
  `supabase/player_slots_email.sql` once in the SQL Editor and sending a
  real invite end-to-end is the one remaining step (see Known gaps).
  Also: Supabase's built-in invite email is rate-limited on the free plan
  (~a handful/hour) unless custom SMTP is configured later — fine for a
  few invites at a time, not for blasting the whole roster at once.
  **Update 2026-09-18: live-verified by Cade — sending an invite email
  through the app works.**
- **Send Invite now always uses one saved email per player, instead of
  retyping it at send time.** Follow-up to the round above, same files.
  There's no "email" field anywhere in a player's info/bio/portal area —
  that system is entirely public bio content (Instagram, hometown, etc,
  `lib/data/players/overrides.ts`'s `EDITABLE_PLAYER_FIELDS`, rendered on
  the public `PlayerBioSection`) — so a real per-player email needed its
  own place to live rather than piggybacking on that public system.
  Players & Teams now shows each unclaimed player's email (or "No email
  on file") right under their name, with an "Edit email" toggle
  (identical expand-a-row pattern) that saves through a new, tiny `POST
  /api/portal/tiger/player-email` straight to `player_slots.email` — no
  more typing an address inside the invite flow itself. "Send Invite" is
  now a plain one-click button (disabled with no email on file); `POST
  /api/portal/tiger/invite` dropped `email` from its request body
  entirely and always reads `player_slots.email` server-side, so there is
  exactly one place an address is entered per player and every consumer
  (today, just the invite) reads from it. `npm test` (283/283, including
  the previously-noted unrelated `navBarContent.test.ts` failure, which
  something else fixed in the meantime), `npx tsc --noEmit`, `npm run
  lint` (clean on every file this round touched), and `npm run build`
  all clean.
- **Show every player's email, not just unclaimed ones; stack "Edit
  email" under it; taller rows.** Follow-up to the round above. Claimed
  players who signed up the old way (self-serve via a copied invite
  link, before `player_slots.email` existed) had no email saved there —
  the page now falls back to their real Supabase Auth account email
  (`profiles.email`, looked up via `claimed_by`) whenever
  `player_slots.email` is empty, so a real address (or a clear
  path to add one) shows for every player. `player_slots.email` still
  wins whenever it's set, since that's the one "Edit email" writes to —
  editing a claimed player's email is guaranteed to visibly take effect
  rather than being silently shadowed by the account-email fallback.
  "Edit email" moved from beside the email to its own line below it, and
  row padding went from `py-2` to `py-4` to fit the extra line
  comfortably. `npm test` (283/283), `npx tsc --noEmit`, `npm run lint`,
  and `npm run build` all clean.
- **Global Players page — Add Player, Edit name & email, and a
  name-vs-slug split.** Player management moved out of the per-year
  Players & Teams page into a new Tiger Center → Global Tools → **Players**
  page (`/portal/admin/players`, `components/portal/tiger/GlobalPlayersAdmin.tsx`).
  It has **+ Add Player** (name and email only), **Edit name & email**
  (replaces the old email-only panel), username, claimed/unclaimed status,
  pending bio approvals, "Edit directly", Unlink, and Send Invite — the
  same tools as before, just in one global place. The per-year Players &
  Teams page shrank to each player's name plus **Unassigned / Maroon /
  White** and the lock toggle (`components/portal/PlayerTeamAssignment.tsx`);
  it reads the same global list, so a player added once shows up in every
  year. `components/portal/PlayerSlotsAdmin.tsx` is deleted. Both pages
  share one helper, `getAllPlayerRows()` (`lib/portal/allPlayers.ts`): the
  13 hand-written players first, then any DB-only `player_slots` rows.
  **Identity:** a player's slug is permanent and never editable (it keys
  all past history, exactly as recorded); the *visible* name is an optional
  override in the new `player_slots.full_name` column, resolved as
  override → hand-written name → slug. A new player's slug comes from
  their name (`lib/portal/computePlayerSlug.ts`, `-2`/`-3` suffix if it
  clashes with a hand-written or existing slug) and gets a username the
  same way the seeded players did. Routes: `POST
  /api/portal/tiger/player-add` and `/player-name` (host-only). **A new
  player is a full working player** with no stats for 2024–2026: portal
  home shows their name, Edit My Bio works (a profile is synthesized when
  there's no hand-written file), Send Invite uses their visible name as
  `display_name`, and the public Confirmed Roster shows their name (and
  the exact-slug avatar, so a one-word name like "Cade" doesn't borrow a
  hand-written player's photo). A player left **Unassigned** for a year has
  no rounds or matches that year — just their portal and the site.
  **`requirePlayer()` now accepts a player with no hand-written profile
  file** (it used to reject them, which would have blocked bio saves,
  handicap, and live scoring for anyone added through the page). For the 13
  hand-written players it returns the identical session as before. Safe
  because `profiles.player_slug` is only ever set server-side (sign-up
  claim, Tiger invite) and is a foreign key into `player_slots`. The two
  legacy Google-Sheet scoring routes (`score/round`, `score/submit-hole`)
  return 403 for a DB-only player (that sheet only knows the hand-written
  roster), and `/portal/career` now passes the slug instead of the first
  name so a new player can't alias to a hand-written one. **Not reached by
  a rename (and shows the raw slug for a DB-only player):** the historical
  leaderboard, scorecard, wagers, and broadcast pages, the in-progress
  `LivePlayerScorecard.tsx`, live-scoring partner names, and Tiger's
  matchups lists — those still read the static hand-written name helpers.
  `/portal/career` also 404s for a new player until they have stats.
  **Before this works in production, run `supabase/player_slots_full_name.sql`
  once in the Supabase SQL Editor** (adds the `full_name` column; sending
  an invite selects it, so invites fail for every player until it's run).
  `npm test` (311/311, including new tests for the slug helper, the
  shared player list, both new routes, and the `requirePlayer` identity
  helper), `npx tsc --noEmit`, and `npm run build` (which lists the new
  Players page and both new routes) all clean; `npm run lint` is clean on
  every file this round touched (the repo's existing lint errors are all in
  broadcast/scorecard files and `scripts/render-workflow.cjs`, untouched
  here). **Not click-tested in a real browser:** the Global Players page
  and the per-year page sit behind Tiger login — verified by type-check,
  build, and unit tests of the pure logic, not by using them.
- **Scorecard** (first built as "Round Recap", then reworked into a real
  scorecard grid after feedback) — the hole-by-hole review screen shared
  by both "Submit a score" and live scoring: new
  `components/portal/Scorecard.tsx` is a horizontally-scrolling grid with
  a fixed left column of row labels (Hole, Yardage, Score, Putts,
  Fairway, Green) and one column per hole; each cell shows what was
  actually chosen — a score bubble (reusing the public scorecard's
  `HoleMarkerForDiff`), the putts count, and a green check / colored
  arrow / red X for fairway and green ("–" until entered, "N/A" for a
  par-3 fairway). Only the hole-number cell is tappable, jumping back to
  that hole. The top reuses the dark `ScoreToParHeader` bar (its
  undefined `maroon-950` color, which made it invisible, is now
  `maroon-900`). A "Scorecard" link sits directly under the
  Total/To Par header in both flows, as its own element (not part of
  `ScoringRoundHeader`), reachable from any hole. A hole only counts as
  entered once putts/GIR/fairway are actually set — the score field
  alone defaulting to par doesn't count (pure `buildScorecardRows` in
  `lib/handicap/scorecard.ts` for the handicap draft, and in
  `lib/live/holeSubmission.ts` for live scoring's submissions;
  `isRoundComplete`/`firstIncompleteHole` live in the shared
  `lib/portal/scorecard.ts`, all TDD'd). This replaces
  `HandicapRoundReview.tsx` entirely (deleted) — `HandicapHoleEntry` now
  owns the scorecard overlay and the final submit call itself, and the
  wizard's separate "review" step is gone; hole 18's button still reads
  "Review Round" and opens the same screen, whose Submit button stays
  disabled ("Finish all 18 holes to submit") until every hole is
  entered. Live scoring's scorecard shows the playing competitor's own
  grid underneath yours — read-only navigation only; live scoring still
  submits hole-by-hole exactly as before, since the round-level "can't
  submit until both sides agree" gating is a separate, later piece of
  work. Left out on purpose (not asked for): a totals column, front/
  back-nine paging, par/stroke-index/adjusted-score rows, and per-hole
  confirmed/disputed text (the existing hole-selector strip still shows
  that in the normal entry view). `npm test` (294/294), `npx tsc
  --noEmit`, `npm run lint` (clean on every file this round touched),
  `npm run build`, and `npm run test:browser` (extended with Scorecard
  coverage for both flows) all clean.

- **Handicap "Round in progress" + Exit.** Once you press "Start round"
  on Submit a score, the portal header's top-left arrow reads **Exit**
  (all screen sizes; before that it's the normal Back). Exit just goes to
  My Handicap — the draft is already saved on every tap. The current hole
  is now saved too (new `holeKey`, so coming back lands on the same hole).
  My Handicap shows a new **Round in progress** box between the Maroon
  Masters/Overall tabs and the scores list
  (`components/portal/handicap/RoundInProgressCard.tsx`), laid out like a
  completed round: to-par where the score goes (E / +3 / -1, same math as
  the hole screen's header), blank differential, date/course/tee, and
  rating/slope. Tapping it offers **Continue playing** (reopens the round
  on the saved hole) or **Delete round** (asks "Delete this round? This
  can't be undone." first, then clears the wizard state, hole draft, and
  saved hole). All key names and the read/summarize/delete logic live in
  `lib/handicap/roundInProgress.ts` (TDD'd, with shared `runningTotals`,
  `formatToPar`, `formatRoundDate`); `components/nav/RoundExit.tsx` is the
  small context that lets the wizard tell `PortalHeader` a round is
  underway. **Device-only:** a round in progress lives in that browser's
  localStorage like the drafts always have — starting on a phone and
  finishing on a laptop isn't supported (would need a server-side draft
  table). "Submit a score" still reopens the round in progress rather
  than starting a second one. Handicap only — live scoring is unchanged.
  `npm test` (311/311), `npx tsc --noEmit`, `npm run lint` (clean on
  every file this round touched), `npm run build`, and `npm run
  test:browser` (extended: hole memory, the box, Continue/Delete) all
  clean. **Not click-tested in a real browser:** the Exit label itself
  (it sits behind login) — verified by type-check, lint, and build only.
- **Handicap Scorecard: round totals, Submit Round pill, confirm step.**
  Under the scrolling grid on the handicap Scorecard there is now a
  five-across totals box — Score, To Par, Putts, Fairways (% plus hit/
  total, par-3s excluded), Greens — over the holes entered so far, then a
  full-width **Submit Round** pill (disabled, reading "Finish all 18
  holes to submit", until every hole is entered). The box is the same
  component the player profiles' archived rounds use: the markup moved
  out of `ArchivedScores.tsx` into the new shared
  `components/scorecard/RoundStatsBox.tsx` (profile stats and their order
  unchanged), and the totals math is the new pure, tested
  `scorecardTotals` in `lib/portal/scorecard.ts`. Tapping Submit Round
  opens a **Confirm** dialog — "After you submit scores you will not be
  able to edit them." — with **Submit Scores** and **Keep editing**
  (default focus, and Escape also backs out, so a stray tap can't submit;
  a failed submit shows its error inside the dialog). A successful submit
  now lands on `/portal/handicap?tab=overall` (new `initialTab`), i.e. the
  Overall tab, where the new round's differential shows and the overall
  index is recalculated (unchanged existing calculation; the index still
  needs 3+ rounds). Handicap only — the live Scorecard has no totals box
  or submit yet (see Known gaps). Also fixed the Scorecard's "not every
  hole is entered" banner, whose background used a color (`gold-100`)
  that isn't in the theme; noted but left alone: the profile stats box's
  own dividers use that same missing color, so they render black on the
  live site. `npm test` (318/318), `npx tsc --noEmit`, `npm run lint`
  (clean on every file this round touched), `npm run build`, and `npm run
  test:browser` (extended: totals, dialog, Escape/Keep editing) all clean.
- **Handicap: "Submit a score" respects a round in progress; header total
  only counts holes you've moved past.** With a round in progress, My
  Handicap's **Submit a score** button (new
  `components/portal/handicap/SubmitScoreButton.tsx`) opens an "Already
  have a round in progress" popup showing the course and the to-par, with
  **Continue round** (default focus; reopens the round on its saved hole)
  and **Start a new round** (deletes the round in progress, then lands on
  the course selector, with a line under it saying so). Escape or a tap
  outside closes it and deletes nothing. With no round in progress it's a
  plain link as before. The read/delete logic for the popup and the
  Round in progress box is now one shared hook,
  `lib/handicap/useRoundInProgress.ts`. Separately, the hole screen's
  header **Total / To par** now counts only holes you've moved past —
  Total: 0 on hole 1, Total: 5 on hole 2 after a 5 on hole 1, and hole 2's
  score joins once you go to hole 3 (`runningTotals`, tested; even par
  now reads "E" instead of a dash on hole 1). The Round in progress box's
  to-par uses the same rule. **Live scoring's header total is unchanged**
  (it still totals submitted holes through the one you're viewing) — to be
  revisited with the live scoring work. Both dialogs (this one and the
  Scorecard's Confirm) are now portaled to the page root so a parent's
  stacking context can't put the site header over them. `npm test`
  (318/318), `npx tsc --noEmit`, `npm run lint` (clean on every file this
  round touched), `npm run build`, and `npm run test:browser` (extended:
  header total, the Submit a score popup, default focus, start-new
  deleting) all clean. The browser test caught a real bug on the way:
  `autoFocus` doesn't work on a link, so Continue is focused explicitly.

- **Live scoring Phase 1 — player lifecycle** (spec
  `docs/superpowers/specs/2026-09-20-live-scoring-round-lifecycle-design.md`,
  plan `docs/superpowers/plans/2026-09-20-live-scoring-phase1-player-lifecycle.md`).
  The **Scoring tab** now shows the full matchup (round, format, course, tee
  time, "You & X vs. Y", and "You are scoring: <name>") with **Begin Round**
  (**Continue Round** once a hole is in, **View Scorecard** after you have
  submitted); it moves on to the next round as soon as you **and your scorer**
  have both submitted, without waiting for Tiger (`withoutFinishedMatches`,
  `scoringStage`, `loadScoringProgress`). The live **Scorecard** no longer
  shows the competitor's grid — only your own entries, a second score row
  with what *you* entered for your opponent, hole numbers that turn red where
  you and your scorer disagree, and a round status box that is **white**
  (your scorer hasn't finished), **red** (a hole disagrees) or **green**
  (everything matches); the **Submit Round** pill is grey until green, then
  maroon, and asks "After you submit your round you will not be able to edit
  it. Tiger can correct it later…" before locking your card (pure logic:
  `lib/live/roundStatus.ts`, tested). New migration
  **`supabase/live_round_submission.sql`** — *must be run once in the
  Supabase SQL Editor* (after `live_hole_submissions.sql` and
  `scoring_reliability.sql`): `submit_live_hole` no longer auto-submits at 18
  matching holes and now rejects entries from a player who has submitted;
  new RPC `submit_live_round` (the validation from the old unused
  `/api/portal/scoring/submit`, now one transaction) records the submission
  and, when the player **and their scorer** (all four in Foursome) have
  submitted, marks their archive rounds with a new `submitted` status; a
  guard trigger stops later score writes moving an official round back to
  `live`. **Handicap now counts a live round only when its archive status is
  `submitted` or `final`** (`mapFutureHandicapRounds`); player statistics and
  the odds model still read matched holes as they arrive, unchanged. Tiger's
  Match Closeout card lists who has not submitted, disables Close Out Match
  until everyone has, and offers "Close out anyway". Not built yet (Phases 2
  and 3 of the spec): Tiger's Edit Scores for live rounds, wager reversal,
  and the public leaderboard/team points coming from live scoring with the
  Google Sheet as a backup. `npm test` (328/328), `npm run test:db` (all
  scenarios, incl. no auto-submit, lock, scorer-edit-never-unsubmits,
  official-only-when-both-submit, Foursome needs four), `npx tsc --noEmit`,
  `npm run lint` (clean on every file this round touched), `npm run build`,
  and `npm run test:browser` (white/red/green states, other scorer's numbers
  never shown, Submit Round asks first then locks) all clean. **Not
  click-tested against the real app:** the Scoring tab screen, its loader,
  and Tiger's card sit behind login and a real database — covered by
  type-check, lint, build and the tested logic they call — so a two-phone
  check after running the migration is the remaining step.

- **Tiger Center testing for the live scoring lifecycle** (follow-up to
  Phase 1, since the tournament isn't live). Two tools, both extended.
  **Live Scoring Page Editor** (two phones on one screen, in memory only, no
  SQL needed): the phones now offer **Submit Round**, lock after it, and turn
  the round official when the other phone submits too; a line above each
  phone shows what that player's real **Scoring tab** would say (Begin /
  Continue / View, "Through N holes", "Waiting on …", "moves on to your next
  round"), and a banner says whether the round is official and would count
  toward handicap and the rounds archive. The rules live in the pure, tested
  `lib/live/scoringPreviewRoom.ts` (same rules as the database:
  `applyPreviewHole`, `applyPreviewRoundSubmit`, lock, official-when-both).
  The Scoring-tab wording is now shared (`lib/live/scoringStageCopy.ts`) by
  the real screen and the preview. **2034 Test Season** (the real system with
  disposable test data; needs `supabase/live_round_submission.sql` run once):
  the panel gained a **How to rehearse** guide and a live **Rehearsal
  status** (`TestSeasonStatus`, `GET /api/portal/tiger/test-season/status`,
  pure `summarizeTestSeason`) showing per match: holes matched per player,
  who has pressed Submit Round, whether the round is an official record, and
  whether it *would* count toward a handicap. **Safety fix:** the 2034 test
  season is now excluded from real handicap calculations
  (`mapFutureHandicapRounds`, opt-in only for that status view) — before this,
  a finished rehearsal round could have changed players' real handicaps.
  **Bug found and fixed by the new browser test:** after confirming Submit
  Round on the live Scorecard the Confirm dialog stayed open over the
  "Submitted" card; it now closes (and stays open with the error if the
  submit fails). `npm test` (341/341), `npm run test:db` (9 scenarios),
  `npx tsc --noEmit`, `npm run lint` (clean on every file this round touched;
  one older warning in `TestSeasonPanel.tsx`), `npm run build`, and
  `npm run test:browser` (new: the preview path) all clean. **Not
  click-tested in the real app:** the Page Editor, the Test Season panel and
  its status route sit behind Tiger login; they are covered by type-check,
  lint, build and the tested logic they call.

- **Live Scorecard: opens itself at 18 holes, and shows whose score
  disagrees** (follow-up to Phase 1). (1) Once you have entered all 18 holes
  the phone goes straight to the Scorecard - after the 18th hole is saved, and
  also when you reopen the page with everything already entered. It only does
  this once per visit, so tapping a hole number to fix something takes you to
  that hole and it stays there; the Scorecard button still works any time
  mid-round. (2) The two totals boxes are now colored separately: **Your
  score** (what you entered for yourself, checked against what your scorer
  entered for you) and **the opponent's score** (what you entered for them,
  checked against what they entered for themselves). White = still waiting on
  data, green = matches, red = disagrees, and the exact hole is tinted red in
  the matching Score row. So "Barone's score is good but Cam's isn't" shows
  Barone's box green and Cam's box red. Your scorer's actual numbers are still
  never shown. Logic lives in `liveRoundStatus` (`yourState`, `opponentState`,
  `yourDisputedHoles`, `opponentDisputedHoles` in `lib/live/roundStatus.ts`,
  unit-tested); the overall card color and Submit Round rule are unchanged.

- **Live Scorecard redesign, and cosmetic pass on the hole-entry screen.**
  Cosmetic tweaks to the live hole-entry screen (ScoringPanel/
  ScoringRoundHeader/ShotDirectionPicker/HoleActionBar, all shared with the
  handicap "Submit a score" screen unless noted): Total/To Par sit closer
  together; the "Scorecard" link lost its underline; the Fairway/GIR compass
  now sizes itself to its buttons so the gap between arrows is even in every
  direction; the Penalty toggle moved into the compass's empty corner
  (between "missed right" and "missed short") and reads "PEN"; the GPS/
  Submit Score/Next Hole buttons are a little taller; and (live scoring
  only) the status line that used to sit above the score rows now sits
  between Putts and those buttons instead, so the score rows sit right under
  the hole-number strip.
  Then a full redesign of the **live** Scorecard (`live` prop on
  `components/portal/Scorecard.tsx`) — the handicap "Submit a score" screen
  is untouched, still the boxed card it always was. Live scoring's Scorecard
  now: has no boxed card (sits directly on the page); an icon-only "←" Back
  button, top-left; the course name and rating/slope above the Total/To Par
  pill (`course`/`rating`/`slope`, newly returned by
  `GET /api/portal/scoring/state`, read from `live_courses` /
  `live_round_state.course_setup`); no "Tap hole number to edit" text; the
  Hole/Yardage/Score/opponent-score rows and the Putts/Fairway/Green rows
  are now two separate boxes with a little gap between them, their
  horizontal scroll linked so the same column is always the same hole; no
  more "Hole 1 is not entered" / "waiting for X" / "your card matches" text
  under the two score boxes — the greyed-out Submit Round button and the
  red hole numbers/cells already say that; and a new **match completeness**
  card above Submit Round — round + format, then the two sides and the
  match-play score (2 Up, AS, 3&2, Thru N / Final), styled like the "My
  Matches" card on the player portal minus its course header (already shown
  above). The match score comes from the same confirmed-hole rule as
  everywhere else in live scoring (both scorers agree): the real screen
  reads the database's own `live_match_official_state` row (trigger-
  maintained, the same one the public match list uses); the Tiger Center's
  Live Scoring Page Editor has no database, so it derives the identical
  result from the preview room's submissions with a new pure function,
  `previewOfficialState` (`lib/live/previewMatchState.ts`, unit-tested),
  reusing the real match-play math (`matchBoxResult` in
  `lib/live/orchestration.ts`) so the preview and the real thing never
  disagree. `npm test` (349/349), `npm run test:db` (9 scenarios),
  `npx tsc --noEmit`, `npm run lint`, `npm run build`, and
  `npm run test:browser` (rewritten assertions for the new layout, plus a
  new check that the preview's match-completeness card computes the correct
  match-play result) all clean. **Not click-tested in the real app:** the
  real screen needs a live match box and is gated behind player login; it's
  covered by type-check, lint, build, the tested logic it calls, and the
  browser test's simulated version of the same screen.

- **Security pass on accounts/passwords.** User asked how passwords/data are
  protected; audit found the core setup already solid (Supabase hashes every
  password — this repo never sees or stores one; `.env` secrets are
  gitignored and never committed; RLS policies correctly restrict private
  tables to their owner). Two small gaps fixed: (1) `POST /api/auth/signup`
  now rejects a password under 6 characters (it previously accepted any
  non-empty string; `reset-password` already had this check, signup didn't);
  (2) `next.config.ts` now sets standard security response headers
  (`Strict-Transport-Security`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`) on every route.
  **Two settings remain that only exist in the Supabase dashboard, not in
  code — not done here:** turning on Authentication → Policies → "Leaked
  password protection," and confirming the live production domain forces
  HTTPS (Vercel does this automatically once a domain is attached; just
  worth a one-time check). `npm test` (356/356), `npx tsc --noEmit`, lint on
  both changed files, and `npm run build` all clean.

## Known gaps / not yet built

- **Live scoring lifecycle — spec v3 written, not built.** See
  `docs/superpowers/specs/2026-09-20-live-scoring-round-lifecycle-design.md`.
  Model (user, 2026-09-20): everything live — leaderboards, team points,
  match results, **player statistics**, odds, broadcast — updates **per
  matched hole**; **handicap (Maroon Masters + Overall) and the rounds
  archive** are written when a player **and their scorer have both
  submitted**; wagers settle at Tiger's closeout, which is a review stamp
  (Tiger can edit any score any time). Matches finish early (3&2) and
  update immediately, but players still play out 18 and the tab moves on
  once both have submitted. The other scorer's numbers are **never shown**:
  the live Scorecard shows only your entries, with the round total white
  (waiting on the other scorer), red (a hole disagrees — that hole number
  turns red) or green (all match → Submit Round turns maroon); the
  competitor grid built earlier is to be removed. After Submit Round only
  Tiger can change the card. The public `/leaderboard` + team points should
  come straight from live scoring, with the Google Sheet demoted to a
  one-way backup copy. Audit findings: `submit_live_hole` auto-inserts the
  submission row at 18 confirmed holes (blocks the reusable
  `/api/portal/scoring/submit`); handicap currently counts at 18 confirmed
  holes (before anyone submits); no Tiger edit tool for live rounds; the
  Scoring tab only moves on at `Final`. Wager reversal (if a post-closeout edit flips a winner) is
  decided: build it (subtract payouts, reset bets, settle again, logged).
  No open design questions remain.
- **2025-danzante's 8 players still need tees assigned** via "Assign tees
  for handicap tracking" (`/portal/admin/scorecards`) before any of their
  rounds count — the round numbering/format problem itself is fixed (see
  the "Real handicap calculation, part 2" round below), this is just the
  same manual per-round step 2026 already had done for its first 3 rounds.
  `career_stat_holes`/`career_stat_team_holes` (the separate Career Stats
  tables) were **not** touched by either year's renumbering and still use
  whatever round numbering they had before — a known, accepted difference
  between that system and the handicap archive, not a bug.
- Also found but **out of scope, not touched**:
  `careerArchiveCourseHoles` (same file) has many other 2026 rows whose
  `course` field holds junk like "Cade Round 3 Scorecard" instead of a real
  course name — a separate, pre-existing data-quality gap; and
  `appscript/write-scores.gs`'s `SEASON_REBUILD_ROUNDS` test-season seed data
  reuses the old swapped course/round pairing — low-stakes (test-only) and
  needs a manual paste into the Apps Script editor to fix, so left alone
  pending a decision from the user.
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
- **Course "Nearby" tab still has no distance data.** `live_courses` now has
  optional `city`/`state`/`zip_code` columns (see the Course location round
  above), entered by hand per course in the Course Library — but there's still
  no lat/long and nothing computes distance from the player, so "Nearby"
  can't actually sort/filter by proximity yet. It remains a visible "coming in
  a later round" placeholder (My Handicap → Submit a score → course lookup)
  until that's built.
- **Most archived rounds still need tees assigned via "Assign tees for
  handicap tracking"** (`/portal/admin/scorecards`) before they count
  toward anyone's index — nothing is backfilled automatically, one
  tournament round at a time. Only 2026-palm-springs rounds 1/3/4 (renamed
  from the old 1/2/3 — see the "Real handicap calculation" round above)
  are done. 2026 rounds 5/7/8 and all of 2025-danzante still need it.

## Out of scope for this round

Any functional Real Wagers mode, real fourball market data, the final
entry-splash image asset (placeholder background until provided), the host
scoring tools listed above, player profile editing, or making "Nearby" actually
work (needs course location data — see Known gaps above).
