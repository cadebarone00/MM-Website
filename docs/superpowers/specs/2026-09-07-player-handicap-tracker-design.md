# Player Handicap Tracker — Design Spec

## Goal

Let a player log a personal (non-tournament) round of golf from their own `/portal`,
have the app compute a real USGA World Handicap System (WHS) index from it, and
archive the round's hole-by-hole detail for future predictions work. This is
unrelated to tournament live scoring — it's a GHIN-style "Post Score" feature for
rounds players play on their own.

## Background

- `/portal`'s "Submit a score" action card (`app/portal/page.tsx:68`) currently
  links to `/portal/scoring`, which is the tournament live-scoring status screen
  (`app/portal/scoring/page.tsx` → `ScoringStatusScreen`). Tournament scoring stays
  reachable through "Open live scoring" in the My Match section
  (`app/portal/page.tsx:57`, links straight to `/portal/scoring/play`), so
  repointing the "Submit a score" card doesn't remove any tournament capability.
- The old MM-Scorekeeper app (a separate Python/Neon backend being bridged into
  this repo per `docs/superpowers/specs/2026-08-27-scorekeeper-portal-merge-design.md`)
  already has a `non_tournament_rounds` table and `SubmitScoreForm`/`SubmitScoreView`
  components, but they only store course name + rating/slope + front/back-nine
  totals — no handicap math anywhere, and nothing in this repo calls that backend
  yet (only Phase 1/auth-foundation of that merge has shipped). This feature does
  **not** use that path — see "Architecture" below.
- This repo's Tiger Center already has a real course library with named tee sets:
  `live_courses` (`id, name, holes, rating, slope, tee_sets`), typed as
  `LiveCourse`/`LiveTeeSet` in `lib/live/types.ts` (`LiveTeeSet`: `id, name, holes
  (18× {number, par, yards}), rating, slope`). This was built one day before this
  spec (`course library` commits `cb98c56`/`505eced`) via a **standalone migration
  file**, `supabase/course_library_tee_setups.sql`, that adds the `tee_sets` jsonb
  column — it is **not yet folded into `supabase/schema.sql`**. This repo has hit
  this exact gap before (the Courses & Format phase's migration was only partially
  run in production — see the `tiger-center-build-phasing` memory) so **the first
  implementation task must confirm `tee_sets` actually exists in production**
  before anything here is built on top of it, exactly like that prior incident.
- `app/portal/page.tsx:44` currently hardcodes the portal hero's "Handicap" display
  to `0.0` — a placeholder with nowhere real to read from yet.

## Architecture

Fully native to this repo's existing Supabase/Next.js stack — no dependency on the
separate Python/Neon backend:

- New tables `handicap_rounds` / `handicap_round_holes` (below), written via
  Route Handlers under `app/api/portal/handicap/**` that resolve identity with
  the existing `requirePlayer()` guard (`lib/portal/requirePlayer.ts`) — the same
  pattern `app/api/portal/score/submit-hole/route.ts` already uses. Writes use the
  service-role client (`createSupabaseServiceRoleClient`), matching every other
  Tiger Center write path.
- Course/tee-set selection reads the *existing* `live_courses` table — this
  feature adds no new course data model, it only reads what the Tiger Center
  course library already maintains. A new read-only, player-gated endpoint
  (`GET /api/portal/handicap/courses`) is added rather than reusing
  `/api/portal/tiger/courses` (that route is host-gated via `requireHost()`,
  wrong namespace/audience for a player-facing read).
- The WHS math lives in a pure, dependency-free TypeScript module,
  `lib/handicap/whs.ts` — no I/O, fully unit-testable, computed fresh on every
  read (no cached/stored index column to invalidate).

## Data model

