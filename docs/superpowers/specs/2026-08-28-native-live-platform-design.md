# Native Live Platform — Design Spec

## Goal

Replace the bridge to MM-Scorekeeper's Python/Neon backend (built in Phase 1,
`docs/superpowers/specs/2026-08-27-scorekeeper-portal-merge-design.md`) with a
single, native system: Supabase is the only database, TypeScript is the only
language, and live score entry pushes instant updates everywhere — the public
site, players' own portals, and Tiger's control screen — with no polling and no
second service to run or deploy.

## Background — this supersedes Phase 1's architecture choice

Phase 1 (already shipped, both repos) chose to bridge to MM-Scorekeeper's
existing Python backend rather than rebuild it, on the reasoning that reusing a
working engine was lower-risk than a rewrite. Two things changed that:

- There is no real production data to protect. MM-Scorekeeper's Neon database
  holds only test accounts — the migration-risk argument for keeping it no
  longer applies.
- The actual goal — instant live updates, one clean codebase, "looks the
  best" — is better served by Supabase's built-in Realtime (Postgres change
  feed pushed straight to subscribers) than by polling a separate Python API.
  Keeping Python also means keeping a second deployed service, a second
  language, and the shared-secret bridge Phase 1 built just to let the two
  talk to each other — overhead with nothing to show for it once there's no
  real data forcing a reuse-not-rewrite decision.

Phase 1's Python-specific pieces (`lib/scorekeeper/pythonClient.ts`,
`PYTHON_API_SECRET`, `app/api/portal/profile/route.ts` as it stands today) get
replaced under this spec. Phase 1's login/access-tier pieces
(`lib/portal/requirePlayer.ts`, `lib/portal/requireHost.ts`, the Supabase
`profiles` table, the fork screen) are exactly what this spec's three access
tiers need and stay as-is.

## Naming (binding — use these everywhere going forward)

- **The Website** — the public, signed-in-or-not site: home, leaderboard,
  history, teams, schedule, Wagers, MM Fantasy, merchandise, player pages.
  Every signed-up user gets this.
- **The Player Portal** — the private area only players (accounts with a
  `player_slug`) get, in addition to The Website: their own bio/profile
  editing, stats, scorecard, and live hole-by-hole score entry during a round.
- **The Tiger Center** — the private area only the host (`is_host`) gets,
  *instead of* The Website — no fork screen, straight there on login.
  Tournament control: matchups/pairings, courses, tees, tee times, format,
  round start/reset, direct score edits, timing.

`/portal` (player-or-host landing + fork screen), `/portal/admin` (host area)
already exist as the routes for these — this spec doesn't rename URLs, only
the words used to talk about them. A later, smaller task can rename
`/portal/admin` to `/portal/tiger` if wanted; not decided here.

## Architecture

**One database, one language, no bridge.** Supabase Postgres (the same
project already running Supabase Auth) becomes the single source of truth for
all *live* tournament data: roster, pairings, match/round state, hole-by-hole
scores, player profile fields, course library. MM-Website's own Next.js server
does 100% of the business logic in TypeScript — no second service, no shared
secret, no separate deploy.

**Instant updates via Supabase Realtime.** When a hole score is written (after
both players confirm it — see below), Supabase can push that change instantly
to every open subscription: the public leaderboard, other players' portals,
Tiger Center's live view. No polling loop anywhere in this design.

**Historical years (2024-2026) are untouched.** They stay exactly as they are
today — static `lib/data/*.ts` files, rendered through the existing
`/leaderboard`, `/teams`, `/history` pages and components. Nothing about this
spec changes those files or those pages' code paths for past years.

**The live/current year (2027 onward) is Supabase-backed, permanently.** Once
a tournament happens under this system, its data stays in Supabase forever —
it is never exported back into a static file. `Tournament`/`PlayerScorecard`/
`IndividualStanding` (in `lib/data/types.ts`) already describe almost exactly
the shape MM-Scorekeeper's Python types did (`RealMatch` ≈ its match-box
payload, `PlayerScorecard`/`RoundScorecard`/`HoleStat` ≈ its per-player
summary). The plan is to build a query layer that reads Supabase and produces
these *exact same* existing types — so the current `/leaderboard`, `/teams`,
and scorecard pages render a live year with no changes to their own code, only
a new data source function alongside the existing static-file one.

