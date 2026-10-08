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


## Architecture rules (global)

### Finalized Player History Rule

Golf Trips, Tournaments, Leagues and other events are containers for live and organizational data.

When a player's scored round becomes Final, its permanent historical performance data must eventually be stored independently against the player/user.

Deleting a Golf Trip, Tournament, League or other event must never cascade-delete finalized player round history or finalized player statistics.

Permanent historical records may keep a nullable reference to their source event, but deleting the source event must not delete the historical record.

Important context (event name, course name, date and format) should eventually be snapshotted into permanent player history, so the record stays meaningful even if the original event is later deleted or changed.

Architecture rule only: the player-history tables are not built yet.

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

### Rule: how visual design is decided (revised 2026-10-01)

- **Who owns what:**
  - The tournament engine and database own the data and the truth.
  - The running local app is the visual review surface:
    - `/dev/play` for the tournament UI
    - `/` and the main app routes for the platform UI
  - Figma is a reference and is no longer the primary authority. (This replaces the 2026-09-30 "Figma is the source of truth" rule.)
- **Existing production styling is legacy.** It doesn't define the design system. Keeping live appearance during a migration is a safety choice, not a design decision.
- **New UI:**
  - Uses semantic theme tokens and shared components.
  - Adds no tournament-specific hardcoded colors without a written reason.

**Theme roles.** Every tournament has **Primary**, **Secondary** and **Accent**. Team events add one color per team. These are meanings, not fixed colors.
- **Primary:** the main identity. Branded surfaces, primary actions, selected states.
- **Secondary:** supporting contrast. Secondary surfaces and alternate treatments.
- **Accent:** emphasis only. Highlights, live states, key stats, leaderboard emphasis. Never the dominant color.
- **Team colors:** competition identity only. Match cards, team indicators, score bars, team labels, broadcast team graphics. They never replace the tournament theme.

**Default theme vs. The Maroon preset.** These are two separate things, and The Maroon is **not** the universal fallback.

| | Primary | Secondary | Accent | Teams |
|---|---|---|---|---|
| **System default** (provisional, until a proper Default/Neutral theme is designed) | `#1f2937` | `#ffffff` | `#9ca3af` | none |
| **The Maroon preset** (from the Figma variables, 2026-09-30) | `#500001` maroon | `#f7f4ee` cream | `#d6a75c` gold | Team Maroon `#500001`, Team White `#f7f4ee` |

- These values exist only in `lib/theme/tournamentTheme.ts`.
- Related Figma primitives, not used yet: `neutral/0` `#FFFFFF`, `neutral/1000` `#090507`.

**Token names (they match the Figma names):**

| Figma | Code (TS) | CSS variable |
|---|---|---|
| theme/primary · secondary · accent | `theme.primary` · `.secondary` · `.accent` | `--theme-primary` · `--theme-secondary` · `--theme-accent` |
| theme/text/on-primary · on-secondary · on-accent | `theme.textOnPrimary` · `.textOnSecondary` · `.textOnAccent` | `--theme-on-primary` · `--theme-on-secondary` · `--theme-on-accent` |
| competition/team-1 · team-2 | `competition.team1` · `.team2` (from `teams[0]`, `teams[1]`) | `--competition-team-1` · `--competition-team-2` (`-3`… for more teams) |
| competition/text/on-team-1 · on-team-2 | `competition.textOnTeam1` · `.textOnTeam2` | `--competition-on-team-1` · `--competition-on-team-2` |

Tailwind utilities on top of the variables: `bg-theme-primary`, `text-theme-on-primary`, `bg-team-1`, `text-team-on-1`, etc.

**Contrast:** `readableTextOn(background)` picks black or white text, whichever has the higher WCAG contrast ratio against the background. Every "text-on" color comes from it.

**Typography debt:**
- Figma uses DM Sans (interface) and Instrument Serif (display).
- Production uses Spectral and Barlow / Barlow Condensed.
- Moving over is a later step (see the migration order).

**What I found (inspection, 2026-09-30):**
- **No schema change is needed.**
  - `tournaments.branding` (JSON: `primary`, `secondary`, `accent`, `logoUrl`) holds the tournament colors.
  - `edition_teams.color` holds one color per team, with no two-team limit.
  - Individual events have 0 teams.
- **The Maroon's database row** is still seeded with the old values: secondary `#fbf8f1`, accent `#b8945a`, and the White team `#fbf8f1`.
- **Competing theme logic:**
  - `components/platform/tournament-site/theme.ts`: its own contrast helper, fallback `#193c52`.
  - `lib/platform/publicSite.ts`: fallback `#1f2937` / `#f7f7f4` / `#9ca3af`.
  - `lib/platform/readiness.ts`: fallback `#1f2937` / `#ffffff` / `#9ca3af`.
  - `components/platform/play/PlayShell.tsx`: falls back to The Maroon (`#500001` / `#d6b85c`).
  - `MatchCard.tsx` and `TournamentHomeScreen.tsx`: team fallback `#3a1620`.
  - `MobileHome.module.css` and `JoinTournament.module.css`: their own color variables.
- **The founding site and Admin Center:**
  - About 1,250 `maroon-*`/`gold-*`/`cream-*` classes, plus about 450 raw hex values.
  - Its team type is `Team = "maroon" | "white"`.
  - All of this stays as it is (see "Not touched").

**Migration order (one step per commit; each step is reviewed in the local app):**
1. **Foundation** (this round, see below).
2. **Shared `Button` / `Badge`** move onto theme tokens. This includes setting the theme variables at the root.
3. **`/play`:**
   - `--play-*` become theme tokens.
   - Remove the Maroon fallback in `PlayShell` and the `#3a1620` team fallback.
4. **Platform pages:** clean up the hex values in `AccessRequests`, `MyTournaments`, `PlatformEntry`, `MobileHome`, `JoinTournament`, `CreateTournament`, the organizer dashboard and the draft workspace.
5. **Typography.**

**Not touched until a separate later phase:**
- The team model (`"maroon" | "white"` → team IDs).
- Legacy leaderboard, broadcast and domain logic.
- Founding Maroon site styling.
- Admin Center styling.

**Database:**
- `supabase/maroon_theme_colors.sql` updates The Maroon's row and its two teams to the preset colors. It's data only; there's no schema change.
- It is **prepared, not run.** Apply it only after the backup/restore and production migration process is approved.
- Once it's run, The Maroon's `/play` screens show the new cream/gold, because they read the row.

### Round: Theme Step 1 — foundation (spec 2026-09-30, approved 2026-10-01)

**What it is:** The shared theme engine. No intended visual change.

**Builds:**
- **`lib/theme/tournamentTheme.ts`** contains:
  - the types: `ThemeTeam`, `TournamentTheme`, `ResolvedTournamentTheme`
  - the presets: `SYSTEM_DEFAULT_THEME` (provisional neutral) and `MAROON_THEME_PRESET`
  - `isHexColor`, `relativeLuminance`, `contrastRatio`, `readableTextOn`
  - `resolveTournamentTheme(branding, teams)`: invalid or missing colors fall back to the system default; invalid team colors fall back to a neutral team grey
  - `themeCssVariables(resolved)`
- **Tests** in `lib/theme/tournamentTheme.test.ts`:
  - contrast for white, cream, maroon, gold, pale yellow and black
  - invalid hex
  - an individual event (no team variables)
  - 3 teams giving 3 team tokens
  - an unbranded tournament gets the system default, never The Maroon
  - the SQL file matches the Maroon preset
  - the default and preset hex values appear in no other app file
- **`app/globals.css`:** Tailwind aliases for the theme tokens. Nothing uses them yet.
- **Duplicated fallbacks removed where safe:**
  - `tournament-site/theme.ts`: `safeColor`, `luminance`, `readableText` and `themeVariables` keep their names but use the shared engine. Text colors come out the same as before.
  - `publicSite.ts` and `readiness.ts` use `SYSTEM_DEFAULT_THEME`. The only visible change: an unbranded public site's secondary color goes from `#f7f7f4` to `#ffffff`, as decided.
- **The prepared, unrun SQL file** above.