```sql
-- One row per submitted personal round.
create table if not exists handicap_rounds (
  id uuid primary key default gen_random_uuid(),
  player_slug text not null references player_slots(player_slug),
  course_id uuid not null references live_courses(id),
  tee_set_id text not null,
  tee_set_name text not null,       -- snapshot: course tee sets can be renamed/edited later
  rating numeric not null,          -- snapshot from the tee set at submit time
  slope integer not null check (slope between 55 and 155),
  date_played date not null,
  tee_time time,
  total_score integer not null,
  differential numeric not null,    -- (total_score - rating) * 113 / slope, rounded to 1 decimal
  created_at timestamptz not null default now()
);
create index if not exists handicap_rounds_player_idx on handicap_rounds (player_slug, date_played desc);

-- One row per hole, mirroring archived_scorecard_holes' shape/conventions.
create table if not exists handicap_round_holes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references handicap_rounds(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  par integer not null,
  yards integer not null,
  score integer not null,
  putts integer not null,
  fir text not null check (fir in ('0', '1', 'X')),  -- 'X' = par 3, FIR not applicable
  gir boolean not null,
  unique (round_id, hole)
);
```

RLS: both tables follow the `live_hole_scores` pattern — readable/writable only
through server-side Route Handlers using the service-role key; a player can only
ever act as their own `player_slug` (resolved server-side by `requirePlayer()`,
never client-supplied), and Tiger (`requireHost()`) can read across all players
for future predictions/admin use. No public read access — this is private
player data, unlike the public tournament leaderboard tables.

**Snapshotting rating/slope/tee-set-name onto the round** (rather than joining
`live_courses` live at read time) means a later edit to a course's tee sets never
silently changes a past round's already-computed differential — matching the
same reasoning `live_round_state.course_setup` already uses for tournament rounds.

## Handicap calculation — `lib/handicap/whs.ts`

- **Differential** = `((totalScore - rating) * 113 / slope)` rounded to 1 decimal.
  No Playing Conditions Calculation (PCC) adjustment (see Out of scope).
- **Handicap Index** = average of the best differentials from the player's most
  recent ≤20 rounds (by `date_played`), per the official WHS "rounds used" table:

  | Rounds | Differentials averaged | Adjustment |
  |---|---|---|
  | 1 | lowest 1 | −2.0 |
  | 2 | lowest 1 | −1.0 |
  | 3 | lowest 1 | 0 |
  | 4 | lowest 1 | +1.0 |
  | 5 | lowest 1 | +2.0 |
  | 6 | lowest 2 | −1.0 |
  | 7–8 | lowest 2 | 0 |
  | 9–11 | lowest 3 | 0 |
  | 12–14 | lowest 4 | 0 |
  | 15–16 | lowest 5 | 0 |
  | 17–18 | lowest 6 | 0 |
  | 19 | lowest 7 | 0 |
  | 20 | lowest 8 | 0 |

  Result rounded to 1 decimal. Zero rounds → index is `null` ("No index yet").
- **Low Index** (display only) = the lowest Handicap Index value that would have
  been computed at any point across the player's round history (i.e., replay the
  Handicap Index calculation as of each round in order, take the minimum). This is
  a simplified "lowest we've ever seen," **not** WHS's official 365-day rolling
  low used for soft/hard caps.
- Exported functions: `calculateDifferential(totalScore, rating, slope): number`,
  `calculateHandicapIndex(differentials: number[]): number | null` (input newest
  ≤20 first or any order — function sorts internally), `calculateLowIndex(roundsChronological): number | null`.

## Flow / UX

1. **`/portal` "Submit a score" card** (`app/portal/page.tsx:68`) — `href` changes
   from `/portal/scoring` to `/portal/scoring` unchanged as a URL, but that route's
   page content is replaced (see next point). No change to the My Match section's
   "Open live scoring" link.
2. **`/portal/scoring` becomes "My Handicap"** — replaces `ScoringStatusScreen`
   entirely (tournament status is no longer reachable from this URL). Shows:
   - A hero card (background image, matching the GHIN-app reference screenshots)
     with the player's current **Handicap Index** and **Low Index**.
   - A **"Submit a score"** button, starting the round-entry flow below.
   - A list of past rounds beneath: course name, tee set, rating/slope, total
     score, differential, date — newest first, reading straight from
     `handicap_rounds`.
3. **Round setup** (new screen/step) — pick a course from the Tiger Center
   library (`GET /api/portal/handicap/courses`), then a tee set within it (which
   supplies rating/slope/18-hole par+yardage), then date played and tee time.