**Statistics blend both sources automatically.** The existing career "Stats"
tab (`/teams/stats`) already aggregates across the static 2024-2026 files.
That aggregation function gains a second input — the live/Supabase years —
and merges them into one result. No manual step after a tournament ends: the
moment it's marked complete in Tiger Center, its numbers are already part of
everyone's career stats.

**The course library remembers itself.** `VenueCourse`/`CourseHole` (already
in `lib/data/types.ts`) become a real Supabase table instead of a per-year
static list. When Tiger sets up a course for a round in Tiger Center, it's
saved into this shared library — the next time that same course is used
(same year or a future one), it's already there to pick, not re-entered.

### The confirmation flow (the "12 players at once" problem)

A hole score becomes official only after both the entering player and their
round partner have it recorded consistently — this mirrors what MM-Scorekeeper
already did (a scoring session per pairing/slot) and is preserved here as a
real requirement, not simplified away. The exact confirmation mechanics
(who enters first, what "confirmed" looks like in the UI, what happens on a
mismatch) are Phase 2 implementation-plan detail, not this architecture spec —
flagged here so it isn't lost, and picked up when the Player Portal's scoring
screen gets its own plan.

## Business logic ported to TypeScript

MM-Scorekeeper's `backend/maroon_masters/models.py`, `scoring.py`, and
`orchestration.py` (~550 lines total) are the reference — not code to run, but
the exact rules to reimplement:

- **From `scoring.py`:** per-player summary (gross, to-par, putts, FIR/GIR
  counts, birdies/doubles), the leaderboard sort, team point totals.
- **From `orchestration.py`:** match-box validation (right team, right count,
  no double-booking a session), session-complete detection, match state
  (Scheduled → Armed → Live → Final) driven by tee time and holes completed,
  match-play scoring (holes won/lost, closed-out detection), the "Thru N"
  label logic.
- **From `models.py`:** the shape of a hole score, a pairing, a match box, a
  course — become Supabase table schemas instead of Python dataclasses.

This is a straight rules port — the math and state transitions don't change,
only the language and where the data lives.

## What gets retired

- MM-Scorekeeper's Python backend (`backend/`) and its Neon Postgres database
  — no longer deployed or written to. The repo and its git history stay
  intact for reference.
- `appscript/write-scores.gs` and `appscript/live-feed.gs` — no longer called.
  The Google Sheet stops being part of the live system entirely.
- `lib/scorekeeper/client.ts`, `lib/scorekeeper/pythonClient.ts`,
  `PYTHON_API_SECRET`, `SCOREKEEPER_SERVER_SECRET`, `LIVE_FEED_URL` — the
  shared-secret bridges these existed for are gone once there's nothing on
  the other end.
- `app/api/portal/score/round/route.ts`, `app/api/portal/score/submit-hole/route.ts`,
  `app/api/portal/profile/route.ts`, `lib/data/live.ts`,
  `lib/data/liveFeedNormalize.ts`, `/api/live-feed` — replaced by Supabase-native
  equivalents under this spec.
- The `maroon-masters-python-api` and `maroon-masters-scorekeeper` Vercel
  projects can be paused once cutover is verified — not deleted immediately,
  in case anything needs a reference during the transition.

## Rollout

Built and fully tested against the upcoming (2027) tournament before any
cutover — the currently-live public leaderboard (still Sheet-backed until
this ships) is not touched or put at risk during development. Cutover means:
flip the live year's data source from the Sheet/Apps Script path to the new
Supabase-backed one, verified with a real dry run before players use it live
at an actual event.

## Out of scope for this spec

- The exact confirmation-flow UI/UX (see above — Phase 2 detail).
- Screen-by-screen layout of The Website, The Player Portal, or The Tiger
  Center — that's the separate "site plan" document, next.
- Wagers/MM Fantasy's own logic — unaffected by this spec; they already read
  from the live tournament data however it's currently sourced, and will keep
  doing so against the new Supabase-backed source once it exists.
- Video uploads, email templates, course CSV import/export — carried over
  from the original merge spec's feature list, still in scope for *a* future
  phase, just not decided here.

## What "done" looks like

A live tournament runs entirely on Supabase: Tiger sets pairings/courses/tee
times in Tiger Center, players enter and confirm scores in the Player Portal,
and the public Website, the leaderboard, and every player's career stats
update instantly and automatically — with no Python service, no Google Sheet,
and no manual step anywhere in the loop.