**Not in this step:**
- The `/play` files (that's Step 3).
- Button / Badge.
- Root-level CSS variables.
- Fonts.
- Any SQL run.

**Done means:**
- New and existing tests, typecheck, lint and build all pass.
- `/` and `/dev/play` render as before.
- Committed on its own.

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

### Round: Maroon migration Phase 3 — The Maroon Tournament in My Tournaments and /play (spec 2026-09-30, approved and built 2026-09-30; needs `platform_active_editions.sql` in production)

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

### Round: Maroon migration Phase 4 — read-only Maroon features in /play (spec 2026-09-30, approved and built 2026-09-30)

**What it is:** More of The Maroon Tournament inside `/play/the-maroon-tournament/<year>`, all read-only from the old system. Every action stays on the old pages. No SQL, no C4, no redirects, no writes. Maroon logic stays in `lib/platform/legacyTournaments.ts` and the adapter files.

- **Your Match (Home):** the signed-in player's own match from Admin Center's posted matchups: partner, opponents, format, round, course, tee time, live or final. Shown only when certain: their one live match, else their one earliest scheduled match. Anything ambiguous shows nothing.
- **Tee times:** live-year tee times are shown in the tournament's timezone (the adapter reads the raw time). Old pages are unchanged.
- **More → Admin Center:** only for Admin Center hosts, using Admin Center's own host check (`requireHost`). Players and platform admins who aren't hosts don't see it.
- **More → Tournament features:** links to the old pages.
  - **Active season:** Live scoring, Round videos and Skins (players the portal accepts, via `requirePlayer`), plus Fantasy, Wagers, Watch Live and Broadcast.
  - **Past years:** only that year's own pages: Results & scorecards, My scorecards, Teams.
  - **Any year:** Career stats, for players.
- **More → History:** the earlier Maroon seasons the viewer may enter.
- **Tourneys → Past Tournaments and Profile (Active/Completed):** Maroon years the viewer played open `/play/the-maroon-tournament/<year>` instead of `/website`, read live (history files for 2024–2026, Admin Center roster after).
- **Activity/announcements:** stay hidden for The Maroon. The platform activity functions refuse legacy tournaments and aren't in production. Enabling them needs a separate approved SQL round.

### Round: Main-app navigation cleanup (owner request 2026-10-01, built)

The Maroon app is the front door. The main navigation is Explore · Tourneys · Pick'ems · Profile. Tournaments are entered from Tourneys → My Tournaments.
- **☰ menu:** the "The Maroon Tournament" link to `/website` is removed (`/website` itself stays), and "My Tournaments" now opens the player list `/tournaments/mine` (the organizer studio `/tournaments` stays).
- **Explore:**
  - The disabled "My Tournaments · Coming soon" button is removed.
  - "Already part of the club? Log In" shows only to signed-out visitors.
- **My Tournaments (`/tournaments/mine`):** uses the icon-only top bar like the four tabs. Its back link says "Tourneys".
- **`/account/choose` is retired:** signed-in visitors are sent to `/profile`, and signed-out visitors to Log In. The Portal, Scoring and Website pages are unchanged.
- **Left as is:** Edit Bio (`/portal/profile`), and Explore's article links to `/schedule` and `/history`.
- **Tests:**
  - `scripts/test-main-nav-browser.mjs` (`npm run test:browser:nav`)
  - `scripts/test-mobile-home-browser.mjs`, updated for this navigation

### Round: Golf Trip Home — layout only (spec 2026-10-01, awaiting approval)

**What it is:** the page a trip organizer lands on right after finishing the Golf Trip questionnaire. This round builds the look and structure only — no saving, no database, no changes to the questionnaire logic.

**Who uses it:** the organizer who just created the trip (later: everyone on the trip).

**Route:** `/golf-trips/trip` (one page for now; there is no saved trip id yet). It reads the questionnaire answers already kept in this browser tab (`readGolfTripDraft`) so the real trip name, destination, dates and rounds show. Empty answers show a friendly placeholder ("Not set yet").

**Look:** all dark maroon (maroon-900, no lighter reds) with cream text. **No top nav bar.**
- **Header:** the trip name, big, at the top. Destination + dates in small text under it.
- **Tab selector** under the name — 5 tabs: **Home · Players · Team · Venue · Info**. Home is selected by default. Switching tabs happens on the page (no page reload).

**Home tab** — a stack of section cards, each with a title, a short summary from the questionnaire where we have it, and an empty state where we don't:
1. Travel — dates + destination
2. Stay — empty state ("Add where you're staying")
3. Golf — the planned rounds (day, date, course)
4. Transportation — empty state
5. Tournament — "Yes / No / Not sure yet" from the Format step
6. Travelers — the organizer's name; empty state for the rest
7. Itinerary — one row per trip day
8. Expenses — empty state
9. Photos — empty state

**Players / Team / Venue / Info tabs:** a simple "Coming soon" card each for now.

**Files:**
- `app/golf-trips/trip/page.tsx` (new page)
- `components/platform/GolfTripHome.tsx` (header, tabs, section cards)
- `components/platform/GolfTripHome.module.css` (styles)
- The questionnaire's Travel step is a placeholder with no Next button, so it is **not** linked to the new page this round (that changes when the Travel step is built).

**Not in this round:** saving the trip, editing sections, real Players/Team/Venue/Info content, photo upload, expense math.

**Done means:** `/golf-trips/trip` loads on phone and desktop with no errors, shows the trip name and the 5 tabs, all 9 Home sections render with real answers or empty states, tabs switch, and type-check + lint pass.

### Round: Golf Trip Home dev preview (owner request 2026-10-01, built)

- `/dev/tournament` shows Golf Trip Home (the page after the questionnaire) filled with made-up answers (`lib/platform/golfTripPreviewFixture.ts`), so it can be reviewed without signing up or filling the questionnaire.
- Development only: 404 unless running `npm run dev`. No login, no database reads or writes, no auth changes.
- It renders the real `GolfTripHome` component (given the fixture through a `preview` prop), so style changes carry over to `/golf-trips/trip`.

### Golf Trip Integration Foundation (owner request 2026-10-01, built)

- **Provider architecture:** one registry (`PROVIDERS` in `lib/platform/tripIntegrations.ts`) — each provider has key, name, category, status (planned/configured/enabled/disabled), capabilities (search/import/sync/externalLink/navigation/oauth). The browser never calls a third party: page → our API route → `runIntegration()` in `lib/platform/tripIntegrationsServer.ts` → provider. Unimplemented providers return `NOT_CONFIGURED` (no fake data). Adding one later = write a handler, register it in `HANDLERS`, set its env keys.
- **External references:** every trip record carries `externalRef` (provider, externalId, externalUrl, sourceType manual/api/email/link, lastSyncedAt), or null when typed by hand.
- **Normalized locations:** one `TripLocation` (name, address, city, region, country, lat/lng, optional externalPlaceId). Map IDs are hints, never the identity.
- **Actions:** `ExternalAction` (type, label, url) drives buttons like Navigate / Call without provider-specific UI logic.
- **Categories:** flight, lodging, transportation, golf, place, maps, weather, email, calendar. **Manual entry** exists for every category users fill in; Google/Apple Maps and Waze work now as plain links.
- **Security:** integration keys are server-only env vars read in one file, never `NEXT_PUBLIC_`. OAuth tokens (Gmail/Calendar) need encrypted server-side storage in a table with no client read policy — not built; no tokens are stored anywhere yet.
- **Not implemented:** any real provider call, OAuth, Golf Trip record types/tables (Flight, Lodging, Transportation, Tee Time, Place) and itinerary mapping — deferred until the Golf Trip persistence schema (other tab) lands, then connected to it with "trip members only" RLS; the itinerary UI; email/calendar import.

### Golf Trip Persistence: Create Golf Trip (owner request 2026-10-01, built; SQL not yet run in production)

**Golf Trips are persisted entities.** The questionnaire draft (sessionStorage) is only the input. After Create Golf Trip, everything comes from Supabase.

**Canonical route:** `/golf-trips/[tripId]` is the one Golf Trip Home for a saved trip. It's the same page whether the trip was just created, refreshed, reopened later, or picked from My Trips. It's rebuilt from Supabase on every request and never reads the questionnaire draft.

**Re-entry point: My Trips.** My Trips on the Golf Trips page (`/golf-trips`) is the standard way back into a saved trip: Golf Trips → My Trips → pick a trip → `/golf-trips/[tripId]`.
- It lists the signed-in person's trips from `getUserGolfTrips()`, fresh on every visit, so a deleted trip simply disappears. Each row shows name, destination, dates, player count and Organizer/Member, and links to the canonical trip page (there's no other trip detail page).
- Trips that haven't ended (Chicago date) are under "Upcoming Trip", soonest first; ended ones are under "Past Trips", most recent first.
- Empty lists show "No upcoming trip yet." / "No past trips yet."; signed-out visitors see "Log in to see your trips."
- Getting there: the **Golf Trips** bottom tab on phones (shown on the trip page too), and **Golf Trips** in the ☰ menu on every page with the platform header (desktop has no bottom tabs).

**Core relationship:** Golf Trip → members → rounds → future trip-owned systems. `golf_trips.id` (the trip ID) is the central identifier: flights, lodging, transportation, activities, restaurants, courses, teams, pairings, tournament links and per-traveler info will each be their own table with a `golf_trip_id` reference. None are built.

- **Flow:** Questionnaire → Review → Create Golf Trip → `POST /api/golf-trips` → `create_golf_trip` → trip ID → `/golf-trips/<id>`.
- **Tables (`supabase/golf_trips.sql`):**
  - `golf_trips`: name, destination, start/end dates, expected traveler count, golf days, planned rounds, the four planning answers (`includes_tournament`, `lodging_plan`, `flight_plan`, `transportation_plan`, each `yes`/`no`/`undecided`), `status` (`planning`), `created_by`, and an empty `tournament_id` for attaching a real tournament later.
  - `golf_trip_members`: the organizer and the members (`role` = `organizer` / `member`). `profile_id` is optional so travelers without accounts fit later. Its `id` is the traveler identity future per-traveler info can point at.
  - `golf_trip_rounds`: one row per round (day, date, typed course name).
  - Members and rounds are removed with their trip (`on delete cascade`).