4. **Hole-by-hole entry, holes 1–18** — one hole at a time or a scroll list (reuse
   the interaction pattern of `ScoreEntryCard.tsx`: score, putts, FIR checkbox
   hidden/disabled on the tee set's par-3 holes, GIR checkbox), solo — no
   partner/opponent concept, unlike tournament scoring.
5. **Review Round** — all 18 holes shown read-only for a final check (score,
   putts, FIR, GIR per hole, running total), then **Submit**.
6. **On submit** (`POST /api/portal/handicap/rounds`) — validates all 18 holes are
   present, computes the differential, inserts `handicap_rounds` +
   `handicap_round_holes` in one transaction-like sequence (round row first, then
   holes; if holes fail, delete the round row), and returns the recomputed index.
   The player lands back on "My Handicap" with the new number and round visible.
7. **Portal hero wiring** — `app/portal/page.tsx:44`'s hardcoded `0.0` is replaced
   with the same `calculateHandicapIndex` result (or "—" when null), computed from
   that player's `handicap_rounds`.

## API surface

- `GET /api/portal/handicap/courses` — player-gated (`requirePlayer`), read-only
  list of `{ id, name, teeSets: [{ id, name, rating, slope, holes }] }` from
  `live_courses`.
- `GET /api/portal/handicap/rounds` — player-gated, returns the caller's own
  `handicap_rounds` (+ computed index/low index), newest first.
- `POST /api/portal/handicap/rounds` — player-gated, body: `{ courseId, teeSetId,
  datePlayed, teeTime, holes: [{ hole, score, putts, fir, gir }] × 18 }`. Server
  looks up the course's tee set server-side for rating/slope/par (never trusts
  client-supplied rating/slope/par), computes the differential, and inserts both
  tables.

## Error handling

- Course/tee-set not found, or fewer/more than 18 holes submitted → `400` with a
  clear message, nothing written.
- Any hole missing a score → `400`, review screen highlights it (mirrors
  `ScoreEntryCard`'s existing per-hole error pattern).
- `handicap_round_holes` insert fails after the `handicap_rounds` row was created
  → delete the orphaned round row and return `500`, so a player never sees a
  round with missing holes in their history.
- No Supabase session / not a linked player → `401`, same as every other portal
  Route Handler.

## Testing

- `node:test` for `lib/handicap/whs.ts`: differential math at known reference
  values, and the rounds-used table at every count 1–20 (and 20+ truncating to
  the most recent 20).
- `node:test` for the Route Handlers: identity resolution/401s, request-shape
  validation (400s), successful insert + index recompute, the orphaned-round
  cleanup path.
- Manual walkthrough: log a full 18-hole round end-to-end in a dev browser,
  confirm the round appears in history with the right differential and the
  portal hero's Handicap updates.
- Standing gate: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
  all clean before calling any task done.

## Out of scope for this round

- Playing Conditions Calculation (PCC) and WHS's official soft-cap/hard-cap rules
  that limit how fast a real GHIN index can rise year over year. This computes a
  faithful average-of-best-differentials index, not a bit-for-bit GHIN clone.
- Any predictions feature itself — this only produces the archived data
  (`handicap_rounds`/`handicap_round_holes`) that a future predictions effort
  would read from.
- Adding new courses/tee sets from this flow — a player can only pick from what
  Tiger has already added via `/portal/admin/course-library`. If their course
  isn't there yet, they ask Tiger to add it first.
- HCP Calculator / HCP Lookup tools shown in the GHIN reference screenshots —
  only "Post Score" (submit + view own history) is being built.
- Editing or deleting a previously submitted round.

## What "done" looks like

A player taps "Submit a score" on `/portal`, lands on "My Handicap" showing their
current index (or "No index yet"), submits a full 18-hole round against a real
Tiger Center course/tee set, reviews it, and submits. The round and its 18 holes
are archived in Supabase, their Handicap Index recomputes correctly per the WHS
table above, and the portal hero's Handicap display reflects the same number.
`npm test` / `tsc` / `lint` / `build` all pass.
