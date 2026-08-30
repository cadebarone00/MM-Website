# Tiger Center: Scorecards & Video — Design Spec

## Goal

A new Tiger Center screen, **"Scorecards & Video,"** where Tiger can open any
player's scorecard for any played year, correct any hole's score/putts/
fairway/green directly, and attach a shot video to any hole's shot — with
those corrections and videos immediately visible to fans and players on the
public site (the same scorecard view that already exists on a player's bio
page).

## Background

This is a **separate, new piece** from the two other in-flight scoring
efforts in this codebase, which this spec deliberately does not touch:

- `docs/superpowers/specs/2026-08-29-tiger-center-operations-design.md`'s
  **"Edit Scores — the official review"** section is about officially
  reviewing and settling a *live, in-progress* tournament's match results
  (points, wager payouts) once players submit their own scores.
- `docs/superpowers/plans/2026-08-30-tiger-center-player-live-scoring.md`
  (mid-build, `worktree-tiger-center-player-live-scoring` branch) is the
  *live, in-round* screen where players enter each other's scores in real
  time during an active tournament.

**This spec is about the three tournaments that already happened** —
2024 (Pinehurst), 2025 (Danzante), 2026 (Palm Springs) — whose hole-by-hole
scorecards today are hardcoded in `lib/data/scorecards-2025.ts` /
`scorecards-2026.ts` / inline in `lib/data/2024-pinehurst.ts`. Hardcoded
files can't be edited from a live website, so this build's real work is
moving that data into the database and building an editor on top of it —
plus adding shot video, which has never existed anywhere in this codebase
before (today's `ShotVideoPanel` is a placeholder with no upload path).

Confirmed with the user (2026-08-30): all three played years become
editable through this tool, this gets its own new Tiger Center button
(not the reserved, differently-scoped "Edit Scores" button), and shot
videos are stored in Supabase Storage — organized in folders mirroring the
user's existing "Maroon Masters" naming convention — rather than on any
individual's personal computer, since a live public website has no way to
reach into one person's desktop.

## Data model additions

New Supabase tables (exact SQL is implementation-plan detail; this spec
fixes the shape). These are intentionally separate from the `live_*` tables
— those belong to the *current/future* tournament's live round cycle and
have no year dimension; these are keyed by the already-existing tournament
`slug` (`"2024-pinehurst"`, `"2025-danzante"`, `"2026-palm-springs"`) since
multiple past years must coexist.

- **`archived_scorecard_rounds`** — `tournament_slug`, `player_slug`
  (canonical slug from `lib/data/players`, not the scorecard file's current
  first-name-only `player` string — the one-time migration script resolves
  that mapping), `round` (int), `course` (text), `format` (text, nullable).
  One row per player per round played.
- **`archived_scorecard_holes`** — `round_id` (references the row above),
  `hole` (1-18), `par`, `yards`, `score`, `putts`, `fir` (`true` / `false` /
  `null` for "not applicable," matching today's `"X"` convention on par-3s),
  `gir`, `host_edited boolean not null default false` (set whenever Tiger
  changes a value here — same convention the live schema's
  `live_hole_scores.host_edited` already established), `updated_at`.
- **`archived_shot_videos`** — `round_id`, `hole`, `shot_number` (1-based,
  matching `ShotVideoPanel`'s existing dot tracker — capped at that hole's
  `score`), `storage_path`, `uploaded_at`. At most one video per shot
  (`unique (round_id, hole, shot_number)`).
- A new **Supabase Storage bucket** (e.g. `shot-videos`), public-read,
  host-only write (via the service-role key, same pattern every write in
  this codebase already follows). Paths follow the folder shape the user
  asked for: `{tournament_slug}/round-{n}/hole-{n}/shot-{n}.mp4` — so the
  bucket is browsable/downloadable by Tiger in the same shape as his
  existing desktop folder, and a full local backup is just downloading that
  bucket's contents whenever he wants (no live sync needed).

## One-time migration

A script copies today's `pastTournaments` scorecard data (all three years)
into `archived_scorecard_rounds`/`archived_scorecard_holes` exactly as-is —
nothing changes value-wise, this just relocates the source of truth. Run
once, verified against the live site (every existing scorecard page should
render identically before and after), then the static files stop being
read for scorecards specifically (see below) — the rest of each
`Tournament` object (matches, venue, roster, notes, individual leaderboard)
stays exactly as it is today, untouched.

## Read-path change (site-wide) — why this is the real work

Every place that currently reads a tournament's `.scorecards` array must
switch to reading the new tables instead, or a Tiger correction would show
on one page and not another:

- `lib/data/index.ts`'s `getPlayerScorecard`/`getRoundScorecard`/
  `getHoleStat` (used by the player scorecard page itself)
- `lib/data/stats/tournamentStats.ts` (one stats calculation reads
  `tournament.scorecards` directly)
- `components/leaderboard/IndividualLeaderboardTable.tsx` (leaderboard
  totals)
- `components/scorecard/LivePlayerScorecard.tsx`

These become `async` calls to Supabase instead of in-memory array lookups
(the same shape change every prior Tiger Center phase's data-access
functions already went through). This is the one part of this build that
needs careful testing — get it wrong and pages could disagree with each
other.

Not affected: anything reading a tournament's *non-scorecard* fields
(matches, venue, standings) — those stay on the static files.

## The Tiger Center screen

**Entry point:** a new box on the Tiger Center landing page, alongside
Players & Teams / Courses & Format / Matchups — call it **"Scorecards &
Video."** Host-only, same gate (`profile.is_host`) every other Tiger Center
screen already uses.

**Navigation**, exactly as described:

1. A year selector, defaulting to the most recent (2026), with the other
   played years available from a dropdown.
2. That year's full player list (every player on that year's roster).
3. Click a player → their rounds for that year, labeled "Round 1 —
   `{course}`," "Round 2 — `{course}`," etc.
4. Click a round → it expands into the *same* scorecard table component
   already used on the public bio page (`CourseInfoHeader`, `ScorecardRow`,
   `MobileScorecardGrid` — reused directly, not rebuilt, so it's pixel-
   identical to what fans already see).
5. Click a hole → beneath it, the same **Score / Fairway / Green / Putts**
   row as `HoleDetailCard` today, with Score added on the left as
   requested — except every value is now interactive.

**Editing a hole's stats:**

- **Score** and **Putts**: tapping either focuses a numeric input — this is
  what brings up the phone's real number keypad; no custom keypad
  component needed.
- **Fairway** and **Green**: tapping either opens a small Hit ✓ / Miss ✕
  choice. Fairway stays non-editable (shows "–", matching today) on a
  par-3, since there's nothing to hit.

**Shot video**, directly below, reusing `ShotVideoPanel`'s existing dot-
per-shot tracker: tapping a shot number that has no video yet opens the
device's native file picker with `accept="video/*" capture` — on a phone
this is exactly "choose from camera roll or record a new one" for free. A
shot that already has a video shows it playable in place, with the option
to replace it.

**Pending changes, Save, and the unsaved-changes guard:** nothing above
writes immediately. Every score/putts/fairway/green edit and every newly
picked video is held as a local pending change (a video is staged as a
file, not yet uploaded) with a visible "unsaved" state. One **Save** button
at the bottom commits everything at once — writes every changed hole field
and uploads every staged video into its storage path in one action.
Leaving the screen (navigating away, closing) with anything pending prompts
**Save & Leave / Leave Without Saving / Cancel**; leaving with nothing
changed does nothing.

## Public-facing consequence

Once saved, the real corrected numbers appear immediately everywhere the
read-path change above wires up (scorecard page, leaderboard, stats). The
bio page's `ShotVideoPanel` — today always showing "Video awaiting
upload" — plays the real video for any shot that has one, and still shows
the awaiting-upload state for shots that don't.

## Out of scope for this spec

- Anything about the *live* round-scoring flow, the competitor-agreement
  indicator, or the official review/settlement screen — those belong to
  the two other efforts named in Background, not this one.
- Editing anything about a tournament besides its scorecards (matches,
  venue, roster, notes stay on the static files, unchanged).
- Any visual design pass beyond matching the existing bio page's look —
  a dedicated `frontend-design` pass can follow once this is built and
  working, matching this codebase's established practice.
- Deleting the old static scorecard files outright — they stay in git
  history as the migration's origin; whether to remove them from the
  active codebase once the database is verified as the source of truth is
  a small follow-up decision at implementation time, not a design question.

## What "done" looks like

Tiger opens "Scorecards & Video," picks any of the three played years,
drills into any player's any round, corrects a score/putts/fairway/green
value or attaches a shot video, hits Save — and that change is immediately
visible on that player's real public bio page, the leaderboard, and stats,
with no way to accidentally lose an edit by navigating away first.