- **Writes:** only `create_golf_trip(profile, input)`, called by the server after `lib/platform/golfTripCreate.ts` validates the answers. It is all or nothing. The browser sends a request ID kept in the draft, so a double tap, a retry or Back → Create again returns the same trip. Changing any answer (a step's Next) starts a new request ID.
- **Reads (`lib/platform/golfTripsServer.ts`, server only, user ID from the session).** These two functions are the shared server-side access layer for saved Golf Trips. Other tabs and features (My Trips, Trip Settings, Delete Trip, future trip modules) should use them rather than calling the database functions directly:
  - `getGolfTrip(tripId)` returns the trip, its members and rounds, plus `viewer` (`role`, `isOrganizer`, `memberId`) for the signed-in person. It returns `signed-out` or `not-found` otherwise; a stranger gets the same `not-found` as a missing trip.
  - `getUserGolfTrips()` lists every trip the signed-in person is on, soonest first: ID, name, destination, start/end dates, status, expected traveler count, member count, and their role. It's the data for My Trips. The selector UI is built elsewhere.
- **RLS:** members can read their trip's rows. Nobody can insert/update/delete directly. `create_golf_trip`, `get_golf_trip` and `list_my_golf_trips` are callable only by the server.
- **Review page:** "Creating your trip…" while saving, with the button locked. Errors show in plain words and the answers stay in place.
- **Login return:** not supported today. `LoginForm` always goes to `/profile`, and `/login` reads no return parameter. The cleanest later fix is `/login?next=<path>`, with `LoginForm` accepting only same-site paths (starting with `/`, not `//`) and falling back to `/profile`. Review's "Log in" link and `/golf-trips/[tripId]`'s sign-in redirect would pass `next`. Not built.
- **Old `/golf-trips/trip`:**
  - It's the pre-persistence draft view. Nothing in the app links to it except its own `/golf-trips/trip/settings` page, and no test suite uses it (only the temporary screenshot script `_tmp-shot-trip.mjs` points at it).
  - It shares only the `GolfTripHome` component, which `/golf-trips/[tripId]` and `/dev/tournament` also use.
  - It's obsolete for the product and safe to remove once the Golf Trip design/settings work stops using it. Removal means deleting `app/golf-trips/trip/` and its `SiteChrome` entry; `GolfTripHome`'s draft fallback can then go too. Not removed yet.
- **Delete Trip is handled separately (another tab)** and is not part of this work.
- **Tests:**
  - `lib/platform/golfTripCreate.test.ts`: validation, all-or-nothing, double tap, members-only, RLS, trip list, organizer/member.
  - `scripts/test-golf-trip-create-browser.mjs` (`npm run test:browser:golf-trip`, after `next build`): create, double tap, refresh, reopen, members-only, signed-out.
- **Not built:** Edit Trip, invitations, role management, destination map fields, cover photo, course search, and any flight/lodging/transportation/team/tournament records.

### Round: Trip Settings + Delete Trip (owner request 2026-10-01, built)

- The settings wheel on Golf Trip Home opens Trip Settings (`/golf-trips/<id>/settings`; preview `/dev/tournament/settings`, `?as=traveler` for the non-organizer view). Title "Trip Settings" on the left; the organizer gets a General / Organizer selector in the trip selector's style; everyone else sees General only.
- **Organizer → Delete Trip:** simple confirm (Cancel / Delete). Deletes the trip, its members and rounds; players' accounts are never touched. Then goes to `/golf-trips`.
- **Backend:** `delete_golf_trip(p_profile, p_trip)` in `supabase/golf_trips.sql` (organizer only, server-only grant) and `DELETE /api/golf-trips/<id>`. Until the SQL is run, Delete shows "Deleting golf trips isn't switched on yet." The preview never deletes anything.
- **Architecture rule — what deleting a trip may touch:** Deleting a Golf Trip may delete trip-owned organizational data, memberships, scheduled rounds and live event data. It must never delete finalized player historical rounds or finalized player statistics.
  - Today it deletes exactly: the `golf_trips` row, its `golf_trip_members` rows and its `golf_trip_rounds` rows (planned rounds: day, date, typed course name; no scores). Nothing else in the database references golf trips.
  - It never deletes: `profiles` (player accounts), an attached tournament (`golf_trips.tournament_id` points from the trip to the tournament, so the tournament and anything under it stays), or any Maroon/tournament scores, results or history.
  - For future tables: trip-owned planning/live tables may use `golf_trip_id … on delete cascade`. Permanent player-history tables (finalized rounds, stats) must **not** cascade from `golf_trips`, `golf_trip_members` or `golf_trip_rounds`: no foreign key to them, or `on delete set null`, and they keep their own copy of what they need (player profile id, date, course, scores).
  - Separate path, not Delete Trip: `golf_trips.created_by → profiles on delete cascade` means deleting an organizer's **account** deletes the trips they created (and those trips' members and rounds). Still no player history today; revisit before history tables exist.
- **Role rename migration:** the first version of `golf_trips.sql` (commit `a43dc14`) used role `traveler`. The file now renames any `traveler` rows to `member` and swaps the rule/default every time it runs, so the whole file is safe to run on a fresh database, on one that ran an older version, and again later.

### Round: Golf Trip destination (Google Places) + Weather card on Home (spec 2026-10-01; Phase 1 approved, built and verified 2026-10-01; Phase 2 (NWS weather card) approved and built 2026-10-01)

**What it is:** on the questionnaire's first step, the organizer picks the destination from Google Places suggestions, and the trip saves that place's coordinates. Golf Trip Home then uses the saved coordinates to show a live Weather card from the National Weather Service (NWS). This is the only weather plan; it replaces the earlier Open-Meteo plan.

**Who uses it:** the organizer (picking the destination on `/golf-trips/new`); everyone on the trip (seeing the Weather card on `/golf-trips/[tripId]`).

**Source of truth:** `golf_trips` only. `tournaments` and `tournament_editions` are not touched.

**Flow:** Google Places destination → saved `golf_trips` latitude/longitude → NWS weather service → normalized `WeatherData` → Weather card on Golf Trip Home.

**Provider rule:** Google-specific code lives only in `lib/platform/location/providers/googlePlaces.ts`; NWS-specific code lives only in `lib/platform/weather/providers/nws.ts`. Everything else uses our own types (`PlaceSuggestion`, `PlaceLocation`, `WeatherData`), so either provider can be swapped later without touching pages or components. The browser never calls Google or NWS directly.

#### Phase 1 — Location foundation (build and check this first; no weather code until it works)

**Database (in `supabase/golf_trips.sql`, additive, safe to re-run):**
```sql
alter table public.golf_trips
  add column if not exists latitude  double precision check (latitude  between -90  and 90),
  add column if not exists longitude double precision check (longitude between -180 and 180),
  add column if not exists external_place_id text check (external_place_id is null or length(external_place_id) <= 300);
alter table public.golf_trips drop constraint if exists golf_trips_coordinates_pair;
alter table public.golf_trips add constraint golf_trips_coordinates_pair
  check ((latitude is null) = (longitude is null));   -- both coordinates or neither
```
- `destination` stays as it is: still required, and still the text shown everywhere.
- All three new columns are optional. A trip typed by hand (no suggestion picked, or Google unavailable) still saves, just without coordinates.
- `create_golf_trip` (same file, `create or replace`) also writes `latitude`, `longitude`, `external_place_id` from its input when present.
- Reads need no SQL change: `get_golf_trip` already returns every `golf_trips` column.
- No timezone column (NWS gives times with their own offset; nothing in this round needs it).
- Not run in production until the owner runs it (like the rest of `golf_trips.sql`).

**Destination search on `/golf-trips/new`:**
- The Destination field becomes a search box. After 3+ letters (short pause between keystrokes), our server asks Google Places (New) Autocomplete and shows up to 5 suggestions under the field.
- Picking one fills the field with the place's name (for example "Pinehurst, NC, USA"). Our server then asks Google Place Details for that place's coordinates, and three hidden answers are kept in the draft: `destinationPlaceId`, `destinationLatitude`, `destinationLongitude`.
- Typing over a picked destination clears those three hidden answers. The organizer can still type a destination without picking one; it saves with no coordinates.
- If Google isn't configured or fails, the field behaves exactly like today's plain text box (no error shown).
- One Google "session token" is shared by the searches and the final pick, so Google bills them as one lookup.
- Server routes: `GET /api/places/autocomplete?q=…&session=…` (suggestions, `app/api/places/autocomplete/route.ts`) and `GET /api/places/details?placeId=…&session=…` (name + coordinates, `app/api/places/details/route.ts`). Both go through `lib/platform/location/locationService.ts`, which is the only code that reads `GOOGLE_PLACES_API_KEY`. The key never reaches the browser. No key → both routes answer "not configured" and the field stays plain text.
- Create: `golfTripPayloadFromBody` checks the three hidden answers (place ID ≤ 300 characters; latitude/longitude real numbers in range; all three or none) and sends them to `create_golf_trip`. Bad or partial values are dropped, never an error.

**Google Places key:** `GOOGLE_PLACES_API_KEY` (server-only, never `NEXT_PUBLIC_`). It needs Google Cloud → APIs & Services → enable **Places API (New)**, billing on, the key restricted to Places API (New), and a daily request cap set as a cost guard. `google-places` in `lib/platform/tripIntegrations.ts` already lists this key, so it shows as "configured" once the key is set.

#### Phase 2 — Weather card (only after Phase 1 works)

