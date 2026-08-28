# Tiger Center Operations — Design Spec

## Goal

Build the Tiger Center as one operator screen with four controls — **Players
& Teams**, **Courses & Format**, **Matchups**, **Edit Scores** — that
together run an entire live tournament end to end: set up rounds, assign
players, start play, collect and confirm scores, and automatically settle
points and wagers. This spec covers the full operational pipeline in one
document because it's genuinely one interconnected system — each piece feeds
the next — but implementation still happens in ordered phases (see the
implementation plan when it's written).

## Background

This builds directly on `docs/superpowers/specs/2026-08-28-native-live-platform-design.md`
(the Supabase/TypeScript foundation, already shipped) and
`docs/superpowers/specs/2026-08-28-site-plan-design.md` (which named these
same four areas at a high level). This spec is the detailed, confirmed
operational design behind that outline, gathered directly from a full
walkthrough of how the tournament actually needs to run.

It also **extends the already-shipped schema** — a few things weren't known
until this conversation:

- **Formats are three, not four.** The shipped `MatchFormat` type/check
  constraint is `'Fourball' | 'Scramble' | 'Alternate Shot' | 'Singles'`.
  Going forward: **Fourball, Foursome, Singles** — three options. "Foursome"
  is the same rule as "Alternate Shot" under a friendlier name; the shipped
  internal value stays `'Alternate Shot'` (no need to touch the already-
  reviewed scoring/orchestration logic), it's just never shown or offered as
  `'Scramble'` anywhere again. The schema's `check` constraint and the
  `MatchFormat` type both need updating to drop `'Scramble'`.
- **Format is set once per round, not per match box.** The shipped
  `live_match_boxes.format` column stays (the orchestration logic already
  reads `matchBox.format` directly, no need to rework that), but it's now
  populated *from* the round's format when a match box is created under
  Matchups — Courses & Format is the one place a human ever picks it.

## Terminology

- **Round** — one day-session slot (e.g. "Day 2 Afternoon"): a date, a
  course, a format. Set up in Courses & Format.
- **Match box** — one specific foursome (2 Maroon vs. 2 White) within a
  round, with a tee time. Set up in Matchups.
- **Locked** (two independent locks) — *Courses & Format locked* means the
  round's date/course/format are final and visible publicly. *Matchups
  locked* means that round's actual player assignments are final and visible
  publicly. A round needs both locks before it can be started.
- **Official** — a match box's result isn't official just because every
  player submitted their scores. It's official only after Tiger reviews and
  submits it in Edit Scores — that's the one moment points and wager
  payouts actually happen.

## Data model additions

New tables/columns beyond what `2026-08-28-native-live-data-foundation`
already shipped (exact SQL is implementation-plan detail, this spec fixes
the shape):

- **`live_tournament_settings`** — one row, holds `round_count` (6-10,
  set once from the Courses & Format dropdown) and a `completed_at`
  timestamp (null until the last round's last match box goes official).
- **`live_roster`** — `player_slug` (references `player_slots`), `team`
  ('maroon' | 'white'). Set from Players & Teams. This is the missing piece
  the shipped `LiveTournamentSnapshot.players` needs a real source for.
- **`live_round_state`** *(extends the shipped table)* — add `date` (the
  round's assigned day), `format` (the round-level format — see
  Terminology), `course_locked boolean`, `matchups_locked boolean`. The
  already-shipped `started`/`course_id` columns are unchanged.
- **`live_match_boxes`** *(extends the shipped table)* — add
  `maroon_points numeric`, `white_points numeric` (null until official —
  this is what the original Python `Pairing` concept tracked and this port
  deliberately hadn't needed yet), `officially_submitted_at timestamptz`
  (null until Tiger's Edit Scores submit — this is the real "is it official"
  flag, distinct from the already-shipped, *computed* `state: 'Final'`,
  which only means "18 holes are scored," not "Tiger has blessed it").
- **`live_match_box_submissions`** — `match_box_id`, `player_slug`,
  `submitted_at`. One row per player once they hit Submit Scores on their
  own round. A match box is "all players submitted" once it has 4 rows
  (Fourball/Foursome) or the right count for the format.

## Players & Teams

Lists every player with a claimed account (from `player_slots`) plus any not
yet invited. Tiger can send a new player an invite (reuses the existing
invite mechanism from account claiming, not a new system). Each player gets
a Maroon/White assignment (writes to `live_roster`). Clicking a player opens
their profile/bio — Tiger edits directly and it saves immediately, no
approval step (this is separate from, and doesn't block, a future
player-facing self-edit-with-approval flow — the two are independent paths
to the same underlying `PlayerProfile` fields).

## Courses & Format

1. A dropdown: **6, 7, 8, 9, or 10** rounds. Choosing a number creates that
   many round slots (writes `live_tournament_settings.round_count`, creates
   the matching `live_round_state` rows).
2. Each empty round slot, when clicked, offers: assign a **course** (pick
   from the saved bank, or **Add Course** — name + full 18-hole par/yardage,
   which saves into `live_courses` and is reusable forever after), a
   **format** (Fourball / Foursome / Singles), and a **date**.
3. **Remove round** — guarded by a confirm dialog, since rounds can already
   have real content attached by the time someone reaches for this.
4. **Lock** — per round. Locked means the date/course/format are final and
   now visible on the Website and Player Portals. Unlockable to fix a
   mistake. A locked round becomes available to build a Matchup on; an
   unlocked one isn't.

## Matchups

For each course-and-format-locked round, assign actual players into match
boxes (2 Maroon + 2 White per box for Fourball/Foursome; Singles pairs
1-vs-1) with tee times, inheriting the round's date/course/format. Its own
**Lock** — locking Matchups is the trigger that makes that round's real
pairings visible on the Website and Player Portals. A round needs *both*
locks (Courses & Format, and Matchups) before it can be started.

## The live round cycle

1. Once a round is fully locked (both locks), a banner appears at the top
   of the Tiger Center — pushing the other three boxes down — showing that
   round with a **Start Round** button.
2. **Start Round**: every player sees a "round has started" screen appear in
   their Player Portal (an in-app banner/full-screen takeover for this
   phase — see "Push notifications" below for what's deferred), with a **Go
   to Scoring** button leading straight into their own scorecard plus
   whoever they're playing alongside, holes 1–18, in one screen.
3. After hole 18, **Submit Scores** — one confirmation warning ("you can't
   edit after this"), then final. This writes a row to
   `live_match_box_submissions` for that player.
4. Once every player in a match box has submitted, that box is ready for
   Tiger's review (see Edit Scores below) — the round itself isn't "done"
   until every box in it is.
5. Once a round's every match box is officially submitted (see below), the
   *next* locked-but-not-yet-started round surfaces the same way, everywhere
   (Tiger Center, Player Portal, Website). If nothing is queued up yet, the
   Website/Portal show whatever the nearest fully-locked-but-unstarted round
   is (e.g. "Mission Hills Pete Dye — Foursome").
6. Once the tournament's *last* round has every match box officially
   submitted, `live_tournament_settings.completed_at` gets set — this is
   what flips the tournament to "complete" everywhere.

## Edit Scores — the official review

Every match box that has player-submitted scores (whether or not all 18
holes are in yet, so Tiger can also catch a live mid-round problem) shows up
here. Tiger can correct any hole's score directly. When Tiger is satisfied,
**Submit** — this is the one moment that:

- Sets `officially_submitted_at` on the match box.
- Computes and writes `maroon_points`/`white_points` (using the already-
  shipped `matchBoxResult` from `lib/live/orchestration.ts` — no new match
  math needed, this just persists its output and marks it final).
- **Automatically settles the matching wager markets.** The existing Wagers
  system keys a match's markets as `match-winner:{tournamentSlug}:{matchId}`
  (`lib/wagers/marketKeys.ts`) and resolves them through the existing
  `settle_mm_coin_market` Supabase function (already live, currently
  triggered manually from `/portal/admin/wagers`). This submit calls that
  same function server-side with the real winner, so Tiger's one action is
  the complete trigger — no separate manual settlement step needed for
  match-winner markets. **Prop markets** (stat-line over/unders) resolve the
  same way in principle, but their exact win-condition evaluation against a
  completed match's real stats needs its own short investigation pass at
  implementation time — flagged here so it isn't assumed solved.
- Tournament-wide futures (Team Winner, Tournament Winner) settle
  separately, at tournament completion, off final standings — not per-match.

**Unsubmit**: if an officially-submitted result turns out wrong, Tiger can
un-submit it from the same screen — clears `officially_submitted_at`,
reverses the points, and reverses any wager payouts already made (the
existing `mm_coin_bets`/`wagers_market_settlements` tables already support
this kind of correction; the exact reversal mechanics are implementation
detail). This path is meant to be rare — the player-submit → Tiger-submit
sequence is the whole point of avoiding needing it.

## Push notifications

Deferred. For this build: the "round has started" moment shows as an
in-app banner/screen in the Player Portal (instant if they already have it
open, thanks to the live foundation already shipped; visible the moment
they next open it otherwise). Real phone-level push notifications (browser
permission prompts, service worker registration) are a separate, later
piece — meaningful added complexity that shouldn't block this from shipping.

## Out of scope for this spec

- Real push notifications (noted above).
- The exact prop-market win-condition evaluation logic (noted above — a
  short investigation, not a design gap).
- Course library management as its own standalone screen — "Add Course"
  living inside Courses & Format is sufficient for this build; a dedicated
  Courses screen (per the site plan's original outline) isn't needed unless
  it turns out Tiger wants to manage the course bank outside the context of
  scheduling a round.
- Any visual design pass — this spec is functional; a `frontend-design` pass
  happens once this is built and working, matching the site plan's stated
  approach.

## What "done" looks like

Tiger opens the Tiger Center, sets up a full tournament's rounds and
matchups from scratch, starts a round, players score live on their phones
with the Website updating in real time, and once Tiger reviews and submits
each result, points move on the leaderboard and wagers pay out automatically
— with an undo available if something needs correcting, and the whole cycle
repeating on its own until the tournament completes.
