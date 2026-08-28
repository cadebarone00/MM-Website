# Scorekeeper Portal Merge — Design Spec

## Goal

Bring everything MM-Scorekeeper (`cadebarone00/MM-Scorekeeper`, a separate, private
repo) built — full player self-service profiles, and Tiger's complete host toolset
(players, pairings, rounds, in-play, score edits, course admin, email templates,
video) — into this repo's `/portal`, so there is exactly **one** login (this site's
existing Supabase account), **one** app, and **one** place players and Tiger ever go.

## Background

- MM-Scorekeeper was a fully separate app this site used to proxy `/portal/*` to.
  That proxy was cut on 2026-08-04 in favor of a bare `/portal` placeholder in this
  repo, which orphaned MM-Scorekeeper's work — nobody noticed it was still there.
- Two days ago, a much smaller scoring feature (hole-by-hole entry, mirrored to the
  live Google Sheet via `appscript/write-scores.gs`) was found on an unmerged branch
  in *this* repo and merged into `/portal`. That work is real and gets reused here
  (see "The Sheet becomes the backup" below) — it is not being thrown away.
- MM-Scorekeeper turns out to be much more complete than that: a full Next.js
  frontend (`app/`, `components/`, `lib/`) plus a separate Python (FastAPI) backend
  (`backend/`) on its own Neon Postgres database, last worked on 2026-07-29.
  Its own login system (host/player JWT tokens) and its Postgres database are
  entirely independent of this site's Supabase accounts and Google Sheet.
- While investigating, 20 commits (a full visual redesign of the player portal —
  hero photos, redesigned login, full-screen My Stats / Submit Score views) were
  found sitting unpushed in a local clone of MM-Scorekeeper. These have since been
  pushed to `origin/master` (`2180333..fca4efa`) and are no longer at risk.
- MM-Scorekeeper's Postgres database holds real data (player accounts, profile
  edits, course setup) that must be preserved, not discarded.

## Architecture

**Bridge, not rewrite.** MM-Scorekeeper's Python backend (`backend/`) keeps running
almost exactly as it does today — same Vercel deployment (`maroon-masters-python-api`),
same Neon Postgres database, same business logic (`scoring.py`, `orchestration.py`,
`models.py`), same real data, untouched. What changes:

- MM-Scorekeeper's **Next.js half** (`app/`, `components/`, `lib/` in that repo) is
  retired. Its React components get ported into this repo's `components/portal/`
  (both apps are already Next.js/React, so this is a port, not a rewrite).