**Weather layer (`lib/platform/weather/`):**
- `types.ts`: our `WeatherData` = `temperature`, `temperatureUnit` ("F"/"C"), `condition`, `high`, `low`, `precipitationChance`, `windSpeed`, `windDirection`, `updatedAt` (each may be `null` except unit and `updatedAt`), plus the result shape `{ status: "ok", weather } | { status: "no-location" } | { status: "unavailable" }`.
- `weatherService.ts`: `getTripWeather(latitude, longitude)`. Returns `no-location` when coordinates are missing; otherwise it asks the provider. Any error, timeout or unexpected reply → `unavailable`. It never throws.
- `providers/nws.ts`: the only file that knows NWS.
  1. `GET https://api.weather.gov/points/{lat},{lng}` (coordinates rounded to 4 decimals, NWS's own limit).
  2. From that reply, use `properties.forecast` and `properties.forecastHourly` as given (never building the grid URL ourselves).
  3. Current temperature, condition, wind and rain chance come from the first hourly period. High and low come from the daily forecast: the next daytime period's temperature is the high, the next night period's is the low.
  4. Every reply is checked before use; missing fields become `null`.
  - Every request sends `User-Agent: The Maroon App (<NWS_CONTACT>)` and `Accept: application/geo+json`, with a 5-second timeout.
  - NWS covers the US only. Outside the US, `/points` answers 404 and the card shows "Weather unavailable".

**Cache (exact strategy):**
- Uses Next.js's built-in server fetch cache, the same way `app/api/instagram-reels/route.ts` already does. Each NWS request is saved once on the server under its exact URL and shared by every visitor and every trip at that location.
- `/points/{lat},{lng}`: kept 24 hours (`next: { revalidate: 86400 }`). The forecast grid for a spot almost never changes.
- `forecast` and `forecastHourly`: kept 30 minutes (`next: { revalidate: 1800 }`).
- Because the URL contains the rounded coordinates, the cache is per location: 50 people opening the same trip in 30 minutes cause at most one NWS forecast request. After 30 minutes, the next visitor gets the saved copy immediately while a fresh one is fetched in the background.
- Failed replies (anything but 200) are not cached (Next.js 16.3.5 only stores status-200 fetch replies), so a short NWS outage doesn't stick for 30 minutes.
- No database table and no weather history are stored.

**Weather card on Golf Trip Home (`/golf-trips/[tripId]` only):**
- The page (server) loads the trip with `getGolfTrip`, calls `getTripWeather(trip.latitude, trip.longitude)`, and passes the result into `GolfTripHome` as an optional `weather` prop. The weather call is wrapped so a failure can never stop the page from loading.
- One **Weather** card, placed right after the Travel card, using the existing `Card` / `Empty` look. It shows:
  ```
  WEATHER
  Pinehurst, NC          ← the trip's destination text
  72°
  Partly Cloudy
  High 78° · Low 61°
  Rain 20%
  Wind SW 8 mph
  ```
  Lines with no data are left out.
- No coordinates → "Weather unavailable". NWS error or timeout → "Forecast temporarily unavailable".
- The `/dev/tournament` preview and the old `/golf-trips/trip` draft page pass no `weather`, so they show no Weather card.

**Env vars (`.env.example`):** `GOOGLE_PLACES_API_KEY` (Phase 1, uncommented with setup notes). `NWS_CONTACT` (Phase 2, a website or email NWS can reach us at, for the User-Agent; if blank, the User-Agent is just "The Maroon App"). The unused `WEATHER_API_KEY` placeholder is removed.

**Files:**
- Phase 1, new: `lib/platform/location/types.ts`, `lib/platform/location/locationService.ts`, `lib/platform/location/providers/googlePlaces.ts`, `lib/platform/location/googlePlaces.test.ts`, `components/platform/DestinationSearch.tsx`, `app/api/places/autocomplete/route.ts`, `app/api/places/details/route.ts`
- Phase 1, changed: `supabase/golf_trips.sql`, `lib/platform/golfTripCreate.ts` (+ `.test.ts`), `app/golf-trips/new/page.tsx`, `components/platform/CreateTournament.module.css` (suggestion list), `lib/platform/tripIntegrations.ts` (weather entry → NWS, no key), `.env.example`; `scripts/test-golf-trip-create-browser.mjs` only if the new field breaks it
- Phase 2, new: `lib/platform/weather/types.ts`, `lib/platform/weather/weatherService.ts`, `lib/platform/weather/providers/nws.ts`, `lib/platform/weather/nws.test.ts`
- Phase 2, changed: `app/golf-trips/[tripId]/page.tsx`, `components/platform/GolfTripHome.tsx`, `components/platform/GolfTripHome.module.css`

**Not in this round:** course-specific weather, weather alerts, notifications, historical weather, Google Weather, a Weather tab, storing weather in the database, a timezone column, editing the destination after creation, adding coordinates to existing trips (they show "Weather unavailable"), any Home redesign.

**Done means:**
- Phase 1: picking a suggestion and creating the trip saves destination, latitude, longitude and place ID. Typing by hand, or no Google key, still creates the trip with them empty. Create tests (valid, partial, out-of-range, missing) pass.
- Phase 2: Golf Trip Home shows the card for a trip with coordinates, "Weather unavailable" without them, and "Forecast temporarily unavailable" when NWS fails, with no page error in any case. NWS parsing tests (good reply, missing fields, 404, timeout) pass.
- Both: `npm test`, type-check and lint pass; checked on phone and desktop width.

### Round: Desktop path back to Golf Trips (owner request 2026-10-01, built)

- **My Trips (`/golf-trips`) is the standard re-entry point** for saved trips: phones reach it from the Golf Trips bottom tab.
- **Desktop saved-trip pages provide a direct path back to Golf Trips:** at 1024px and wider (where the bottom tabs are hidden), `/golf-trips/<id>` shows a small "← Golf Trips" link above the trip name. Below 1024px it is hidden and the bottom tab is the way back. The `/dev/tournament` preview shows it too; the old draft view `/golf-trips/trip` does not.
- No other change to Golf Trip Home's design, trip loading, settings or delete.

### Round: Golf tab — Leaderboard / Match / Overview slides (owner request 2026-10-01, approved and built)

**What it is:** the Golf tab on Golf Trip Home gets a Sleeper-style sub-menu: a row of 3 pills — **Leaderboard · Match · Overview** — under the main Home/Golf/Venue/Info tabs. Tapping a pill (or swiping left/right on a phone) slides to that page.

**Who uses it:** everyone on the trip, on `/golf-trips/[tripId]` and the `/dev/tournament` preview.

**This round is look only:**
- Leaderboard opens first.
- Each slide shows one card with its title and "Coming soon".
- Same dark maroon + cream look as the rest of Golf Trip Home.
- No new data, no Supabase, no scoring.

**Files:** `components/platform/GolfTripHome.tsx`, `components/platform/GolfTripHome.module.css`.

**Not in this round:** real leaderboard, match or overview content; any change to the Home, Venue or Info tabs.

**Done means:** on the Golf tab, the 3 pills show, tapping each one slides to its page, swiping works on phone, Leaderboard is selected first; checked on phone and desktop width; type-check and lint pass.

### Round: Golf tab — Match slide, Sleeper look (owner request 2026-10-01, approved and built)

- The Match slide copies the layout of Sleeper's fantasy Match screen, translated to golf, on the Golf Trip Home maroon.
- **Top card:** two teams (initials circle, win % bar, team points, name, handle, record), maroon logo in the middle; a strip with avg score and fairways hit %; holes left per side and one dot per round (current round highlighted).
- **Lineup:** "‹ Round 2 ›" switcher (look only), then one row per match: golfer vs golfer, score to par each, a colored M1/M2/… badge in the middle, "HCP · Thru" and tee time + course under each name.
- No chat drawer (the trip header already has chat).
- **Made-up data, `/dev/tournament` only** (`lib/platform/golfTripPreviewFixture.ts`, passed as a new `previewMatch` prop). Saved trips (`/golf-trips/[tripId]`) and `/golf-trips/trip` keep "Coming soon" on Match.
- Files: `components/platform/GolfTripMatch.tsx` + `.module.css` (new), `GolfTripHome.tsx`, `golfTripPreviewFixture.ts`, `app/dev/tournament/page.tsx`.

### Round: Golf tab — Leaderboard slide (owner request 2026-10-01, built)

- Same as the Match slide (same top card, holes left + round dots, "Lineup ‹ Round 2 ›"), but each row is **one golfer**: colored position badge (1, 2, T3…), golfer name / HCP · Thru / tee time + course, score on the right. 8 rows (double Match's 4).
- Made-up data, `/dev/tournament` only (`leaderboard` in `GOLF_MATCH_PREVIEW`); saved trips keep "Coming soon".

### Round: Golf tab layout change (owner request 2026-10-01, built)

- Golf tab order is now: holes left + round dots → team matchup card → **Leaderboard · Match · Overview** tabs (same words-and-underline style as Home · Golf · Venue · Info, replacing the pills) → that slide's "Lineup ‹ Round 2 ›" + rows.
- The dots row and team card are shared above the tabs, so they stay put while the slides below change (Overview shows them too).
- Leaderboard position boxes: small (30px) cream boxes with maroon numbers.
- (follow-up) "holes left" text removed everywhere; the round dots show on Match and Overview only, not Leaderboard.
- (follow-up) The round dots are now small cream ovals tucked just under the team card (Match and Overview, not Leaderboard). The current one widens to read "Match 2"; no glow. They take no space, so the card and the Leaderboard · Match · Overview tabs sit in exactly the same spot on every slide.
- (follow-up) Leaderboard has a header row with a line under it: **PLAYER** (over the names), then **TOT** (whole-trip score), **THRU** (holes played this round) and **TDY** (this round's score), each over its own column. "Thru" was taken out of the name line since it has its own column now. Made-up totals added to the preview data; the two golfers who haven't started are now ranked 7 and 8 by total.
- (follow-up) Leaderboard: "‹ Round 2 ›" removed (Match keeps it). Non-handicap events: nothing in that spot. Handicap events: a small **GROSS / NET** switch there. NET shows net TOT and TDY, re-ranks by net total, and adds an **HCP** column left of TOT (so "HCP 6" leaves the line under the name). Preview data is a handicap event (`handicap: true`) with made-up net scores.

### Round: Golf Trip Info — Travel: Flights, manual entry (spec 2026-10-01, approved 2026-10-01)

**What it is:** each traveler types in their own flights for a Golf Trip (getting there, heading home, and any connections). Saved per trip and per traveler. All manual: no flight API, no lookup, no live status, no booking links. The table already has empty columns for a future flight-data provider, so adding one later doesn't change the screens.

**Who uses it:** any signed-in member of the trip, for their own flights only. Nobody else sees them in this round (not even the organizer), because confirmation numbers are personal. Sharing arrival times with the group is a later round.

**Where it shows (keeps the current Golf Trip navigation and look):**
- **Info tab:** the **Flights** card takes the **Savings** card's slot (first card in the swipeable row, same white-card style; owner decision 2026-10-01):
  - title "Flights"
  - the next flight, e.g. "AA 1234 · DFW → RDU", with its departure date/time
  - a small note under it, e.g. "2 getting there · 1 heading home", or "Add your flights" when none are saved
  - tapping it opens the Flights page
- **Flights page** `/golf-trips/<id>/flights` (same pattern as Trip Settings: back arrow, small title, maroon page): this is the travel summary plus the editor.
  - Two groups: **Getting There** and **Heading Home**. Each flight is a card: airline + flight number, DEP → ARR airport codes, departure and arrival date/time, confirmation number and notes if set, and **Edit** / **Delete**.
  - Connections are just more flights in the same group, listed in departure order.
  - **Add flight** opens a short form: Getting There / Heading Home, Airline, Flight number, From (airport code), To (airport code), Departure date + time, Arrival date + time, Confirmation number (optional), Notes (optional). Save / Cancel. Edit uses the same form.
- The `/dev/tournament` preview shows the Flights card with made-up flights (no saving).

**Rules (checked in the browser for the Save button, and again on the server and in the database):**
- Airline: 1–60 characters. Flight number: letters/digits, 1–8 characters, saved in capitals (e.g. "AA1234").
- Airports: 3-letter airport codes (DFW, RDU), saved in capitals, and From ≠ To.
- Times are the **local times printed on the ticket** at each airport. They're saved without a timezone (a westbound flight can "land before it leaves"), so arrival isn't required to be after departure. No timezone automation.
- Confirmation number: up to 12 letters/digits. Notes: up to 500 characters.
- Up to 20 flights per traveler per trip.

**Database (`supabase/golf_trip_flights.sql`, new, additive, safe to re-run; prerequisite `golf_trips.sql`):**
```sql
create table if not exists public.golf_trip_flights (
  id uuid primary key default gen_random_uuid(),
  golf_trip_id uuid not null references public.golf_trips(id) on delete cascade,
  member_id uuid not null references public.golf_trip_members(id) on delete cascade,  -- whose flight
  direction text not null check (direction in ('arrival', 'return')),                   -- Getting There / Heading Home
  airline text not null check (length(trim(airline)) between 1 and 60),
  flight_number text not null check (flight_number ~ '^[A-Z0-9]{1,8}$'),
  departure_airport text not null check (departure_airport ~ '^[A-Z]{3}$'),
  arrival_airport text not null check (arrival_airport ~ '^[A-Z]{3}$'),
  departure_local timestamp not null,   -- local wall-clock time at the departure airport
  arrival_local timestamp not null,     -- local wall-clock time at the arrival airport
  confirmation_number text check (confirmation_number ~ '^[A-Z0-9]{1,12}$'),
  notes text check (length(notes) <= 500),
  -- Reserved for a future flight-data provider. Always empty / 'manual' in this round.
  source text not null default 'manual' check (source in ('manual', 'provider')),
  provider text,
  provider_flight_id text,
  live_status text,
  departure_terminal text, departure_gate text,
  arrival_terminal text, arrival_gate text,
  estimated_departure timestamptz,
  estimated_arrival timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (departure_airport <> arrival_airport)
);
create index if not exists golf_trip_flights_member_idx on public.golf_trip_flights (member_id, departure_local);
```
- Belongs to a trip **member** (`golf_trip_members.id`), not straight to an account, so a traveler who hasn't signed up yet can have flights added later. Removing a member or deleting the trip removes their flights (trip-owned data, per the Golf Trip deletion rule).
- Same safety pattern as `golf_trips.sql`: RLS on, a member can read only their own rows, no direct writes. All writes go through three server-only functions called with the signed-in user's id:
  - `list_my_golf_trip_flights(p_profile, p_trip)`: your flights on this trip (null if you aren't a member).
  - `save_golf_trip_flight(p_profile, p_trip, p_flight jsonb)`: adds a flight, or updates one when `p_flight.id` is one of yours. Re-checks every rule and the 20-flight limit. Never touches the reserved provider columns.
  - `delete_golf_trip_flight(p_profile, p_flight)`: yours only; returns false otherwise.
- Future provider: it fills `provider`, `provider_flight_id`, status, terminals, gates, estimates and `last_synced_at`, and sets `source = 'provider'`. The flight card just shows the extra fields when they exist; the form and the manual fields stay the same.

**Server routes:** `POST /api/golf-trips/<id>/flights` (add or edit) and `DELETE /api/golf-trips/<id>/flights/<flightId>`. Signed-in members only; a stranger gets the same "not found" as a missing trip.

**Files:**
- New:
  - `supabase/golf_trip_flights.sql`
  - `lib/platform/golfTripFlights.ts` (types, checks, row parsing, grouping, "next flight" summary)
  - `lib/platform/golfTripFlights.test.ts` (rules + the SQL in the practice database)
  - `app/api/golf-trips/[tripId]/flights/route.ts`
  - `app/api/golf-trips/[tripId]/flights/[flightId]/route.ts`
  - `app/golf-trips/[tripId]/flights/page.tsx`
  - `components/platform/GolfTripFlights.tsx` + `GolfTripFlights.module.css`
- Changed:
  - `lib/platform/golfTripsServer.ts` (load my flights)
  - `app/golf-trips/[tripId]/page.tsx` (pass the flight summary and the Flights link)
  - `components/platform/GolfTripHome.tsx` + `GolfTripHome.module.css` (Flights card in the Info card row)
  - `lib/platform/golfTripPreviewFixture.ts` (made-up flights for the preview)
  - `scripts/fake-supabase.mjs` (load the new SQL file for browser tests)

**Not in this round:** any flight API or lookup, live status, booking links, airline/airport search lists, seeing other travelers' flights, organizer editing someone else's flights, timezone handling, changes to the Home tab's Travel/Transportation cards, lodging or rental cars.

**Done means:**
- A member can add, edit and delete their own flights (getting there, heading home, connections). They're still there after a refresh, and nobody else can see or change them.
- The Info tab's Flights card shows the next flight and the counts, or "Add your flights".
- Database tests cover: own-only reads, stranger blocked, bad codes/lengths refused, 20-flight limit, provider columns untouched, deleted trip removes flights.
- TypeScript, lint and tests pass; checked on phone and desktop width.

### Round: Settings → Sign Out (owner request 2026-10-02, built)

- The settings gear on Profile (and Settings in the account menu) opens `/settings`, which used to be "Coming soon".
- `/settings` now has an **Account** card: "Signed in as <email>" and a **Sign Out** button. It opens the existing "Are you sure?" popup (`SignOutConfirmDialog`, same as the account menu); Sign Out ends the session and goes to the home page.
- Signed-out visitors see "You're not signed in." and a **Log In** button instead.
- Files: `app/settings/page.tsx`, `components/settings/SignOutButton.tsx` (new). No other settings yet.

### Round: Golf Trips page — money-app dashboard look (owner request 2026-10-02, built)

Replaces the photo drop-down panel from earlier the same day. Modeled on the owner's money-app screenshot, in maroon instead of pink:
- **Maroon band** at the top (radial maroon gradient) with the title **Your Next Golf Trip / Just Got Better** (Spectral, centered). No top bar on phones; wide screens (1024px+, no bottom menu) keep the menu and account buttons see-through over the band.
- **Create a Golf Trip** is the big white card overlapping the band's bottom edge: small label "Plan something new", big "Create a Golf Trip", the course photo where the reference has its chart, then a "Start planning ›" row. The whole card is the link (sign-in prompt if signed out).
- **Join a Trip** is its own white card under it (stacked, no sliding).
- **Upcoming** and **Past Trips** replace the reference's account lists: small caps heading, then a white card of rows (rounded-square icon, trip name with destination · players · role, short dates on the right, ›). Empty: "No upcoming trip yet — Start +" (opens Create) / "No past trips yet". Signed out: one "Log in to see your trips — Log in ›" row.
- Light page background (#f3f0eb), white cards with soft shadows.
- Files: `app/golf-trips/page.tsx`, `app/golf-trips/page.module.css` (Join a Trip keeps using its classes), `components/nav/SiteChrome.tsx`.

### Round: Golf Trip Info — My Info, group travel, joining, organizer assignments, self-building Itinerary (spec 2026-10-05, approved 2026-10-05; Step 1 built 2026-10-05)

**What it does / who uses it.** Trip members (players) and the trip organizer, on the Golf Trip's **Info** tab.
- **My Info** (Info → My Info): each player enters their own travel — flights, rental car / ride (driving, from where, seats), lodging, other bookings. Everything they add (or join, or get assigned) builds **their Itinerary** automatically, which also feeds the Home "what's next" cards.
- **Group travel** (inside My Info): see what everyone else is doing — who's on which flight (public info only: airline, flight number, route, departure/arrival times, terminal/gate when known; never confirmation numbers), who has a rental car or is driving, from where, and how many seats are open; who's staying where.
- **Joining:** whoever creates a ride (or other shareable plan) either **invites** people or leaves it **open to join**. Others tap **Request to join**; the **creator** accepts or declines. Accepted → it lands on the joiner's itinerary and a seat is used. Flights: **"I'm on this flight too"** links you to that flight (copies it to your info, shows you on it).
- **Organizer assignments:** the organizer creates an item (e.g. a dinner reservation found on Venue, a tee time) and a **Who's going?** pop-up (avatar + name for each player, plus "All players") assigns it. It appears on each chosen player's itinerary. Players can **opt out** of an organizer assignment ("Can't make it") — **except tee times**, which can't be opted out of.
- **Notifications:** join requests, accept / decline, and new assignments go to the bell's notification list.

**Decisions (owner, 2026-10-05):** creator approves joins (invite or open-to-join); others see public flight info only; opt-out allowed except tee times; Who's going shows avatar + name; requests and assignments notify; **build in dev first**.

**Tech / data (this round: dev only, no database).**
- Next.js / React / TypeScript, same as the rest of the Golf Trip. No new third-party services (Venue keeps its existing map).
- Data lives in a dev-only, in-memory **trip travel store** for the mock trip (mock players with avatars, flights, rides, lodging, reservations), shared across Home, Info and Venue while the page is open; resets on reload. Only the **Mock golf trip data** source has it — real trips and the Maroon data are unchanged.
- Models (in `lib/platform/`), shaped so they can become database tables later:
  - `TripMember` — id, name, avatar initials/color, role (organizer | player).
  - `TravelItem` — id, kind (flight | ride | lodging | dining | teeTime | other), title, details (public fields only), startsAt / endsAt (local trip time), place, createdBy, source (mine | organizer), joinPolicy (invite | open | none), seats (rides), optOutAllowed (false for tee times).
  - `TravelParticipant` — itemId, memberId, status (going | requested | invited | declined | optedOut).
  - `TripNotification` — id, to, kind (joinRequest | requestAccepted | requestDeclined | assigned | invited), itemId, from, createdAt, read.
- **Itinerary = derived**, never stored: for a member, every item where they're `going`, sorted by time (existing `golfTripItinerary` helpers).
- Pure logic (who's going, seats left, can join, can opt out, notifications to send) in plain functions with tests, separate from the screens.

**Screens / flows (dev preview, Golf Trip Active pages).**
1. **Info → My Info:** "My travel" (my items, Add button: Flight / Ride / Lodging / Other) and "The group" (everyone's flights, rides with seats open, lodging), each row with Request to join / I'm on this flight too where allowed.
2. **Add / edit item sheets** (reuse the existing action-sheet look): flight, ride (driving or rental, from, seats, invite people or open to join), lodging, other.
3. **Requests:** creator sees pending requests on the item (Accept / Decline); requester sees "Requested".
4. **Organizer:** "Add to itinerary" on Venue places / Info, then **Who's going?** (avatar + name list, All players); assigned players see it with **Can't make it** (hidden for tee times).
5. **Notifications** (bell): request / accept / decline / assigned / invited, tap to open the item.
6. **Itinerary + Home cards** come from the store, so adding, joining or being assigned immediately shows there.
7. A dev simulator condition to **view as** a mock player or the organizer, to test both sides.

**Built in steps (each one shippable and tested):**
- **Step 1:** store + models + My Info "My travel" with add / edit / delete; Itinerary and Home cards build from it.
- **Step 2:** "The group" view (public info only, seats left) + view-as simulator condition.
- **Step 3:** joining — rides (invite / open, request, accept / decline, seats) and "I'm on this flight too".
- **Step 4:** organizer assignments — Who's going? pop-up, opt-out (not for tee times), from Venue and Info.
- **Step 5:** notifications in the bell.
- **Later (separate spec):** real database tables + security rules, real-trip data, production SQL.

**Not in this round:** saving to the database, real trips, live flight status or lookups, booking links, payments / splitting costs, chat about items, email or push notifications.

**Done means (per step):** the flow works end to end in the dev preview as the organizer and as at least two mock players; logic has unit tests (join rules, seats, opt-out incl. tee-time lock, itinerary order, notifications); TypeScript, lint and tests pass; checked at phone width in the /dev simulator.

### Round: Golf course architecture cleanup — OpenGolf API as the one source of course data (spec 2026-10-06, awaiting approval)

**What it does / who uses it.** No new screens. Players and organizers using Explore → Courses, Trip Schedule, Competition, Itinerary and GPS get course info from one place (the OpenGolf API), and a round remembers *which* course by the API's id instead of a typed name.

**What exists today (traced 2026-10-06).**
1. **OpenGolf API** (`lib/platform/golfGps/providers/openGolf/`) — search (`/api/courses/search`) and course detail. Already cached by Next's server fetch cache.
2. **Maroon GPS course store** (`golf_courses` + child tables, `supabase/golf_course_data.sql`, run in the .env Supabase) — a saved copy of OpenGolf scorecard + OpenStreetMap shapes + Maroon-derived green targets. Today it is used for GPS **and** as a *first* source for course info: `/api/courses/<ref>` reads name / place / tees from it before OpenGolf. That is the duplicate source of truth.
3. **Legacy tournament Course Library** (`live_courses`, `course_library_*.sql`, Admin Center → Course Library, CSV import) — 29 files: live scoring, broadcast, handicap tracker, career stats, archived scorecards, wagers. Hand-entered rating / slope / hole pars / stroke index for The Maroon Tournament (production data). **No golf trip feature uses it.**
4. **Platform `edition_courses`** (Create Tournament / dashboard, typed courses) — not a golf trip feature either.
5. **Golf trip rounds** — `golf_trip_rounds.course_name` is free text from the creation questionnaire; the Trip Schedule picker (dev preview) keeps the picked course only in page memory; Competition / Itinerary / Games / Match read plain `course` name strings from preview fixtures.

**Changes (proposed).**
- **A. Course info = API only.** `/api/courses/<ref>` always builds name / place / par / tee sets from OpenGolf detail. The GPS store is asked only "is GPS ready for this ref / can it be prepared?". Remove the "library first" display branch in `coursePreview.ts` (+ its tests).
- **B. GPS store = GPS cache keyed by the OpenGolf ref.** One id everywhere: GPS opens with `GET /api/courses/<ref>/gps` (cache lookup by `open_golf` external id; no provider calls). Remove `/api/courses/library/<id>/gps` and stop sending `maroonCourseId` to the browser. Tables / functions unchanged (no SQL); internal names stay.
- **C. Rounds carry the API reference.** One shared round-course model in `lib/platform/`: `course: { ref, name, place, par } | null` (name/place = display label saved at pick time so the schedule still shows if the API is down — the ref is the truth) + Maroon-only settings `{ tees, teeTime, handicap }`. Trip Schedule's picker (UI unchanged) saves into it; Competition, Itinerary, Games and Match read the course name from the round instead of their own strings.
- **D. Database (owner runs, not run by Claude):** new `supabase/golf_trip_round_course.sql` adding `course_ref`, `tee_name`, `tee_time`, `handicap` to `golf_trip_rounds` (keeps `course_name` as the label).
- **Kept as-is:** OpenGolf + OpenStreetMap clients and their caches; GPS store + Prepare GPS (7-day retry, dedupe); the course picker UI; Explore UI; legacy tournament Course Library (3) and `edition_courses` (4) unless the owner says otherwise.

**Done means:** no screen reads course name / tees from the GPS store; GPS opens by ref; every golf trip round view reads its course from the round model; obsolete route / branch / tests removed; `tsc`, lint and unit tests pass; Explore → Courses, Trip Schedule picker and GPS checked in the dev simulator.

### Round: Organizer settings → History, first version (owner request 2026-10-06, built in dev preview)

**What it does / who uses it.** Any trip organizer can enter past trips (not only The Maroon): Organizer settings → **History** → Past Champions + Past Trips → a trip's **Leaderboard / Rounds / Players**.
- Add past trip: year, name, where, players (this trip's players, or add them by hand).
- Rounds: course from the course search (the API's `ref` is saved) or typed by name + par when the search can't find it; date played; each player's round total (18–200).
- Leaderboard is built from the totals (lowest total wins, T for ties; players missing a round listed after with "—"). Champion = outright leader, or the organizer's pick (ties, other formats).
- Data: dev only, page memory (`lib/platform/golfTripHistory.ts`, tested), one sample trip; resets on reload. No database yet.
- Not yet: hole-by-hole scorecards, spreadsheet import, team / match formats, saving to the database, showing History to players, moving The Maroon's existing archive into it.

### Round: Player rounds — one saved round per account, shown on the trip and the profile (spec 2026-10-06, approved 2026-10-06; Step 1 built 2026-10-06 — dev preview)

**What it does / who uses it.** Every player (account) gets one golf record, like a handicap app. A round played on a trip (later: a tournament, or logged in the handicap tracker) is saved **once, to the player's account**; the trip, its leaderboard, the player's **Profile → Rounds** and their handicap all read that same saved round.

**Owner decisions (2026-10-06):**
1. **Handicap:** a round counts automatically when it qualifies: 9 or 18 holes, an individual own-ball format, and a tee box with a known rating + slope. Scramble / alternate shot, or no rating, = listed as "not counted".
2. **Accounts required:** everyone needs an account to play, join a trip or play in a tournament. Every saved round belongs to an account (no guest rounds).
3. **History (past trips):** players stay typed names inside the trip. The organizer can later **link a name to an account**.
4. **Linking needs the player's OK:** the player gets a notification request ("Desert Classic wants to add 2 past rounds to your profile") → Accept (rounds appear) / Decline (nothing changes). Linked past rounds show as "Entered by organizer" and **don't count** toward handicap.
5. **Privacy:** Settings (the Profile gear → `/settings`) gets a **Privacy** card with **Public / Private** (new accounts start Private). Public: any signed-in user sees your Rounds + handicap. Private: only you see your Rounds, but people on the same trip / tournament still see your handicap index (games need it for strokes). Trip rounds always stay visible on the trip to its members.

**Data model — `PlayerRound` (one per account per round played):**
- `id`, `profileId` (owner), `source`: `trip` | `tournament` | `personal` | `history`, plus the source link (`tripId` + `tripRoundId`, or `historyTripId`).
- `datePlayed`, `course` { `ref` (course API id, null for a typed course), `name`, `place` } — the ref is the truth, name/place are the label saved at play time.
- `tee` { `name`, `rating`, `slope` } — a snapshot when submitted (null when the API has none), so a later course change never changes a past round.
- `holesPlayed` (9 | 18), `format`, `holes[]` { `number`, `par`, `strokes`, `putts`, `fairway`, `green` } (History rounds may have only a `total`), `total`.
- `countsForHandicap` + `differential` (computed when saved, from the rules in decision 1), `enteredBy`: `player` | `organizer`, `status`: `submitted` (locked).
- **Link requests** — `HistoryLinkRequest` { `historyTripId`, `playerName`, `profileId`, `status`: pending | accepted | declined }.
- **Privacy** — `roundsVisibility`: `public` | `private` per account.
- Handicap index = the existing WHS engine (`lib/handicap/whs.ts`) over the account's counting rounds.
- The existing handicap-tracker rounds (`handicap_rounds`, keyed by Maroon player slug) and Maroon archived scorecards keep showing in Profile → Rounds as they do now; moving them into `PlayerRound` is a later, separate step.

**Flows.**
- Trip → Scoring → **Submit & Save** → saves my `PlayerRound` (source trip) → trip leaderboard + Profile → Rounds + handicap update if it counts.
- Organizer settings → History → a past trip → Players → **Link to account** (pick an account) → pending request → the player's notifications → Accept / Decline.
- Settings → Privacy → Public / Private → changes what other people see on my profile.

**Built in steps.**
- **Step 1 (dev preview, no database):** an in-memory player-rounds store with mock accounts, shared across the dev trip and a dev profile; Trip Submit & Save writes to it; a dev Profile → Rounds + handicap read from it; Settings Privacy switch; History Link to account + Accept / Decline in notifications; a simulator "view as" mock account to test both sides. Pure logic (qualifies-for-handicap, differential, visibility, link requests) in plain tested functions.
- Step 1 notes: 9-hole rounds are saved but not counted until Step 2; link requests show in a Requests card on `/dev/profile` (no notification inbox yet). Try it: simulator → Golf Trip Active / Profile groups, "Signed in as …" conditions.
- **Step 2 (real database, separate approval):** a SQL file the owner runs (tables + security rules: owner-only writes, visibility rules above) and the server code to save / load.

**Not in this round:** moving old handicap / Maroon rounds into the new model, tournament (Maroon) live scoring writing player rounds, players editing their own submitted round (they never can; mistakes and discrepancies are fixed by the organizer override in the add-on below), guest players, posting to an official handicap service (GHIN).

**Done means (Step 1):** submitting a dev trip round shows it on the trip and in that mock account's Rounds; the handicap counts only qualifying rounds; Private hides Rounds from another mock account but not the handicap index for a trip-mate; a History link shows as a request and only Accept adds the rounds (marked "Entered by organizer", not counted); logic has unit tests; TypeScript, lint and tests pass; checked at localhost:3001/dev.

#### Add-on: Player & Attest, groups, round privacy, organizer overrides, live rounds, trip stats, submit animation (spec 2026-10-06, approved 2026-10-06; Step 1 built 2026-10-06 — dev preview, not committed)

Builds **on top of** the Player rounds plan above. Nothing above changes: `PlayerRound` stays the one locked, saved round per account, and everything still reads from it. This add-on covers how a round gets checked before it becomes a `PlayerRound`, and what happens after.

**Owner decisions (2026-10-06):**
1. **Player & Attest rule.** Every player keeps their own score and stats. One other player in the group is assigned to keep that same player's strokes (the attester). The player's strokes and the attester's strokes must match on every hole.
2. **Attesters are picked automatically** when a group's round is created: 2 players = 1 ↔ 2; 3 players = circle (1 attests 2, 2 attests 3, 3 attests 1); 4 players = two pairs (1 ↔ 2, 3 ↔ 4); 5 players = circle. In a competitive group (two sides, e.g. a fourball), each player is paired with someone on the other side, never a teammate. The organizer (or, for a personal round, whoever started it) can swap attesters until cards are submitted.
3. **Solo personal rounds** save normally, with no attester and no label.
4. **Only the player enters their stats** (putts, fairway, green, penalties). The attester enters strokes only.
5. **Matching unlocks Submit.** When the player's own strokes and what their attester entered for them match on all 18 holes: the player's name and total on the Card turn green, and **Submit & Save** lights up. Only the player presses it; the attester doesn't have to. The column a player keeps for someone else shows green / red but never blocks their own Submit (owner decision 2026-10-06).
6. **Submit & Save does two things:** (a) plays the full-screen submit animation; (b) saves the round as the player's `PlayerRound` (source trip / tournament / personal), which the trip or tournament leaderboard, stats and the player's profile all read.
7. **Submitted = locked.** Only the organizer can change it afterwards (decision 9).
8. **Players who can't agree:** the card simply can't be submitted.
9. **Organizer override (trips and tournaments, same rules).** The trip organizer (who is playing) or tournament organizer (who isn't) can change any hole on a submitted round in their event. A reason is required; every change goes in a permanent change log (old value, new value, who, when, reason). The player sees an "Edited by organizer" mark on that hole and can tap it to read the reason. The trip organizer may also change their **own** round, but those changes show in a log everyone on the trip can see. No override on personal rounds (no organizer).
10. **Push-through setting.** A new organizer setting, **Allow push-through**, off by default (trip Organizer settings; same setting for tournaments). When on, the organizer sees **Push through** on a card that can't be submitted, picks which score counts on each mismatched hole (player's or attester's) with a reason, and the card submits. Logged and marked like an override. Not available on personal rounds.
11. **Personal-round privacy.** Each personal ("just playing") round is **Public** or **Private**, chosen when the round is started; it starts matching the player's Privacy setting (decision 5 above). Others see a submitted personal round only when the profile is Public **and** that round is Public. You always see all your own rounds. While a personal round is being played, its group can see each other's cards (needed to attest). Trip and tournament rounds ignore this switch.
12. **Live rounds.** A trip round opens automatically on its scheduled date; the organizer can also tap **Start round** early or **End round** when everyone's done. The Scoring sheet only shows while a round is open (already built in the dev preview). Cards still in progress can be finished and submitted after the round ends.
13. **Groups for trips (for now).** Trips don't have groups yet, so each trip round's groups are made automatically from the trip's players, in order, in fours. A proper "set groups and tee times" organizer screen is a later round.
14. **Organizer-fixed rounds still count.** A round changed by an organizer override or push-through counts toward handicap like any other round (when it qualifies under decision 1 above).
15. **Players can remove a round from their own profile.** Removing it permanently takes it off that player's profile, stats and handicap (it no longer counts); it cannot be undone. Before removing, the player must confirm a warning that says exactly that: all of this round's data will be lost from their profile. The round stays on the trip (or tournament) and its leaderboard and stats.
16. **Submit animation (full screen, about 2–3 seconds).** After **Submit Score** in the "Are you sure?" box, a maroon screen fills the phone with the final score big (e.g. "78 · +6"), a checkmark and "Card submitted", then slides away to the locked Card.

**Data added (all new; nothing in `PlayerRound` is renamed or removed):**
- **`RoundGroup`**: the players playing one round together. `id`, `source` + source link (same as `PlayerRound`: trip + trip round, tournament round, or none for personal), `course` + `datePlayed` snapshot, `players[]` { `profileId`, `attesterProfileId` (null when solo) }, `startedBy`, `visibility` (personal only: public | private).
- **`LiveCard`**: one per player per group while the round is being played; becomes that player's `PlayerRound` on submit. `groupId`, `profileId`, `holes[]` { `number`, `strokes`, `putts`, `fairway`, `green`, `penalties` { `fairway`, `green` }, `attestStrokes` (written by the attester's phone) }.
- **`PlayerRound` gains:** `groupId` (null for History rounds), `holes[].penalties`, `visibility` (personal rounds only), `removedFromProfile` (decision 15), and `edits[]`, the change log { `hole`, `field`, `from`, `to`, `byProfileId`, `at`, `reason`, `kind`: override | pushThrough }.
- **Trip round state:** `open` / `closed` + `openedAt` / `closedAt` on the trip round, opened automatically on the play date or by the organizer.
- **Organizer setting:** `allowPushThrough` (trip; same for tournaments later), default off.

**Who can do what (enforced by the database in Step 2, not just the screen):** write your own `LiveCard` holes only while it's in progress and the round is open; write `attestStrokes` only on the card you're assigned to attest; submit only your own card, and the database re-checks 18 holes filled and matching before saving the `PlayerRound`; override / push-through only by that event's organizer; trip leaderboard + trip stats readable by the trip's members; personal rounds per decision 11; nothing for signed-out visitors.

**What shows where:**
- **Trip → Golf tab:** the leaderboard updates live from in-progress cards, shows F when finished and is official once submitted; tapping a player shows their card with any "Edited by organizer" marks; **Trip stats** (new): per-player totals across the trip's rounds (scoring average, putts, fairways %, greens %) plus a trip-wide row.
- **Tournament:** the same, once platform tournaments write `PlayerRound`s. The Maroon keeps its current live scoring (unchanged, as above).
- **Profile:** Rounds and Stats read `PlayerRound`, labeled Golf Trip · name, Tournament · name, or Just Playing; a round the player removed (decision 15) no longer shows there.

**Built in steps (same two-step pattern as above):**
- **Step 1 add-on (dev preview, no database):** groups + automatic attesters (pure, tested function); the second phone built in code (what a player enters for the person they attest is written onto that person's card as `attestStrokes`, and a card reads its attester's real entries, falling back to the simulator's stand-in until there are any; real two-phone testing comes later); green name/total + Submit lighting up on a full match; the submit animation; saving to the existing dev player-rounds store; trip stats from it; Start / End round; organizer override / push-through with the change log and marks.
- **Step 2 (real database, separate approval):** the add-on's tables and rules join the Step 2 SQL file the owner runs, plus the server code. Never run by Claude.

**Not in this add-on:** a no-animation mode (all animations stay for now; that mode is built at the end), the "set groups and tee times" organizer screen, the screens for starting a personal round (the data is ready for it), The Maroon writing `PlayerRound`s, notifications for overrides.

**Done means (Step 1 add-on):** in the dev simulator, a trip group gets the right attesters for 2 / 3 / 4 players and for competitive groups; a full match turns the name and total green and lights Submit; a mismatch never does; Submit plays the animation and the round appears on the trip leaderboard, trip stats and the dev profile; an organizer override and a push-through show in the log with the mark on the hole; the organizer's own edits show in the trip-visible log; logic has unit tests; TypeScript, lint and tests pass; checked at localhost:3001/dev.

### Round: Golf Trip Home — the "Mom" section (spec 2026-10-06, approved; round 1 built locally — flight check-in + countdown)

**What it really is (owner, 2026-10-06).** The Mom section is the app's **notifications, shown live in the app** — a built-in notification "toast" with personality. Tone (owner, updated): **simple and friendly** — short, clear, helpful; not jokey.
- **One message at a time**, in our white/cream text, **up to two lines** (owner, updated). A notification may add a **small button** under it (e.g. **Check in**).
- **The Mom box** is a fixed space on Home: everything between the heading/weather and the top of the white box below, edge to edge. Its content (message or countdown) is always **centered horizontally and vertically**.
- **Buckets:** each kind of notification (e.g. flight check-in) has a bucket of approved lines; the app **randomly picks one line** from the bucket each time it shows it. Not every line has to get used.
- **No Mom advice active → a countdown** in the same spot, styled like the owner's flip-clock reference: four tiles in a row — **Days · Hours · Minutes · Seconds** — each a big two-digit number in its own tile (split down the middle like a flip clock) with the label under it, ticking every second. Our colors: dark maroon tiles, cream numbers, gold labels. It counts down to **7:00 AM on arrival day**; once the itinerary has anything on arrival day, it counts down to **the first item on arrival day** instead. When several are active, they rotate every **10 seconds**: the current one **fades out over 500 ms**, then the next **fades in over 500 ms**. One notification → no rotation.

**What it does / who uses it.** On the trip's Home tab, a small section sits in the gap under "Your trip to · City, ST" (+ dates and weather) and above the Live / Upcoming boxes. It shows friendly, helpful nudges ("Mom" advice) that change with what's happening on the trip — e.g. a flight tomorrow: "Don't forget to check in for your flight!" with a button straight to the airline's check-in. Every player sees the tips that apply to *their own* plans.

**Rules (owner's).**
- **Every message is written in the code and approved by the owner.** Nothing is generated, pulled from the internet or written by AI at runtime. Adding / changing a tip = a code change the owner signs off on.
- **Each tip has a condition** (when it shows) and can have **one button** (a link out, e.g. the airline's check-in page). Links only go to an approved list of official sites.
- **It's a living list:** new tips get added over time, one at a time, each approved first.

**How it's built (simple).**
- `lib/platform/momTips.ts` — the approved tip list. Each tip: `id`, the message text, an optional button (label + approved link), and a plain rule for when it shows, written against the trip data we already have (itinerary items, trip dates, "now"). One function `momTipsFor(trip, now)` returns the tips to show, most urgent first.
- `momTips.test.ts` — a test per tip: shows when it should, hidden when it shouldn't.
- Home shows the active notifications as a rotating stack (10 s each, 500 ms fade out then 500 ms fade in), styled to match the maroon header.
- Preview only for now: same dev trip data as the Itinerary; nothing saved; no notifications / texts / emails.

**First tip, for approval (only this one is built in round 1):**
1. **Flight check-in** — shows from 24 hours before a flight departs until it departs. **Approved bucket (owner, 2026-10-06), one picked at random:** *"Don't forget to check in for your flight to {airport}."* · *"Time to check in for {airline} {flight #}. It leaves at {time}."* Small **Check in** button at the end of the line. Push (later round): *"Check-in opens in 5 minutes."* Button: **Check in** → the airline's official check-in page, only for airlines on the approved list (American, Delta, United, Southwest to start — exact URLs verified before building). Unknown airline → the tip shows with no button.

2. **Next-round reminder (fallback)** — when there's no notification and no countdown (the trip is under way), the Mom box shows *"Next up is {course}"* with a sub heading *"{format} · Round {n} · {tee time}"* (format when known; tee time only if one is assigned to me). Nothing when no rounds are left. Approved by the owner 2026-10-06.

**Ideas for later (not built until approved one by one):** pack your clubs / sunscreen the night before; tee time in the morning → "Early night!"; rental car return today; weather (rain / heat) on a golf day; "Hydrate" on hot golf days.

**Push notifications (later round, same approved list).** The Mom tips double as push notifications: each tip can also have an approved **notification** — its own short, fun line and an exact send time worked out from the trip data. Same rules: written in code, owner-approved, one test each. First one planned: **24 hours 5 minutes before a flight** → *"5 min to check-in time! ✈️"* (exact wording to be approved). Building it needs the real push setup (permission prompt, device tokens, a scheduled sender) — a separate spec + approval before any of that.

**Not in this round:** sending push notifications (planned above), choosing a favorite airline app (deep links into installed apps), anything not on the approved list.

**Done means:** the flight check-in tip shows on Home only inside its 24-hour window, with the right airline's check-in button; tests for the window and the unknown-airline case pass; `tsc`, lint and tests pass; checked at phone width in the dev simulator.

### Round: Player rounds Step 2A — database foundation (spec 2026-10-06, approved and built 2026-10-06; `supabase/player_rounds.sql` not run yet)

**What it does / who uses it.** Signed-in players. This puts the "one saved round per account" model (Step 1, dev preview) into the real database with its security rules, plus a working **Settings → Privacy** switch and a **Rounds** list on the real Profile. Trips and History will save into it in later steps (2B trips, 2C History); nothing in the real app saves a round yet, so the list starts empty for everyone.

**Tech / data.**
- New `supabase/player_rounds.sql` (owner runs it — first in the .env Supabase, production later; Claude never runs SQL). Prerequisite: `schema.sql` (profiles). Not tied to `golf_trips.sql`, so it can run on its own.
- Table `player_rounds`: `id`, `profile_id` (→ profiles, deleted with the account), `source` (trip / tournament / personal / history), `source_key` (e.g. `trip:<trip id>:<round id>`; **unique per account**, so a round can only be saved once), `source_label` (e.g. the trip's name, kept even if the trip is deleted later), `date_played`, `course_ref` / `course_name` / `course_place`, `tee_name` / `tee_rating` / `tee_slope` (snapshot, may be empty), `holes_played` (9 / 18), `format`, `holes` (hole-by-hole list), `total`, `counts_for_handicap`, `not_counted_reason`, `differential`, `entered_by` (player / organizer), `created_at`.
- `profiles.rounds_visibility`: `public` / `private`, default **private**.
- Security: nobody reads or writes the table directly (row security on, no policies). The server calls database functions with the signed-in user's id, like Flights:
  - `save_player_round(profile, round)` — saves if new, otherwise returns the round already saved (locked after submit). It re-checks the rules: total = sum of the holes, a counted round must be the player's own with a rating + slope, and the differential must match the handicap formula.
  - `list_my_player_rounds(profile)` — my rounds, newest first.
  - `set_rounds_visibility(profile, visibility)` / reading it with the profile.
- Server code: `lib/platform/playerRoundsServer.ts` (list mine, save mine, read / set privacy), reusing Step 1's `buildPlayerRound` rules so the app and the database agree. If the SQL hasn't been run yet, pages show the empty state instead of an error.

**Screens.**
- **Settings → Privacy** card under Account: Public / Private with one plain sentence for each (same words as the dev preview). Saves straight away; shows an error if it couldn't save.
- **Profile → Rounds**: a "Golf rounds" list from `player_rounds` (course, date, where it came from, total, counts / not counted + why), shown under the existing handicap view for players who have one, or on its own for everyone else. Empty: "Rounds you play on golf trips will show here."
- The handicap index stays the existing one for now. Adding saved rounds into it comes with Step 2B, the first step that actually saves rounds (until then nobody has any).

**Who can see a profile's rounds:** today only you can open your own profile, so Step 2A stores the Public / Private choice and shows it in Settings. The rule (Public: anyone signed in; Private: only you, plus your handicap index for people you play with) is enforced when pages for viewing other players' profiles are built. The database never hands rounds to anyone else in 2A.

**Not in this step:** trips or History saving rounds, viewing other players' profiles, merging new rounds into the handicap index, moving the old handicap / Maroon rounds over, the 9-hole handicap rule.

**Done means:** the SQL runs cleanly twice in a row on a fresh database (PGlite test, like Flights); tests prove a round saves once, bad rounds are refused, one account can't read or save as another, and privacy defaults to private and can change; Settings → Privacy and Profile → Rounds work against the .env Supabase once the owner runs the SQL (and show the empty state before); TypeScript, lint and tests pass.

### Round: Profile identity foundation (owner request 2026-10-08, built; `supabase/profile_identity.sql` not run yet)

**Rule:** ACCOUNT (Supabase auth) = login only. PROFILE = the golfer and the source of truth for the person. Golf / product records point at the profile (`profile_id`), never at email, username, display name, `player_slug` or a team. Teams belong to a context (an edition roster, a trip), never to a profile.

- **profile_id = `profiles.id`.** It is already permanent and is both the primary key and a foreign key to `auth.users(id)`, so one account has exactly one profile, and "which profile does this account control?" is `profiles.id = auth.uid()`. No second id was added.
- `supabase/profile_identity.sql` (owner runs; checks existing data first and stops with a message if anything breaks the rules):
  - Unique `profiles.player_slug` and unique `player_slots.claimed_by`, so the legacy Maroon link is one-to-one.
  - Unique (`tournament_id`, `profile_id`) on `tournament_players` for linked players.
  - Column comments documenting the rule.
- Server helper `lib/profile/currentProfile.ts` (`getCurrentProfile()` → signed-out / no-profile / ok + `ProfileIdentity`) and `lib/profile/profileIdentity.ts` (`ProfileId`, `legacyMaroonPlayerSlug` marked as legacy compatibility). New code uses `profile.profileId`; Profile, Settings → Privacy and player rounds already do.
- Player rounds already reference `profiles(id)` (`player_rounds.profile_id`); only the wording changed from "account" to "profile".
- Not enforced in the database: that every account HAS a profile (signup creates both and removes the account if the profile insert fails). Dev database check 2026-10-08: 16 accounts, 14 profiles, 2 accounts with no profile (left alone; owner decides).
- Not in this step: profile UI redesign, public profiles, Maroon U, migrating Maroon history, refactoring older code that passes `user.id` (same value as `profile_id`) or reads `player_slug`.

### Round: Golf Trip membership identity (owner request 2026-10-08, built; `supabase/golf_trip_invitations.sql` not run yet)

**Rule:** profile → `golf_trip_members` → `golf_trip`. A member row is one profile's participation in one trip. Once it has a `profile_id`, that is the golfer; name / email on the row are only the invitation and a name snapshot.

- **Invitations (new):** the organizer invites a name + optional email. That creates the member row now (`profile_id` NULL, `pending`, `invite_token_hash`, `invited_by`). The invite link carries a random secret, and only its SHA-256 hash is stored. A signed-in golfer who opens the link and accepts gets their profile attached to that same row (`accepted`, `claimed_at`). The email is never used to find an account, and replies are the same either way, so there is no account enumeration.
- **SQL `supabase/golf_trip_invitations.sql`** (owner runs; checks existing data first):
  - Unique rules: one organizer row per trip, an email invited once per trip, one row per invite secret.
  - Trigger: a claimed row can't move to another profile.
  - Functions: `invite_golf_trip_member`, `get_golf_trip_invitation`, `accept_golf_trip_invitation` (safe to repeat), `remove_golf_trip_member` (organizer; cancels invites), `leave_golf_trip` (members).
- **Server / routes:** `lib/platform/golfTripsServer.ts` (now via `getCurrentProfile()`), `lib/platform/golfTripInvitations.ts`.
  - `POST /api/golf-trips/<id>/members`
  - `DELETE /api/golf-trips/<id>/members/<memberId>`
  - `POST /api/golf-trips/<id>/leave`
  - `GET` and `POST /api/golf-trips/invitations/<secret>`
  - Create / delete / flights routes now use the profile too.
- **Not built:** screens for inviting, the invite-link page, Accept / Decline buttons, Leave / Remove buttons, trip teams.
- **Teams (planned, not built):** a trip competition table plus a per-competition participant table (member → team / sitting out). Never `team_id` on `golf_trip_members`, never on profiles.
