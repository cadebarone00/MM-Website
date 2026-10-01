# The Maroon Website — Project Spec

## What the app does

A public website for "The Maroon Tournament" — an annual golf trip/tournament between two
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
  separate scorekeeper app), and a Admin-only `/portal/admin` for assigning player
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
  breakpoint) with "The Maroon Tournament" in the site's serif wordmark style:
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
- Wired archived Maroon Tournament tournament rounds into the real handicap
  index, closing a gap where the types/math for it already existed
  (`ArchivedHandicapRound.teeSetup`, `archiveIndex.ts`'s
  `combinedHandicapIndexes`) but nothing populated or read the data.
  `getArchivedHandicapRounds` (`lib/data/archivedScorecards.ts`) now reads
  the `handicap_setup`/`played_on` columns `supabase/archived_handicap_tees.sql`
  added (also folded into `schema.sql`); `/portal/handicap`'s page now calls
  `combinedHandicapIndexes` so "Overall Handicap"/"Low Index" include
  archived rounds and "Maroon Tournament" shows a real number instead of a
  hardcoded "—"; `HandicapHome.tsx`'s archive rows show the assigned tee
  name/rating/slope instead of always "— / —". New Admin-only bulk action
  ("Assign tees for handicap tracking" on `/portal/admin/scorecards`,
  `components/portal/admin/ArchiveTeeAssigner.tsx` →
  `POST /api/portal/admin/scorecards/archive-tees`) sets the course/tee
  set/date-played for every player's archived row of one tournament round
  at once — the write path that table never had. `npm test`,
  `npx tsc --noEmit`, `npm run lint`, and `npm run build` all clean.