- MM-Scorekeeper's **own login** (`/host-login`, `/player-login`, `/player-signup`,
  `/validate-code`, and the HMAC-token logic in `host_auth.py`/`player_auth.py`) is
  retired from the Python backend and replaced with the same trusted-server-secret
  model already used for the Google Sheet (`SCOREKEEPER_SERVER_SECRET` /
  `appscript/write-scores.gs`'s `checkServerSecret`). A new `PYTHON_API_SECRET`
  plays the same role: every Python endpoint that used to require a host/player
  token instead trusts one shared secret plus a caller-supplied identity, because
  the caller (this site's own server) has already verified that identity via
  Supabase — nothing player-supplied is ever trusted as identity, matching the
  existing `lib/portal/requirePlayer.ts` pattern.
- This repo's Next.js server becomes the **only** client of the Python API.
  Browser → `/portal` (Supabase-authenticated) → this repo's Route Handlers
  (resolve identity server-side, exactly like `requirePlayer.ts` today; a parallel
  `requireHost.ts` covers Tiger) → Python API (`PYTHON_API_SECRET` + resolved
  identity) → Postgres.

### The Sheet becomes the backup

Every score write goes to the Python API first (source of truth). The Next.js
route handling that write *also* fires it at the Google Sheet through the already-
merged `lib/scorekeeper/client.ts` pipeline — fire-and-forget, logged but never
blocking, so a Sheet hiccup can't stop a player from submitting a score. The public
`/leaderboard` is unaffected and keeps reading the Sheet exactly as it does today;
it's a second, independently-readable copy of the same data, not a dependency.

### What gets retired

- MM-Scorekeeper's Next.js app (`app/`, `components/`, `lib/` in that repo) —
  ported, then no longer deployed/used. The repo itself and its git history stay
  intact for reference; no deletion.
- MM-Scorekeeper's own login system (Python `host_auth.py`/`player_auth.py`, the
  `/host-login`, `/player-login`, `/player-signup`, `/validate-code` endpoints),
  along with everything that only exists to support it: the player-code path
  (`/submit-hole-as`), the "Cade master" code-bypass endpoints
  (`/cade-master-player-round`, `/cade-master-submit-hole`), the `/legacy`
  dispatcher, and Python's own `/live-feed` (redundant — the Sheet stays the public
  leaderboard's source, per the architecture above).
- Tasks 5–7 of `docs/superpowers/plans/2026-08-14-live-scoring-platform.md`
  (`/portal/host` pairings/rounds/score-edit tools) are **superseded** by this
  spec — that plan scoped host tools to be built directly against the Sheet with
  no backend; this spec replaces that approach with the Python/Postgres-backed
  version, ported from MM-Scorekeeper. Tasks 1–4 of that plan (already merged) are
  **not** superseded — they become the Sheet-mirroring backup path described above.

## Feature scope (everything, in one spec — phased in the implementation plan)

**Player-facing** (ported from `components/player/*` in MM-Scorekeeper):
- Full profile self-editing — all fields (`MyAccountView`), not just email/phone
- Portal home: hero photo, greeting, action cards, leaderboard strip
  (`PortalHero`, `PortalGreeting`, `PortalActionCard`, `PortalLeaderboardStrip`)
- My Match view, My Stats view (`MyMatchBox`/full view, `MyStatsBox`/full view)
- Score entry / Submit a Score, including non-tournament rounds (`SubmitScoreForm`/
  `SubmitScoreView`, `account-submit-non-tournament-round`)

**Host-facing (Tiger)** (ported from `components/host/*`):
- Players — invite, remove, review/approve profile-edit requests (`PlayersPanel`)
- Pairings (`PairingsPanel`)
- Rounds — start/reset (`RoundsPanel`)
- In-Play live view (`InPlayPanel`)
- Direct score edits / hole overrides (`EditScoresPanel`)
- Course admin — import/export CSV, save course, set round course (`AdminPanel`)
- Email template management, sending invite/host emails (`host-save-email-template`,
  `host-send-email`, `player-invite`)
- Hole video uploads (`HoleVideoPanel`, `upload-video`, `videos`)

Each maps to a thin, authenticated Next.js Route Handler under `app/api/portal/**`
that resolves identity, calls the matching Python endpoint (full inventory: the 36
routes currently under `backend/maroon_masters/api.py`'s `create_app()`), and — for
score-affecting ones — mirrors to the Sheet as described above.

## Data / identity mapping

MM-Scorekeeper's Postgres keys players by **bare first name only**
(`Player(first, last, team, email, phone)`, `player_accounts.player_first`) — not
full name. This repo's Supabase `profiles` table keys by `player_slug`, and
`PlayerProfile.id` (in `lib/data/players/*.ts`) already equals that same first-name
string for every player (verified against MM-Scorekeeper's roster — e.g.
`PlayerProfile.id === "Cade"` for Cade Barone). The Route Handlers are the single
place this mapping happens: resolve Supabase session → `player_slug` → both a full
name (`playerFullName`, for the Google Sheet — see below) and a first name
(`playerFirstName`, for the Python API — must be `PlayerProfile.id`, never a
`fullName.split(" ")[0]` derivation or any other guess) via `requirePlayer.ts`. No
client-supplied name or identity is ever trusted. Sending `playerFullName` to the
Python API is a bug, not a style choice — Python's lazy account provisioning (see
Phase 1's Task 3) means a full name silently creates a bogus `player_accounts` row
instead of erroring, so this distinction matters even though the two backends'
identity models won't be unified in this project.

No data migration is required — the existing Neon Postgres database, and everything
in it, stays exactly where it is; only who's allowed to write to it changes.

## Error handling

- Python API unreachable or errors: Route Handler returns a clear error to the
  player/host; the Sheet mirror is skipped (nothing to mirror if nothing saved).
- Sheet mirror fails after a successful Python write: logged server-side only,
  never surfaced to the player as a failure — the score is already safely saved.
- Identity resolution failure (no Supabase session, no matching player/host
  profile): same `redirect("/login")` / `redirect("/")` pattern `/portal` already
  uses today.

## Testing

- `node:test` coverage for each new Route Handler (mirrors the existing
  `lib/scorekeeper/client.test.mts` pattern): identity resolution, Python API call
  shape, Sheet-mirror fire-and-forget behavior, error paths.
- Python backend: existing `backend/tests/*` coverage stays as the safety net for
  business logic; new/changed tests cover the auth swap (`host_auth.py`/
  `player_auth.py` replaced by shared-secret checks).
- Manual walkthrough checklist (host + player, one full round) before calling any
  phase done, same as the existing live-scoring-platform plan's approach — Apps
  Script/Python changes have no automated end-to-end harness.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` clean in this repo
  before any phase is considered done, per this repo's standing rules.

## Out of scope for this spec

- Any visual redesign pass beyond what's already built in MM-Scorekeeper — ported
  components get adapted to compile and match Tailwind conventions used elsewhere
  in this repo, not re-designed from scratch. A dedicated visual-polish pass can
  follow once everything is functional.
- Decommissioning/deleting the MM-Scorekeeper or `maroon-masters-python-api` Vercel
  projects — they stay deployed as-is (the Python one keeps serving traffic; the
  Next.js one just stops being linked to from anywhere).
- Migrating off Neon Postgres or off Python (that's Approaches B/C from the
  architecture discussion — explicitly not chosen).

## What "done" looks like

A player can log into this site once, land in `/portal`, and do everything
MM-Scorekeeper's player app did. Tiger can log in once and do everything
MM-Scorekeeper's host app did, under `/portal/host`. All of it is backed by the
real Python/Postgres engine with real data intact, mirrored live to the Google
Sheet as a backup, with no second login anywhere in the flow.