- **Course location (City, State, Zip).** `live_courses` gained optional
  `city`, `state` (two-letter code), `zip_code` columns — migration
  `supabase/course_library_location.sql`, run in production 2026-09-11.
  Course Library home page and the Review/edit tees page both show "City, ST"
  in small grey text under the course name (blank if not set), with an "Edit
  location" control (new `components/portal/admin/CourseLocationEditor.tsx`)
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
  `/portal/handicap`'s "Maroon Tournament"/"Overall Handicap" (and the smaller
  copy of the same number on the `/portal` home screen) stuck on "—" for
  every player, even though the WHS math itself was already correct and
  Admin had already assigned tees for several rounds:
  1. `/portal`'s home-screen number only ever looked at self-submitted
     "Submit a score" rounds (none exist yet), ignoring the Maroon Tournament
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
  copied a `/signup?code=<username>` URL for Admin to send by hand —
  nothing in this repo had ever emailed a player. Clicking "Send Invite"
  now expands an email box (pre-filled from any address already on file,
  same expand-a-row pattern as "Edit directly") and, on submit, calls new
  `POST /api/portal/admin/invite` (host-gated, mirrors
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
  /api/portal/admin/player-email` straight to `player_slots.email` — no
  more typing an address inside the invite flow itself. "Send Invite" is
  now a plain one-click button (disabled with no email on file); `POST
  /api/portal/admin/invite` dropped `email` from its request body
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
  Players & Teams page into a new Admin Center → Global Tools → **Players**
  page (`/portal/admin/players`, `components/portal/admin/GlobalPlayersAdmin.tsx`).
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
  /api/portal/admin/player-add` and `/player-name` (host-only). **A new
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
  claim, Admin invite) and is a foreign key into `player_slots`. The two
  legacy Google-Sheet scoring routes (`score/round`, `score/submit-hole`)
  return 403 for a DB-only player (that sheet only knows the hand-written
  roster), and `/portal/career` now passes the slug instead of the first
  name so a new player can't alias to a hand-written one. **Not reached by
  a rename (and shows the raw slug for a DB-only player):** the historical
  leaderboard, scorecard, wagers, and broadcast pages, the in-progress
  `LivePlayerScorecard.tsx`, live-scoring partner names, and Admin's
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
  and the per-year page sit behind Admin login — verified by type-check,
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
  have both submitted, without waiting for Admin (`withoutFinishedMatches`,
  `scoringStage`, `loadScoringProgress`). The live **Scorecard** no longer
  shows the competitor's grid — only your own entries, a second score row
  with what *you* entered for your opponent, hole numbers that turn red where
  you and your scorer disagree, and a round status box that is **white**
  (your scorer hasn't finished), **red** (a hole disagrees) or **green**
  (everything matches); the **Submit Round** pill is grey until green, then
  maroon, and asks "After you submit your round you will not be able to edit
  it. Admin can correct it later…" before locking your card (pure logic:
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
  the odds model still read matched holes as they arrive, unchanged. Admin's
  Match Closeout card lists who has not submitted, disables Close Out Match
  until everyone has, and offers "Close out anyway". Not built yet (Phases 2
  and 3 of the spec): Admin's Edit Scores for live rounds, wager reversal,
  and the public leaderboard/team points coming from live scoring with the
  Google Sheet as a backup. `npm test` (328/328), `npm run test:db` (all
  scenarios, incl. no auto-submit, lock, scorer-edit-never-unsubmits,
  official-only-when-both-submit, Foursome needs four), `npx tsc --noEmit`,
  `npm run lint` (clean on every file this round touched), `npm run build`,
  and `npm run test:browser` (white/red/green states, other scorer's numbers
  never shown, Submit Round asks first then locks) all clean. **Not
  click-tested against the real app:** the Scoring tab screen, its loader,
  and Admin's card sit behind login and a real database — covered by
  type-check, lint, build and the tested logic they call — so a two-phone
  check after running the migration is the remaining step.

- **Admin Center testing for the live scoring lifecycle** (follow-up to
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
  status** (`TestSeasonStatus`, `GET /api/portal/admin/test-season/status`,
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
  its status route sit behind Admin login; they are covered by type-check,
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
  maintained, the same one the public match list uses); the Admin Center's
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

- **Real hype video wired into the home page's Videos slot.** The "Videos"
  box under Socials (`components/home/HomeDashboard.tsx`'s `hypeVideoSlots`)
  had two placeholder "Hype Video" cards that linked nowhere real. The first
  slot now shows the user's "MM Edit - Silver Springs" video: caption
  "Silver Springs," a real thumbnail pulled from the video itself
  (`public/videos/mm-edit-silver-springs-thumb.jpg`), and a click takes you
  to a new dedicated page (`/videos/hype-1`) that plays it full-size. The
  source file was a 228MB 4K HEVC export, which most browsers can't play at
  all — converted to a web-friendly 1080p H.264/AAC .mp4 (`public/videos/
  mm-edit-silver-springs.mp4`, ~76MB) with `ffmpeg`. The card now uses
  `next/link` (no "leaving the site" confirm) since the destination is
  on-site, unlike the still-placeholder second slot and the "Other Videos"
  link, which still point off to `ALL_VIDEOS_HREF` ("#") and keep that
  confirm. Verified end-to-end with a real headless-browser run (Playwright):
  the card renders on the home page, the link navigates to `/videos/hype-1`,
  and the video actually loads and plays there. `npx tsc --noEmit` and
  `npm run lint` clean on both changed/new files; `npm run build` clean.
  **Found and worked around during this round:** two Claude Code terminals
  were apparently both editing this repo at once and their auto-commits
  interleaved (see note to the user in this round's summary) — worth
  checking with Cade before starting further work in case the other session
  is mid-task on something else.

- **Fantasy draft redesign, plus a real pre-tournament roster bug fix.**
  `/fantasy` used to be a single flat picker; it's now a five-state flow
  (`app/fantasy/page.tsx`): a welcome hero (`FantasyWelcome`) with a "Make
  Your Selections" button, a 3-tab draft screen (`FantasyDraftTabs` — Maroon /
  White / Wildcard) where each row (`FantasyPlayerRow`) drills into that
  player's real profile page and a floating action bar
  (`FantasyDraftActionBar`) lets you draft them from there, a Submit Lineup
  step once all three slots are filled, a locked "Your Team" results view
  once the tournament goes live (`FantasyYourTeam`), and an Edit Lineup path
  that reopens the draft pre-seeded with your saved picks. In-progress
  drafts persist to `sessionStorage` per tournament
  (`lib/fantasy/draftState.ts`, unit-tested) so going to a profile and back
  doesn't lose your picks, and the lock is now enforced for real:
  `fantasyPicksLocked` (`lib/fantasy/lock.ts`, unit-tested) checks the
  tournament's actual live/completed status instead of trusting the client.
  Along the way, fixed a real bug: the pre-tournament roster (who Admin has
  locked into Maroon/White in Master Settings → Players & Teams) and the
  live-tournament roster (only populated once the Google Sheet feed is
  running) were two disconnected sources, so `tournament.roster` — and
  Fantasy's entire draft pool — was empty for the whole pre-tournament
  window. `overlayConfirmedRoster` (`lib/data/confirmedRosterOverlay.ts`,
  unit-tested) now fills in the confirmed roster whenever the live one is
  empty, wired into both places a `Tournament` gets built
  (`lib/data/fetchLiveTournament.ts` server-side,
  `lib/hooks/useLiveTournament.ts` client-side via the new
  `GET /api/confirmed-roster` route). Because `LivePlayerScorecard` already
  reads `tournament.roster` through that same client hook, its team badge —
  previously always showing White for every player pre-tournament (the
  roster was always empty, so the maroon-membership check in its team
  ternary was always false) — now shows the right team for free, with
  no changes to that component's own logic. Also deleted
  `components/fantasy/PlayerPickerSlot.tsx`, the old flat picker's row
  component, left behind as dead code by the rewrite (confirmed unused
  repo-wide before deleting). `npm test` (383/383), `npx tsc --noEmit`,
  `npm run lint`, and `npm run build` all clean (`/fantasy`,
  `/api/confirmed-roster`, and `/api/fantasy/team` all present among the
  build's routes). **Not click-tested against a real locked roster yet:** no
  2027 roster has been confirmed in production, so the full welcome → draft
  tabs → profile → Draft → Submit Lineup → Your Team → Edit Lineup path is
  covered by unit tests, type-check, lint, and build plus a manual check
  that the empty-roster message still renders without crashing — not yet a
  real end-to-end click-test, same situation as several earlier rounds
  shipped ahead of the data existing to test against.

- **Add to Home Screen walkthrough.** A blocking modal (new
  `components/InstallPrompt.tsx`, mounted in `SiteChrome` next to `Header`,
  portaled to `document.body` above everything else on the page, `z-[500]`)
  now shows the first time a visitor opens the public website on their
  phone, centered on screen with a dark backdrop, showing the exact steps to
  add the site to their home screen for their detected device — iPhone
  ("•••" bottom-left → Share → "View More" bottom-right → scroll down →
  "Add to Home Screen," matching the real current Safari flow rather than
  the older documented one) or Android Chrome (⋮ menu → Add to Home
  screen/Install app → Add/Install) — detected from the browser's user
  agent. It never appears on desktop, and never appears once the site is
  already installed (checked via `display-mode: standalone` /
  `navigator.standalone`). It's deliberately not dismissible by clicking the
  backdrop or pressing Escape — only the "Got it" button closes it, which is
  also what remembers that choice for good on that device (`localStorage`),
  the same one-time pattern `HomeEntrySplash` already uses for the homepage
  splash. Portal and `/broadcast` are unaffected — it only mounts on the
  public-site branch of `SiteChrome`. `npx tsc --noEmit`, `npm run lint`
  (clean), `npm test` (459/459), and `npm run build` all clean. **Verified
  live in a real headless browser** (Playwright, not just unit tests): shows
  the correct steps for iPhone vs. Android user agents, stays open (and the
  page behind it stays unclickable) through both a backdrop click and
  Escape, closes and stays dismissed after a reload once "Got it" is
  tapped, and stays hidden when `navigator.standalone` is set (simulating an
  already-installed visit). Desktop non-display uses the same detection
  function as before, unchanged by this round, so it wasn't re-verified
  live here.

- **Round → Session rename (live/upcoming tournament only), 3 Pacific-Time
  match tee times, and a per-format Matchups redesign.** Spec
  `docs/superpowers/specs/2026-09-24-sessions-matchups-tee-times-design.md`,
  plan `docs/superpowers/plans/2026-09-24-sessions-matchups-tee-times.md`
  (13 tasks). Every place a person sees "Round" for the *live, upcoming*
  tournament — Courses & Format, Matchups, the public Schedule page's
  upcoming-tournament boxes, the live Scoring tab, the "Ready to start"
  banner (`StartRoundBanner` → `StartSessionBanner`), Match Closeout,
  broadcast controls, and the 2034 test-season rehearsal tools — now reads
  "Session," and the code identifiers match it: `LiveRoundState` →
  `LiveSessionState` (`.round` → `.session`), `LiveMatchBox` → `LiveMatch`
  (`.boxNumber` → `.matchNumber`), `TournamentSettings.roundCount` →
  `.sessionCount`, `/api/portal/admin/rounds*` → `/sessions*`,
  `/matchboxes*` → `/matches*`. **Exact boundary, deliberately not
  touched:** the historical/archived "Round" concept (2024-2026 static
  `lib/data/*.ts`, the Career Stats archive, "Round INDI",
  `ArchiveTeeAssigner`) and the handicap system's own separate "round"
  concept (`RoundInProgressCard`, `/api/portal/handicap/rounds`, etc.) — a
  different, older feature the user does not want touched — plus the
  `live_round_state`/`live_match_boxes` Supabase table and column names,
  which also stay exactly as-is (renaming a live production table buys
  nothing visually; the API layer is the translation point, reading
  `round`/`box_number` columns and mapping them onto `session`/
  `matchNumber` fields in code). Each Session on Courses & Format now shows
  3 tee-time inputs below the date/course/format row (Fourball/Foursome:
  "Match 1/2/3"; Singles: "Match 1 & 2" / "3 & 4" / "5 & 6"), always
  interpreted as Pacific Time (`America/Los_Angeles`) regardless of the
  browser's own timezone, stored in a new `match_tee_times jsonb` column —
  **migration `supabase/session_tee_times.sql`, not yet run in
  production** (see Known gaps). The existing Lock control on Courses &
  Format now locks date/course/format and all 3 tee times together (no
  second lock added). Each Matchups match's own tee time is now *derived*
  from its Session's locked tee times (Fourball/Foursome 1:1 per match;
  Singles's 3 times are each shared by 2 matches) instead of being typed
  independently per match — feeding the same already-existing,
  already-tested `effectiveMatchState()` auto Scheduled→Armed→Live
  transition, unchanged. **Locking still requires a manual Start Session /
  Start Match exactly as before — no new auto-start behavior was added:**
  Admin still has to press "Start Session" (`/portal/admin` shows a "Ready
  to start" `StartSessionBanner` once a session is locked but not yet
  started) and, separately, "Start Match" remains a manual per-match
  override for when a real tee time slips. Matchups' per-match
  player-assignment layout was redesigned by format to show the real
  opponent-scoring relationship `canScoreStrokesFor()` already used
  (already shipped, unit-tested, unchanged by this task): Fourball shows
  two Maroon-vs-White rows, each with its own "Scoring For" label
  (opponent-paired, not partner-paired); Foursome/Alternate Shot shows the
  same 2×2 boxes with one shared "Scoring For" label (team-to-team, one
  shared ball); Singles shows the same left/right shape as one Fourball
  row, with a divider between the two matches sharing a tee time. Tee
  times now display everywhere as read-only text, e.g. "7:30 AM PT"
  (Matchups, the public Schedule page, the live Scoring tab,
  `StartSessionBanner`) instead of the old per-match editable time input.

  Task 13 (this plan's final task) ran the full verification sweep and
  closed out three genuine gaps Tasks 8 and 9's briefs had explicitly
  deferred to it: `lib/broadcast/*` (`leaderboardData.ts`,
  `liveSnapshot.ts`, `matchEvents.ts` + its test, `matchPlayData.ts`) and
  `lib/wagers/holeInOnePricing.ts` / `teamWinnerPricing.ts` still read the
  old `LiveMatchBox`/`.round`/`.boxNumber` names — these read the *live*
  tournament's match state, not historical/archived data, so this was a
  real gap, not a historical carve-out, and one of them was silently
  hiding a real bug: `matchEvents.test.ts`'s fixtures never set `.session`,
  so `matchBoxResult()` read `undefined` and always reported a round
  un-closed, failing `npm test`. Also fixed: `components/portal/
  ScoringPanel.tsx` still imported `LiveMatchBox`; `scripts/
  build-sheet-handoff.mts` (a dev-only documentation/fixture script) still
  imported `roundIsComplete`/`LiveMatchBox` and listed stale
  `admin/matchboxes`/`admin/rounds` source paths; and
  `/api/portal/admin/settings` (`route.ts` + its caller
  `CoursesFormatPanel.tsx` + `route.test.ts`) still spoke `roundCount` in
  its request/response body, per Task 9's explicit deferral note — both
  sides now say `sessionCount`, the `round_count` DB column unchanged.
  `npm test` (465/465, was 464/465 before the `matchEvents.test.ts` fix
  above), `npx tsc --noEmit` (0 errors, was 30), `npm run lint` (clean — 0
  errors — on every file this whole 13-task plan touched; one pre-existing
  warning in `TestSeasonPanel.tsx`, already noted in an earlier round), and
  `npm run build` (clean; route list confirms `/api/portal/admin/
  sessions*` and `/api/portal/admin/matches*`, and no `/rounds*`/
  `/matchboxes*` — the unrelated `/api/portal/handicap/rounds` is the
  untouched handicap feature) all clean. **Not click-tested in a real
  browser:** no host login or real Supabase project is available in this
  environment, so the full Courses & Format → Matchups → Lock → Start
  Session walkthrough the plan describes wasn't run live; verified instead
  by type-check, lint, build, the tested logic (`sessionTeeTimes.ts`,
  `orchestration.ts`), and a smoke test against a running dev server
  confirming every touched route (`/portal/admin/master-settings/[year]/
  courses-format`, `/matchups`, `/portal/admin`, `/api/portal/admin/
  sessions`, `/matches`, `/settings`) redirects or 401s correctly for an
  unauthenticated request rather than 500ing.

- **Configurable per-tournament-year venue timezone, and viewer-local tee
  times everywhere fans and players see them.** Plan
  `docs/superpowers/plans/2026-09-25-tee-time-timezone.md` (14 tasks). Every
  tournament year now has its own `timezone` (an IANA zone id) on
  `live_tournament_settings`, picked from a curated list on Master Settings
  (`lib/data/timezones.ts`: Pacific / Mountain / Mexican Pacific, e.g.
  Danzante Bay / Central / Eastern) — replacing the old hardcoded assumption
  that a match tee time is always Pacific. The new column defaults to
  `'America/Los_Angeles'`, so the already-in-progress 2027 season (a real
  California venue) needed zero manual changes. **Two different displays, on
  purpose:** Admin's own admin screens — Master Settings, Courses & Format's
  tee-time inputs, Matchups' tee-time labels, and the Career Stats archive —
  keep showing the *venue's* configured clock, since that's the time
  Admin and the players actually say out loud at the course. Everywhere a fan
  or player who isn't standing at the venue sees a tee time instead — the
  public match profile page, the live leaderboard, the live Scoring tab, and
  the portal's "My Matches" cards — now converts that same underlying instant
  into *that viewer's own* device clock (new `lib/live/viewerLocalTime.ts`,
  `formatViewerLocalTeeTime`; client-side only, deliberately never called
  during server rendering, which would format in the server's zone instead of
  the visitor's). `lib/live/sessionTeeTimes.ts` (`deriveMatchTeeTime`) is the
  one shared place that turns a Session's date + "HH:MM" wall-clock entry
  into a real absolute instant for a given venue zone, correctly handling the
  two DST-transition days a year. **`supabase/tournament_timezone.sql` has
  not yet been run against this environment's real dev database** —
  confirmed directly by an earlier task in this plan, which queried
  `live_tournament_settings` against the live Supabase project and got back
  "column live_tournament_settings.timezone does not exist" — same pending-
  migration situation as `supabase/session_tee_times.sql` above (see Known
  gaps below); until it runs, every screen reading `.timezone` falls back to
  its code-level Pacific default rather than actually reading a per-year
  setting from the database. Task 9 of this plan (a more polished timezone
  caption on Courses & Format, spelling out "Pacific Time" instead of a raw
  zone id) was skipped: by the time it came up, a concurrent session actively
  redesigning that same `CoursesFormatPanel.tsx` had already added its own
  working caption there (`Tee times use America/Los Angeles.` — the raw IANA
  id with underscores replaced, not a friendly label) — forcing a
  nicer-looking version into a file under active unrelated rewrite wasn't
  worth the conflict risk for a cosmetic difference, so this plan left it
  alone. `npm test` (473/473), `npx tsc --noEmit` (0 errors), `npm run lint`
  (clean on every file this plan touched — one real issue this task found and
  fixed along the way: an unescaped apostrophe in Master Settings' new
  timezone caption), and `npm run build` all clean. **Not click-tested in a
  real browser:** no host login or real Supabase project is available in
  this environment, and this environment's dev server was already running
  for a concurrent session's own work (so it wasn't restarted) — verified
  instead by type-check, lint, build, the tested logic (`sessionTeeTimes.ts`,
  `viewerLocalTime.ts`), and a smoke test against that already-running dev
  server confirming this plan's touched pages (Master Settings, Courses &
  Format, Matchups, Career Stats, the public leaderboard/schedule) load
  without a 500.

### Sign-out confirmation + return home (shipped 2026-09-28)

**What changes:** Signing out is the same for every account type (player,
normal fan account, and Admin/host) and from every place a sign-out button
exists today — the desktop/footer account dropdown (`components/AccountBadge.tsx`,
also used by the Player Portal / Admin Center header) and the mobile account
menu (`components/nav/AccountMenu.tsx`).

1. Clicking Sign Out / Log Out no longer signs out right away. A box pops up in
   the middle of the screen (dimmed background behind it) that says
   **"Are you sure?"** and **"Any unsaved data will not be stored."**
2. Two buttons: **Sign Out** (red) and **Cancel**. Cancel (or clicking the dimmed
   background / pressing Esc) closes the box and nothing happens.
3. Sign Out ends the session (existing `/api/auth/signout`) and then does a full
   page load of the home page `/`, so the person lands on the home screen as a
   signed-out guest — even if they were inside `/portal` (Player Portal or Admin
   Center) or any other page.

**How:** one new shared popup component `components/SignOutConfirmDialog.tsx`
(same look/pattern as the existing "round in progress" popup), used by both
sign-out buttons. `signOutAccount()` in `lib/useAccountSession.ts` gets the
"go to home" step so every caller behaves the same.

**Tech / data:** no new pages, no database or Supabase changes, no new services.

**Done when:** from the dropdown and the mobile menu, Sign Out shows the popup;
Cancel keeps you signed in where you were; Sign Out lands you on `/` signed out
(header shows Login / Sign Up), including when started from the Player Portal or
Admin Center. Type-check, lint, tests and build pass.

### Projected page: match-style team win-probability graph + leaderboard year (spec 2026-09-28, awaiting approval)

**What:** clicking the points ribbon ("Projected") opens `/leaderboard/[slug]/projected`.
Two changes:

1. **Same year as the leaderboard.** The projected page picks its year exactly
   the way `/leaderboard/[slug]` does (the season catalog, so it respects the Website
   Editor's chosen year), not the static `nextTournament`. The "Back to
   Leaderboard" link returns to that same year (it's hard-coded to 2027 today).
   If the live year's leaderboard isn't open yet, redirect the same way the
   leaderboard does.
2. **Graph looks exactly like the match odds graph.** A new
   `TournamentOddsGraph` copies `MatchOddsGraph`'s look: "Win Probability" title,
   Maroon / Tie / White % header, the 100%–50%–0%–50%–100% side labels, maroon fill
   above the middle and white below, the thin dark line and the slider. The only
   difference is the bottom axis: **Start, R1, R2 … one tick per round** instead of
   holes 1–18. Dragging the slider shows the percentages after that round. It
   replaces the current line chart (past years) and the plain bar (live year).
   The team points lists below stay as they are.

**How each point is calculated** (same math the live projected page already uses:
each match is a Maroon win / tie / White win chance, combined into the team's
chance to win the whole tournament):
- Matches already finished by that round count as their real result.
- **Live year:** matches not finished yet use their official pre-round odds for
  past points, and their latest live odds for the "now" point. No odds posted
  yet = even (⅓ each).
- **Past years:** no odds were ever saved, so unplayed matches count as even (⅓ each).
  The last point is always 100% for the real winner.

**Tech / data:** no database or Supabase changes. `/api/live/matches` also returns
each match's pre-round (thru 0) odds snapshot next to the latest one. No new services.

**Done when:** from the leaderboard of any year (including one set in Website
Editor), Projected opens that same year, and Back returns to it. The graph
matches the match page's odds graph, with round ticks along the bottom, on past
and live years, desktop and mobile. Type-check, lint, tests and build pass.

### Round: Sponsors in the header + social links in More

**What:** show a rotating sponsor logo in the header (no "Presented By:" label), recenter
the desktop nav, and move Instagram (plus new Facebook, TikTok, YouTube) into the
More menu.

**Sponsors** — one list in `lib/data/sponsors.ts` (name, logo path, optional link).
First entry: **DCS Logo** (Dynamic Computing Services), image at
`public/sponsors/dcs-logo.png`. Adding a sponsor later = drop a logo in
`public/sponsors/` and add one line to the list.
- **Rotation:** one logo shows at a time; every 15 seconds it fades out and the
  next fades in, looping. With only one sponsor it just stays put (no flicker).
- **Desktop header:** sponsor logo all the way on the left; the Maroon Tournament
  wordmark sits in the centered nav, just left of Home.
  The logo sits on a small white rounded tile so its white background doesn't
  clash with the maroon bar.
- **Mobile header (top-left):** the sponsor logo,
  replacing the Instagram icon. The back arrow still replaces it on sub-pages
  (same as today). The round countdown that sat there moves to the **top-left
  corner of the home page hero** on mobile (desktop keeps it in the header's right side).

**Desktop nav:** wordmark · Home · Leaderboard · Watch Live · Teams · More sit
together in the **center** of the bar. Right side keeps countdown, account and
emblem; the Instagram button is removed from there.

**More menu (mobile + desktop):** under the last link (Fantasy / Admin Center), a
row of four icons in this order: **Instagram, Facebook, TikTok, YouTube**, each
opening the account in a new tab. Instagram = `https://www.instagram.com/themaroonmasters/`;
the other three links are pending from the user (hidden until provided).

**Tech / data:** no database, no new services, no new packages (icons are small
inline SVGs, like the existing Instagram one).

**Done when:** sponsor shows and fades correctly on desktop and mobile, the nav is
centered on desktop, Instagram is gone from both headers and appears with the other
socials in More, and type-check, lint, tests and build pass.

## Known gaps / not yet built

- **Live scoring lifecycle — spec v3 written, not built.** See
  `docs/superpowers/specs/2026-09-20-live-scoring-round-lifecycle-design.md`.
  Model (user, 2026-09-20): everything live — leaderboards, team points,
  match results, **player statistics**, odds, broadcast — updates **per
  matched hole**; **handicap (Maroon Tournament + Overall) and the rounds
  archive** are written when a player **and their scorer have both
  submitted**; wagers settle at Admin's closeout, which is a review stamp
  (Admin can edit any score any time). Matches finish early (3&2) and
  update immediately, but players still play out 18 and the tab moves on
  once both have submitted. The other scorer's numbers are **never shown**:
  the live Scorecard shows only your entries, with the round total white
  (waiting on the other scorer), red (a hole disagrees — that hole number
  turns red) or green (all match → Submit Round turns maroon); the
  competitor grid built earlier is to be removed. After Submit Round only
  Admin can change the card. The public `/leaderboard` + team points should
  come straight from live scoring, with the Google Sheet demoted to a
  one-way backup copy. Audit findings: `submit_live_hole` auto-inserts the
  submission row at 18 confirmed holes (blocks the reusable
  `/api/portal/scoring/submit`); handicap currently counts at 18 confirmed
  holes (before anyone submits); no Admin edit tool for live rounds; the
  Scoring tab only moves on at `Final`. Wager reversal (if a post-closeout edit flips a winner) is
  decided: build it (subtract payouts, reset bets, settle again, logged).
  No open design questions remain.
- **`supabase/session_tee_times.sql` has not been run yet.** The Session
  rename's 3 Pacific-Time match tee-time inputs on Courses & Format
  (see the Session rename round above) read/write
  `live_round_state.match_tee_times`, which doesn't exist until this
  migration runs once in the Supabase SQL Editor — until then, saving a
  session's tee times (and so locking it, and so Matchups deriving each
  match's tee time from it) will fail.
- **`supabase/tournament_timezone.sql` has not been run yet.** The
  configurable venue timezone round above reads/writes
  `live_tournament_settings.timezone`, which doesn't exist until this
  migration runs once in the Supabase SQL Editor — confirmed missing by
  querying the real dev database directly. Until then, every screen that
  should read a tournament year's real configured venue zone (Master
  Settings, Courses & Format, Matchups, Career Stats) silently falls back to
  the code-level Pacific default instead.
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
  Admin — does not exist yet. `/portal`'s host view still shows "Host tools
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

## Platform productization (2026-09-29)

The Maroon is being turned into a multi-tenant tournament platform. That work
is specified in `THE_MAROON_PRODUCT_SPEC.md` (source of truth), tracked in
`CHANGELOG.md` and `TECHNICAL_DEBT.md`. Phase C1 (additive platform tables,
`supabase/platform_foundation.sql`, and `lib/platform/`) is built and tested
but not yet run in production; nothing in the existing app reads it yet.

### Round: Join Tournament page (spec 2026-09-30, approved 2026-09-30, built — needs `supabase/platform_past_editions.sql` run in production)

**What it is:** A new page people land on when they tap **Join Tournament** on the home screen. It's laid out like the fantasy-app screenshot, with the Maroon look.

**Top to bottom:**
1. **"Tournaments" title**, centered.
2. **Link box.** A text box plus a Go button. Someone pastes a tournament link, for example `https://<our site>/t/the-maroon/2026` or just `/t/the-maroon/2026`, and it takes them to that tournament's public page. The box only accepts links to our own site, in the `/t/<tournament>/<year>` shape. Anything else shows "That doesn't look like a tournament link." Pasting a link does **not** sign the person up as a player. It only opens the page.
3. **Create Tournament bar.** Goes to `/tournaments/new`, the same page the home screen's Create Tournament button opens.
4. **Past Tournaments.** A list of tournament years this person actually **played in**: they're on that year's roster (`edition_roster` → `tournament_players.profile_id` = them) **and** the year's end date has passed. Each row shows the tournament name, the year, the place, and the dates. Tapping a row opens that year's public page. Empty state: "No past tournaments yet."

**Who can see it:**
- The page is at `/tournaments/join`.
- Signed-out visitors still see the title, the link box and Create Tournament. Past Tournaments shows "Log in to see your past tournaments" with a Log In link.
- The home screen's Join Tournament dropdown becomes a plain link to this page.

**Data:** No new tables. There's one new read-only database function, `list_my_past_editions()`, which returns only the signed-in person's own rows. It needs one SQL file run in Supabase before this works in production.

**Not included:** win/loss records, "Champion" badges, finishing places, and any real "join as a player" signup. Those can come later.

**Done means:**
- The page renders with all four sections.
- A good link goes to the tournament and a bad link shows the error.
- Create Tournament opens `/tournaments/new`.
- Past Tournaments shows only finished years the person played in.
- The home button links to the page.
- Typecheck, lint and existing tests pass, and there's a new test for the link check.

### Round: Activity + announcements on Tournament Home (spec 2026-09-30, SUPERSEDED — built as part of the Tournament Home round below)

**What it is:** Show the already-built activity backend (`lib/platform/activity.ts`, `activityServer.ts`, `supabase/platform_activity.sql`, the activity GET and announcements POST routes) on a tournament's home page, `/t/<tournament>/<year>`. The backend, schema and permission rules stay exactly as they are.

**Where it appears (the Home page only, not Leaderboard/Schedule/etc.):**
1. **Announcements** sit right under the hero and status banner, above everything else. These are the commissioner's posts, newest first, each showing:
   - title
   - message
   - poster's name (only when the backend gives one)
   - date and time, in the tournament's timezone
   - a "Players only" tag when that applies

   Empty: "No announcements yet."
2. **Activity feed**, lower on the page: the automatic events ("The tournament site is live.", "2 players added.", "1 round rescheduled.") with their dates. Announcements aren't repeated here. Empty: "No activity yet."
3. **Post Announcement** button, in the Announcements header. It's shown **only** when the backend says `viewer.canPostAnnouncement` is true. It opens a small form with:
   - title (optional, up to 120 characters)
   - message (up to 2,000 characters)
   - who can see it: Everyone / Players only

   Submitting sends to the existing POST route. On success the list updates from the feed the server sends back. On error the server's message is shown.

**Who sees what:** Entirely decided by the backend. The page shows exactly what `loadTournamentActivity` returns for the logged-in viewer and never filters, adds or invents items. If the activity lookup fails or isn't switched on yet, both sections are hidden and the rest of the page works as before.

**How it's built:**
- Display pieces (announcement card, feed list) are added to the shared tournament UI kit (`components/platform/tournament-site`), using the kit's theme colors and styles so they match each tournament's branding.
- The Post Announcement form is a separate small client component outside the kit, because the kit is display-only and never makes network calls.
- The organizer preview uses the same rendering, so preview and public never differ.

**Not included:** C4 / live scoring event types (the parser already skips them), editing or deleting announcements, notifications, and any schema or permission change.

**Done means:**
- A visitor sees only everyone-announcements.
- A player sees players-only ones too.
- A `viewer` member does not see players-only ones.
- Only commissioners and admins see Post Announcement, and posting shows the new item straight away.
- Tests, typecheck, lint and the build pass, including a browser check of each role against the fake database.

### Round: Tournament Home — logged-in app (spec 2026-09-30, approved and built 2026-09-30; not yet in production — needs `platform_activity.sql` for announcements/activity)

**What it is:** The logged-in "fantasy league" screen for a tournament's players and commissioners. It is a **new** screen. `/t/<tournament>/<year>` stays the public website and is not changed. Visual starting point: Figma "The Maroon — Full App Screens" → Tournament / Home (node 23:629), in the Sleeper-inspired Maroon app system:
- deep maroon, layered dark surfaces
- the tournament's colors as accents
- compact sports-app density
- no SaaS cards, pill clutter or neon

**Address:** `/play/<tournament>/<year>`, with tabs at `/play/<tournament>/<year>/matches`, `/leaderboard`, `/players` and `/more`. Logged-out visitors go to `/login`. Who may open it comes from the existing public-site access rule (`loadPublicTournament`: the tournament is published, and private tournaments are members only). The UI adds no role checks of its own. The Maroon (founding tournament) is untouched, since the public-site rule already excludes it.

**Home screen, top to bottom:**
1. **Identity header:**
   - tournament name, year and team colors
   - the team score row appears only when real scores exist
   - before C4 there are no real scores, so it shows the teams with "Scoring opens with live play" and no numbers
2. **Your Match** (the main focus):
   - real: the next round from the saved schedule (round/session name, format, course, date, start time in the tournament's timezone)
   - holding state: "Pairings have not been posted yet." instead of partner, opponents, tee group or live status
   - no fake pairings or scores
3. **Tournament areas:** Matches · Leaderboard · Players · More (quick links).
4. **Commissioner announcements:**
   - real, from `loadTournamentActivity`, newest first
   - "Players only" tag where it applies
   - **Post Announcement** appears only when `viewer.canPostAnnouncement` is true
   - it opens a compact form that posts to the existing POST route, then shows the returned feed
5. **Tournament activity:** real automatic events (published, players/teams/schedule changes), newest first. Visibility is exactly what the backend returns.
6. **Bottom navigation:** Home · Matches · Leaderboard · Players · More.

**Tabs:**
- **Matches:** real round schedule, with pairings in the holding state.
- **Leaderboard:** holding state ("Scores appear once live scoring opens.").
- **Players:** real roster by team.
- **More:** the public website link, schedule and courses.

**Real vs holding:**
- Real: name, year, branding, teams, roster, courses, rounds/schedule, announcements, activity, posting rights.
- Holding until C4: team scores, pairings, partner/opponents, live status, leaderboard.

**Changes outside the new files:** `components/nav/SiteChrome.tsx` gets one line so `/play/...` shows no Maroon website header (the same treatment `/t/` already gets).

**Not included:** C4, live scoring, and any schema, authorization or public-site change.

**Done means:**
- Every screen renders for a logged-in player, and logged-out visitors are redirected to log in.
- Announcements and activity match what the backend allows each role to see, and Post Announcement is only visible when allowed.
- Tests, typecheck, lint and build pass, plus a browser check of each role against the fake database.
- Committed on its own.

## Tournament Theme & Personalization System

### Rule: Figma is the visual source of truth (2026-09-30)

- **Who owns what:**
  - The tournament engine and database own the data and the truth.
  - Figma owns presentation.
  - The code implements both.
- **Order of authority:**
  1. Product rules / personalization model
  2. Figma design system
  3. Figma components and screens
  4. Production design tokens and components
  5. Application screens
- **Production code is legacy implementation, not the design authority.** Its current colors, fonts and hardcoded styling don't define the design system.
  - Don't keep a color or font just because it's live.
  - Live appearance may be kept temporarily during a migration for safety. That's all.
- **When code and Figma disagree:**
  - Figma wins, unless a technical or product requirement says otherwise.
  - Report any such conflict before creating a new visual convention.
- **New UI:**
  - Uses semantic tokens and shared components. No one-off hex values, radii or spacing.
  - Adds no tournament-specific hardcoded colors without a written reason.

**Theme roles.** Every tournament has **Primary**, **Secondary** and **Accent**. Team events add one color per team. These are meanings, not fixed colors.
- **Primary:** the main identity. Branded surfaces, primary actions, selected states.
- **Secondary:** supporting contrast. Secondary surfaces and alternate treatments.
- **Accent:** emphasis only. Highlights, live states, key stats, leaderboard emphasis. Never the dominant color.
- **Team colors:** competition identity only. Match cards, team indicators, score bars, team labels, broadcast team graphics. They never replace the tournament theme.

For The Maroon:
- Primary = Maroon
- Secondary = White
- Accent = Gold
- Team Maroon (team 1) = Maroon
- Team White (team 2) = White

The exact hex values come from the Figma variables, not from the live site.

**Default theme vs. The Maroon preset.** These are two separate things.
- **System default theme:** neutral colors the software uses when a tournament hasn't set any.
- **The Maroon preset:** one saved tournament theme.

The Maroon is **not** the universal fallback.

**Figma token mapping:**

| Figma | Code (TS) | CSS variable |
|---|---|---|
| theme/primary · secondary · accent | `theme.primary` · `.secondary` · `.accent` | `--theme-primary` · `--theme-secondary` · `--theme-accent` |
| theme/text/on-primary · on-secondary · on-accent | `theme.textOnPrimary` · `.textOnSecondary` · `.textOnAccent` | `--theme-on-primary` · `--theme-on-secondary` · `--theme-on-accent` |
| competition/team-1 · team-2 | `competition.team1` · `.team2` (from `teams[0]`, `teams[1]`) | `--competition-team-1` · `--competition-team-2` (`-3`… for more teams) |
| competition/text/on-team-1 · on-team-2 | `competition.textOnTeam1` · `.textOnTeam2` | `--competition-on-team-1` · `--competition-on-team-2` |

Tailwind utilities are built on the variables: `bg-theme-primary`, `text-on-primary`, `bg-team-1`, etc.

If a token's meaning changes, update Figma and code together.

**Typography debt.**
- Figma uses **DM Sans** (interface) and **Instrument Serif** (editorial/display).
- Production uses Spectral and Barlow / Barlow Condensed. Those are legacy.
- This round doesn't migrate fonts. It adds two semantic font variables, `--font-ui` and `--font-display`. They point at today's fonts for now, so switching to the Figma fonts later is a small, separate change.

### Round: Theme system foundation (spec 2026-09-30, revised 2026-09-30 for the Figma rule, awaiting approval)

**What it is:** One shared place that decides what a tournament's colors mean and how screens use them. It's architecture, not a redesign.

**What I found (inspection, 2026-09-30):**
- **No schema change needed.**
  - `tournaments.branding` (JSON: `primary`, `secondary`, `accent`, `logoUrl`) holds the tournament colors.
  - `edition_teams.color` holds one color per team, with no two-team limit.
  - Individual events have 0 teams.
- **The Maroon's database row** is seeded with the legacy values: primary `#500001`, secondary `#fbf8f1` (cream), accent `#b8945a`, teams `#500001` / `#fbf8f1`. The brief lists `#FFFFFF` and `#D6A75C`. Figma decides (see Decisions).
- **Competing theme logic today:**
  - `components/platform/tournament-site/theme.ts`: its own contrast helper, `--ts-*` variables, fallback `#193c52`/`#d6b85c`.
  - `lib/platform/publicSite.ts` and `lib/platform/readiness.ts`: fallback `#1f2937`/`#9ca3af`.
  - The `.ts-site` CSS has its own defaults.
  - The branding shape is declared four times: `setup.ts`, `tournamentConfig.ts`, `tournamentCreate.ts`, `tournamentDraft.ts`.
- **The founding site** doesn't read the database for colors.
  - About 1,250 `maroon-*`/`gold-*`/`cream-*` classes in 212 files, plus about 450 raw hex values.
  - Its team type is `Team = "maroon" | "white"`, compared by name in 114 places.
- **No Figma connection in this session**, and no Figma variable values anywhere in the repo.

**Source of truth for data:**
`tournaments.branding` + `edition_teams.color` → one resolver (`lib/theme/tournamentTheme.ts`) → CSS variables + a React provider → shared components → screens (website, player app, host, spectator, broadcast).

No part of the app works out tournament colors on its own.

**Theme contract (`lib/theme/tournamentTheme.ts`):**
```ts
type ThemeTeam = { id: string; name: string; color: string }          // any number of teams
type TournamentTheme = { primary: string; secondary: string; accent: string; teams: ThemeTeam[] }
type ResolvedTournamentTheme = {
  theme: { primary; secondary; accent; textOnPrimary; textOnSecondary; textOnAccent }
  competition: { teams: (ThemeTeam & { textOn: string })[]; team1?; team2?; textOnTeam1?; textOnTeam2? }
}
SYSTEM_DEFAULT_THEME   // neutral fallback, no teams
MAROON_THEME_PRESET    // The Maroon, values from Figma
resolveTournamentTheme(branding, teams)   // validates hex; any missing/invalid color falls back to SYSTEM_DEFAULT_THEME
readableTextOn(background)                // WCAG contrast: picks dark or light text, whichever reads better
themeCssVariables(resolved)
```
- Individual tournaments have `teams: []`. Team variables are left unset and nothing breaks.
- Hex values for the default and the Maroon preset live only in this file.
- A test checks that the Maroon database row matches `MAROON_THEME_PRESET`.

**Provider:** `components/theme/TournamentThemeProvider.tsx`
- Sets the variables on a wrapper.
- `useTournamentTheme()` returns real values for SVG and charts.
- The founding site's root layout uses `MAROON_THEME_PRESET`.
- Platform tournament pages use that tournament's resolved theme.

**Migration order:**
1. **This round:**
   - Build the resolver and provider.
   - Connect the platform kit and platform lib to them.
   - Move the shared primitives onto tokens: `Button`, `Badge`.
   - Add the font variables.
2. **Next rounds (one at a time, each checked against Figma):**
   - High-value tournament screens: the new `/play` Tournament Home, leaderboard, match cards, scorecards.
   - Then the team model change (`"maroon" | "white"` → team IDs) so `TeamBadge`, `LeaderboardRow` and `Avatar` can use `competition` tokens.
   - Then broadcast and the remaining legacy classes.
   - Then the typography migration.
3. **Stays legacy for now** (documented, not deleted): the `maroon-*`/`gold-*`/`cream-*` Tailwind ramps and every page still using them.

**What gets changed this round:**
1. **Platform kit** (`components/platform/tournament-site`):
   - `theme.ts` uses the shared resolver and contrast helper.
   - `--ts-primary/secondary/accent/on-*` become `--theme-*`.
   - Team labels use the `competition` text colors.
2. **Platform lib:**
   - One shared `TournamentBranding` type replaces the four copies.
   - `publicSite.ts` and `readiness.ts` use `SYSTEM_DEFAULT_THEME` instead of their own greys.
3. **Shared UI:**
   - `components/ui/Button` and `components/ui/Badge` use theme tokens.
   - Hover and tint shades come from `color-mix()` of the theme colors, so they follow any tournament's palette.
4. **`app/globals.css`:**
   - Tailwind aliases for the semantic tokens.
   - `--font-ui` / `--font-display`.
   - The legacy ramps stay, labelled legacy.
5. **Maroon database row:** only if Figma's values differ from the seed, a small data-only SQL file updates the Maroon row. No schema change, and it needs running in Supabase.
6. **Docs:** this section, plus the same rule in the platform kit README.

**Not included:** a visual redesign, the font switch, the team model change, the remaining legacy classes, settings UI changes (the Branding and Teams editors already save these colors), and any schema change.

**Decisions needed before building:**
1. **The Maroon's exact Figma values.** I can't read Figma from here. Please either:
   - (a) paste the hex values of `theme/primary`, `theme/secondary`, `theme/accent`, `competition/team-1` and `competition/team-2` from Figma's Variables panel, or
   - (b) confirm the brief's values (`#500001` / `#FFFFFF` / `#D6A75C`, teams `#500001` / `#FFFFFF`) are exactly what Figma has.
2. **The neutral system default.** Does Figma define a neutral/default theme mode?
   - If yes, I'll use its values.
   - If no, recommended: a provisional default of primary `#1f2937` (charcoal), secondary `#FFFFFF`, accent `#9ca3af` (grey), marked "provisional until Figma defines it". These are the greys the platform already falls back to.
3. **Where the new Maroon values show up during migration.** If Figma's white/gold differ from the live cream/gold:
   - Recommended: the new values apply only to token-based parts (the `/t/` site kit, Button, Badge, new screens). The legacy pages keep cream `#fbf8f1` / gold `#b8945a` until each is migrated. This is safe with no broad visual change, but migrated and unmigrated parts may sit side by side with slightly different whites and golds for a while.
   - Alternative: also repoint the legacy `cream-50` and `gold-500` to the new values now. The whole site shifts at once (background turns from cream to white everywhere). That's a broad visual change in this round.

**Done means:**
- One resolver file, used by the platform kit, platform lib, provider and root layout. No other file defines tournament theme colors.
- A test catches any hex values for the default or Maroon preset defined outside the resolver.
- Contrast tests cover white, cream, maroon, gold, pale yellow, invalid hex and missing teams.
- An individual (no-team) tournament renders with no team variables and no errors.
- A 3-team theme gives three team tokens.
- The system default is used when a tournament has no branding. The Maroon preset is never used for other tournaments.
- Existing tests, typecheck, lint and build pass.
- Before/after screenshots (home, leaderboard, a `/t/` page, Button/Badge) show no change except the intended Figma values from Decision 1.

### Round: Explore = the home page; merge the old Explore page into it (spec 2026-09-30, approved and built 2026-09-30)

**What it is:** The **Explore** button in the bottom menu now opens the main home page (`/`). Everything on the old Explore page (`/the-maroon`) moves onto the home page. Then the old page is deleted.

**Bottom menu (already built, not yet committed):** Explore → Tourneys → Pick'ems → Profile.
- Tourneys uses the new scoreboard icon.
- Pick'ems links to `/pickems`. That page doesn't exist yet, so it shows "page not found" for now.

**What moves onto the home page (`/`)**, added below what's already there:
1. **Explore filter row.** It currently has Discover · Courses · News. It becomes Discover · Courses · Equipment · Teaching · News, so all 4 categories have a button.
2. **My Tournaments button.** It sits next to the existing Create Tournament card area. It stays greyed out with "Coming soon", same as on the old page.
3. **"Beyond the scorecard" header**, followed by the **4 category cards** (Courses, Equipment, Teaching, News). Each card opens its sub-page, for example `/the-maroon/courses`.
4. **The 4 category sections** (the longer Courses / Equipment / Teaching / News blocks with their "Explore" links, the course guide and the archive link).
5. "Create Tournament" from the old page is **not** duplicated, because the home page already has it.

**Deleted:**
- The old Explore page, `app/the-maroon/page.tsx`. Going to `/the-maroon` will show "page not found".
- The sub-pages `/the-maroon/courses`, `/equipment`, `/teaching` and `/news` **stay**, along with their photo header and dropdown menu. Their "Home" menu link already goes to `/`.

**Links that pointed at `/the-maroon` now point at `/`:**
- the bottom-menu Explore button
- the footer's "About The Maroon"
- the platform header's "Explore The Maroon"
- the home page's "Explore The Maroon" button

The Explore button lights up on `/` and on any `/the-maroon/...` sub-page.

**Not included:** building the Pick'ems page or a real My Tournaments button, and any visual redesign. Moved pieces keep their current look.

**Done means:**
- Explore opens `/`.
- Every button and section from the old page appears on `/`.
- `/the-maroon` is gone, and its sub-pages still work.
- No links lead to the deleted page.
- Typecheck, lint and the bottom-menu tests pass, with tests updated for the new Explore link.
- I've checked it in the browser at phone width.

### Round: My Profile page (spec 2026-09-30, approved 2026-09-30, built — needs `supabase/platform_active_editions.sql` run in production)

**What it is:** The signed-in person's own profile page, laid out like the fantasy-app Account screenshot, in Maroon colors (dark maroon gradient instead of teal). It looks a lot like the player profile, but it's about *you*.

**Where it lives:**
- New page at `/profile`. Signed-in only. Signed-out visitors are sent to `/login`.
- The bottom-menu **Profile** button and the platform header's account icon now point to `/profile`. The Profile button lights up on `/profile`.
- `/account/choose` is unchanged. It's still the screen you land on right after logging in.

**Header:**
- Big round avatar: the player's photo if there is one, otherwise their initials.
- A **pencil** on the avatar. For players it opens the existing Edit My Bio page (`/portal/profile`), and admin still approves changes. Fans get no pencil.
- **Name**: the first one that exists out of `player_slots.full_name` (players), `profiles.display_name`, `profiles.username`, and the part of their email before the @.
- **"Member since Mon D, YYYY"**, from when the account was created.
- **Team badges**: Maroon and/or White, one for each team they've played on, from the 2024–26 rosters. Display only. There's no "Edit Flair" picker.
- **Gear** in the corner that opens `/settings`, which is still "Coming soon".

**Three tabs: Tournaments · Stats · About**
1. **Tournaments.**
   - An Active / Completed switch and two big counters: **# Active** and **# Played**.
   - **Active**: platform tournament years they're on the roster for whose last day (end date, else start date) hasn't passed yet. It uses the same filters as Past Tournaments: no test seasons, and customer tournaments only once they're published.
   - **Completed**: finished years. It combines the Maroon 2024–26 years they played (from the existing static rosters) with the platform's existing `list_my_past_editions()`. A year that shows up in both lists is shown only once.
   - Each row shows the tournament name, year, place and dates, and tapping it opens that year's public page.
   - Empty states: "No active tournaments" with a **Join a Tournament** link to `/tournaments/join`, and "No completed tournaments yet".
2. **Stats.** The same career numbers the player profile shows (scoring average, team points, total earned, skins), year by year, from `getPlayerStatsByYear`. Fans, or players with no stats, see "No stats yet."
3. **About.** Their approved bio: the static profile merged with approved edits. Empty: "No bio yet."

**Data:**
- No new tables.
- One new read-only database function, `list_my_active_editions(p_profile)`, in `supabase/platform_active_editions.sql`. It's built like `list_my_past_editions`:
  - It's called only by the server, with the session's own user id.
  - It returns display fields only.
  - It needs `platform_foundation.sql` run first, and it's safe to run more than once.
  - It must be run in Supabase before Active shows platform tournaments.
- If either platform function is missing or fails, its list is simply empty and the page still loads. Maroon years, stats and bio work without any SQL.

**Not included:** photo upload (its own round next), MM Coins balance, Edit Flair, and a real Settings page.

**Done means:**
- `/profile` renders all three tabs for a player and for a fan, checked in the browser at phone width.
- Signed-out visitors are sent to `/login`.
- The Profile button and the header icon go to `/profile`, and the Profile button lights up there.
- New tests cover:
  - the Active/Completed merge, including duplicates and empty lists
  - `list_my_active_editions`, which only returns your own rows, skips finished, test and unpublished years, and is denied to anon and authenticated callers
  - the bottom-menu link
- Typecheck, lint and existing tests pass.

### Round: Tourneys flow — Tourneys page → My Tournaments → Tournament Home (spec 2026-09-30, approved and built 2026-09-30)

**The flow this round builds:**

```
Open The Maroon → Main app (bottom menu: Explore | Tourneys | Pick'ems | Profile)
  → Tap Tourneys → Tourneys page
       [Create a Tournament] [Join a Tournament]
       [My Tournaments]
       Past Tournaments list
  → Tap My Tournaments → list of my tournaments
  → Tap "Maroon Masters 2027" → enter that tournament
  → Tournament Home (Home | Matches | Leaderboard | Players | More)
```

**1. Tourneys page restyle (`/tournaments/join`, opened by the Tourneys button):**
- **Whole page is maroon.** Its text and lines turn white or cream so they stay readable.
- **Two boxes side by side at the top**, under the "Tournaments" title. Both are short rounded maroon boxes with white letters and a white line-drawn golf icon.
  - **Create a Tournament** has a flag-on-a-green icon and opens `/tournaments/new`.
  - **Join a Tournament** has the scoreboard icon and is **not tappable yet**.
- **My Tournaments button** sits below the two boxes and spans their full width. It opens the new My Tournaments list (part 2).
- **The old long "Create Tournament" bar is removed.**
- **The paste-a-link box and the Past Tournaments list stay** and work the same; they're only recolored. Past Tournaments still opens each year's public site for now.

**2. New My Tournaments list (`/tournaments/mine`):**
- **Uses the same maroon look as the Tourneys page.** The Tourneys button stays lit on this page.
- **What it lists:** every tournament year the signed-in person is **playing in** that **hasn't finished yet** (current and upcoming).
  - "Playing in" means they're on that year's roster.
  - Commissioners are also players, so their tournaments show up the same way.
  - Finished years stay in Past Tournaments.
- **Each row** shows the tournament name, year, place and dates, for example "Maroon Masters 2027".
- **Tapping a row opens that year's Tournament Home**, `/play/<tournament>/<year>`. That's the already-built Home | Matches | Leaderboard | Players | More app.
- **Signed out:** "Log in to see your tournaments", with a Log In link.
- **Empty:** "You're not in any upcoming tournaments yet."
- **Error:** "We couldn't load your tournaments right now."
- **Name clash:** the organizer studio's own "My Tournaments" page at `/tournaments` (Continue Setup / Preview) is a different page and isn't changed.

**3. Data:** No new SQL. The list reuses `list_my_active_editions()`, which the My Profile round already added (`supabase/platform_active_editions.sql`, the same "unfinished roster years" rule). It works in production once that file is run.

**Not included (later rounds):**
- the past-tournament stats archive
- making Join a Tournament do anything
- any change to Tournament Home itself
- the organizer studio

**Done means:**
- Tourneys → My Tournaments → tap a tournament → Tournament Home works end to end.
- The Tourneys page is maroon, with the two boxes, the My Tournaments button and no old bar.
- The new list shows only current/upcoming roster years, and handles signed-out, empty and error states.
- Typecheck, lint and tests pass, including a test for the Tourneys-tab highlight on the new page.
- I've checked it in the browser at phone width.

### Round: Profile Stats tab — one table + the career stats page folded in (spec 2026-09-30, approved 2026-09-30, built)

**What it is:** A rework of the **Stats** tab on My Profile (`/profile`). It now holds everything from the website's player stats page (`/teams/stats/players/<player>`), so the profile doesn't link out.

**Top to bottom on the Stats tab:**
1. **The table starts right under the Tournaments | Stats | About tabs.** The extra gap above it goes away.
2. **The table is flipped.**
   - **Columns:** **Year**, **Event**, then one column for every stat we track. That's the full list from the website stats page:
     - Scoring Avg, Team Points, Earned, Skins
     - Putting Avg, Putts/Hole
     - Par 3, Par 4 and Par 5 Avg
     - GIR %, FIR %
     - 1-Putts, 3+ Putts, Up & Down %
     - Birdie-or-Better, Double-or-Worse
     - Bounce Back %, Fall Off %
     - Strokes Gained: Total, Off Tee, Approach, Around Green and Putting
   - **Rows:** one per tournament played, newest at the bottom. A new tournament simply adds a row.
   - **Total row** at the bottom, in gold:
     - **Counts are added up:** points, earnings, skins, 1-putts, 3+ putts, birdies and doubles.
     - **Averages and percentages show "—" in the total row.** Adding them up would give a wrong number, and this matches the website page today.
   - **Scrolling:** on a phone the table scrolls sideways. **Year and Event stay pinned** on the left so you always know which row you're on.
   - **Missing stats** show "—".
   - **Event** says "The Maroon Tournament" for each year, since that's the only tournament with stats so far.
3. **Under the table: "Performance at a glance."** This is the gold 5-point chart (Score, Fairways, Greens, Up & Down, Putting) plus the 4 tiles (Scoring avg, Career points, Fairways, Greens), moved over from the website stats page. They're restyled dark to match the profile.
4. **The "Full career stats" link is removed**, because it's all here now.

**Not changed:** the website's own player stats page keeps working for public visitors. Its numbers come from the same shared code, so both pages always agree.

**Not included:** stats for platform (non-Maroon) tournaments, which don't record stats yet.

**Done means:**
- The table is flipped as above, with a total row and pinned Year/Event.
- The chart and tiles sit under it.
- The link is gone.
- The website stats page is unchanged.
- Typecheck, lint and tests pass, including updated tests for the table data.
- I've checked it in the browser at phone width.

### Round: Bottom-menu page titles (owner request 2026-09-30, built)

- The four bottom-menu pages (Explore `/`, Tourneys `/tournaments/join`, Pick'ems `/pickems`, Profile `/profile`) use the platform top bar with only the ☰ menu and the account icon. There's no "The Maroon" wordmark (`PlatformHeader wordmark={false}`).
- Each page shows its own big title, in the Tourneys title style: **The Maroon** (replaces "The digital home for competitive golf."), **Tourneys** (was "Tournaments"), **Pick'ems** and **Profile**. On Profile, the person's name is now a smaller heading under the title.
- `/pickems` exists as an all-maroon page with only its title, for now.
- Every other page keeps its current header.

### Round: Maroon migration Phase 2 — read-only Maroon adapter (spec 2026-09-30, approved and built 2026-09-30; check: `npx tsx scripts/compare-maroon-adapter.ts`)

**Background:** The Maroon Tournament is moving into the new tournament app (`/play/the-maroon-tournament/<year>`) in layers, without touching the old code. The full inventory, migration matrix and owner decisions are in `docs/maroon-legacy-migration-inventory.md`. C1 (`platform_foundation.sql`) is now run in production.

**What it is:** One new "translator" file. It reads The Maroon's real data through the functions the old site already uses, and reshapes it into the same format the new tournament app reads for every tournament (`TournamentSiteData`). Nothing on screen changes in this round. Showing it in `/play` is Phase 3/4.

**Where the data comes from (read-only, Supabase + the existing history files, never the Google Sheet):**
- **Name, short name, colors, dates, place, timezone:** the tournament and edition rows C1 created (`the-maroon-tournament`).
- **Matches, team points, individual leaderboard, roster:** `getSeasonTournament(year)`, the same function the old site uses. It reads the 2024–2026 history files and Supabase for 2027 on.
- **Courses and rounds:** the same venue/schedule readers the old schedule page uses.
- **Player names:** the old site's name lookup, so every name matches the old pages exactly.

**How it maps:**
- **Teams:** Team Maroon and Team White. Points are shown only once at least one match has a result, so 2027 never shows a fake 0–0.
- **Matches:** Maroon players on one side, White on the other, with format, tee time, status and result. The result is built only from data that exists ("3&2", "1 UP", "Halved"). If an old match has no margin saved, it says only who won and never invents one.
- **Rounds:** same round labels as the old schedule (`formatRoundLabel`), so 2025's Round INDI and 2026's renumbering stay exactly as they are today.
- **Archive-only matches** (like 2024's Round 7 slot) stay hidden, same as the old public pages.
- **Leaderboard:** same order and ties as the old leaderboard; scores shown as "-3", "E", "+2".
- **Missing data** (for example 2027 before pairings) is left empty, so the app shows its normal "not posted yet" messages.

**Not included:**
- any change to `/play`, My Tournaments, the old pages, the old database tables or any SQL
- scorecards, fantasy, wagers, broadcast, handicaps (later phases)
- anything that saves data

**Done means:**
- New `lib/platform/maroonAdapter.ts` (the pure translation) and `maroonAdapterServer.ts` (the data reads), with unit tests for teams, matches, results, ties, round labels, hidden archive matches and empty years.
- A read-only check script compares the translator's output with the old site for 2024, 2025, 2026 and 2027: same team points, same match count and results, same leaderboard order, same roster. It must match 100%.
- No file in the old Maroon code is changed (checked with `git diff`).
- Typecheck, lint and tests pass.

### Round: Create Tournament page with format tiers (spec 2026-09-30, approved 2026-09-30)

**What it is:** A new page at `/tournaments/create` that sits in front of the tournament survey (`/tournaments/new`). The home page's Create Tournament card, the Tourneys "Create a Tournament" box, and the ☰ menu's Create Tournament link all go here now.

**Look:** the same as Tourneys: dark maroon, the icon-only top bar, and the bottom menu (the Tourneys tab stays lit).
- **Top half:** "Your Next Tournament Starts Here" in big white serif, and under it "Pick the format that's right for your group" in Barlow, in gold.
- **Bottom half:** three swipeable frosted-glass price boxes. Each has an icon in a circle, a small label, a big name and a gold price line:

| Icon | Label | Name | Price line |
|---|---|---|---|
| person | Tier 1 | Individual | Free during beta |
| swords | Tier 2 | Match Play | Free during beta |
| trophy | Tier 3 | Individual + Match Play | Free during beta |

**Tapping a box** opens `/tournaments/new?tier=<individual|match-play|individual-match-play>`. The survey then shows a small header with the pick, e.g. "MATCH PLAY · Free during beta". An unknown tier, or none, shows no header and the survey works as before.

**Not included:**
- charging money (the spec's "no hard-coded pricing" rule stands: the "Free during beta" line is a placeholder)
- saving the tier with the tournament
- changing the survey's questions (match play still needs two teams in the survey)

**Done means:**
- The page renders as above at phone width.
- Each box opens the survey with the right small header.
- The three Create links point to the new page.
- There are tests for the tier list and links.
- Typecheck, lint and existing tests pass.
- I've checked it in the browser with screenshots.

### Round: Maroon migration Phase 3 — The Maroon Tournament in My Tournaments and /play (spec 2026-09-30, approved 2026-09-30)

**What it is:** The Maroon Tournament shows up in Tourneys → My Tournaments, and tapping it opens `/play/the-maroon-tournament/<year>` with its real data, using the Phase 2 translator. The old site stays exactly as it is, and no old routes are redirected.

**1. My Tournaments (`/tournaments/mine`):**
- **Who sees The Maroon Tournament:** a signed-in person whose account owns a player (the player slot they claimed) **and** that player is on that year's roster in Admin Center (`live_roster`). Both are read live, so later roster changes and new sign-ups show up right away. The one-time copy C1 made (`edition_roster`) is not used for The Maroon.
- **Which years:** years that haven't finished yet. The end date is the locked dates in Admin Center if set, otherwise the edition's own. A year with no dates yet counts as upcoming. The test season (2034) never shows.
- **The row:** "The Maroon Tournament 2027", with the locked venue and dates when Admin Center has them.
- **Tapping it opens `/play/the-maroon-tournament/2027`** (it used to go to the old `/website`).
- Other tournaments' rows work exactly as before.

**2. Tournament Home (`/play/the-maroon-tournament/<year>`):**
- **Signed in only**, the same as every tournament's home. Anyone signed in can open it, because the same information is already public on the old site.
- **Home, Matches, Leaderboard and Players** show the translator's real data: teams, roster, rounds, courses, matches, points, leaderboard and the final result for finished years.
- **Not wired yet (Phase 4):** the announcements/activity feed (hidden), "your match", the commissioner link, and links from More to the old scorecards, fantasy, wagers and broadcast. The website link goes to the old site's home (`/website`).
- A year with no edition, or the test season, shows "not found".

**Not included:**
- any change to the old Maroon pages, tables, scoring or Admin Center
- any change to the Tournament Home screens' look (only the data loader changes)
- My Profile's "Active" list (it still links The Maroon to `/website`)

**Production step:** My Tournaments needs `supabase/platform_active_editions.sql` run in Supabase. It's one read-only function; without it, the page shows its error message.

**Done means:**
- Signed in as a player on the 2027 roster: Tourneys → My Tournaments shows The Maroon Tournament 2027, and tapping it opens its Tournament Home with the real roster, rounds and courses.
- `/play/the-maroon-tournament/2026` shows the real 2026 matches, 17–16 points and leaderboard.
- Unit tests for who sees the row, finished/test years and the link. The Phase 2 check script still matches.
- No old Maroon file is changed. Typecheck, lint and tests pass.

### Round: Login lands on Profile (owner request 2026-09-30, built)

- Logging in always goes to `/profile`. That includes a signed-out person tapping Profile, who is sent to Log In and then comes back to their profile.
- Login no longer opens the `/account/choose` screen or The Maroon Tournament's pages. The Maroon Tournament is reached from Tourneys.
- `/account/choose` still works if someone opens it directly.
