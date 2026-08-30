# Tiger Center: Player Live Scoring — Design Spec

## Goal

Let players actually play and score a round once Tiger starts it: a
"round started" moment in the Player Portal, a scoring screen where each
match box's players enter each other's official strokes and their own
personal stats hole by hole, live updates as it happens, and a final
Submit that locks a player's part. This is the first of three sub-phases
that together implement the "Edit Scores" section of
`docs/superpowers/specs/2026-08-29-tiger-center-operations-design.md`
("The live round cycle" + "Edit Scores"):

1. **Player live scoring** (this spec) — Start Round, the scoring screen,
   who enters what.
2. **Tiger's Edit Scores + settlement** — the official review screen,
   points, automatic wager payout, unsubmit. Builds on this spec's data.
3. **Public cutover** — pointing the live leaderboard/Website at Supabase
   instead of the current Google Sheet/Python-bridge feed.

Splitting was necessary: the ops-design spec's "Edit Scores" section
assumes players already have a way to score, which doesn't exist yet —
building all three at once would be one oversized, hard-to-review plan.
This spec covers only #1.

## Background

Builds on the already-shipped Tiger Center (Players & Teams, Courses &
Format, Matchups — see `docs/superpowers/specs/2026-08-28-native-live-platform-design.md`
and `docs/superpowers/specs/2026-08-29-tiger-center-operations-design.md`)
and the pure business logic already ported to TypeScript
(`lib/live/orchestration.ts`, `lib/live/scoring.ts`, `lib/live/types.ts`).

**Supersedes one detail of the native-live-platform spec.** That spec
described a score becoming official only once a player's *round partner*
confirms it matches (a live, mid-round, cross-device handshake) — this was
explicitly left as a Phase 2 decision, not settled. Confirmed now: there is
no partner-confirmation handshake. Every hole's data has exactly one
writer per field (see "Who writes what" below); mismatches are caught and
corrected by Tiger during Edit Scores (sub-phase 2), not resolved live
between players.

## Terminology addition

- **Scoring opponent** — the specific player responsible for entering
  another player's official stroke count on a hole. Derived from a locked
  match box's existing player-position arrays, not a separately-set field:
  - **Fourball**: `maroonPlayers[0]` and `whitePlayers[0]` score each
    other; `maroonPlayers[1]` and `whitePlayers[1]` score each other. Two
    independent 1v1 scoring relationships live inside one 2v2 box. (Tiger
    already sets this today, without realizing it — the two dropdowns per
    side in the existing Matchups UI are filled in a specific order, and
    that order becomes the pairing. No change needed to the already-shipped
    Matchups screen.)
  - **Singles**: the box's one Maroon and one White player score each
    other — trivially the same rule, box already has exactly one of each.
  - **Foursome**: one combined score per *side* per hole (alternate shot —
    one ball, one score for the pair), not per player. Either player on
    the opposing side may enter that side's shared score for a hole
    (matches the reality that they're a team recording one real-world
    number, not two people who could disagree).

## Who writes what

Every write is a Route Handler call validated server-side against real
Supabase data (`requirePlayer`, then check the requester's `player_slug`
against the locked match box's arrays) — no direct client writes, matching
every prior Tiger Center phase's pattern. Per hole, per player:

| Field | Written by |
|---|---|
| Stroke score | The player's scoring opponent (or opposing side, for Foursome) |
| Putts | The player themselves |
| Fairway hit (FIR) | The player themselves (already null for par-3s — existing `updateScore` behavior) |
| Green hit (GIR) | The player themselves |

This means two different real people write into the conceptual "row" for
one player's one hole — the existing `live_hole_scores` table (`unique
(player_slug, round, hole)`) already supports this as two independent
partial upserts (write score without touching putts/fir/gir, and vice
versa); no schema change needed here.

Foursome's shared per-side score is still stored as a `live_hole_scores`
row for *each* player on that side (both get the identical value) — this
keeps `orchestration.ts`'s existing per-player `readScore` calls working
unchanged for match-play math, while a new exclusion rule (below) keeps it
out of individual stats.

**Submit Scores** (a player's own action, once, after their last hole):
locks both halves of their responsibility — the opponent-scores they
entered for others, and their own self-reported stats — and writes a row
to a new `live_match_box_submissions` table (`match_box_id, player_slug,
submitted_at`), per the ops-design spec. Once every player in a match box
has a submission row, that box is ready for Tiger's review (sub-phase 2).
After submitting, a player can no longer write any of their assigned
fields for that match box — enforced server-side, not just hidden in the
UI.

**Start Round** (Tiger-triggered, from the Tiger Center): available once a
round has *both* locks (Courses & Format, Matchups) and hasn't started
yet. Sets `live_round_state.started = true`. This is the trigger every
player's Portal watches for.

## New/changed logic (not just plumbing)

Two real gaps exist in the already-shipped pure logic, both needed before
a round can actually be played correctly:

1. **Foursome match scoring is currently a stub.** `orchestration.ts`'s
   `holeComplete` and `matchBoxResult` both special-case
   `format === "Foursome"` to return "not complete" / zero points always —
   correct at the time (nothing needed it), but this phase needs the real
   rule: compare the two sides' one shared score per hole, same
   holes-won/holes-lost counting Fourball and Singles already use.
2. **Individual stats need a format exclusion.** `scoring.ts`'s
   `summarizePlayer` currently has no concept of "skip this round" — it
   will happily fold Foursome holes into personal stats unless taught not
   to. Needs a round-format lookup (via `live_round_state`) that excludes
   any round scored under Foursome from the individual leaderboard/stats
   aggregation, while those same holes still count fully toward the team
   match-play result.

## Live updates: Supabase Realtime (new infrastructure)

Chosen over polling because players in the same match box benefit from
seeing each other's entries appear instantly, and it's the natural
foundation for sub-phase 3's public cutover later. This is genuinely new
to the codebase, not a small addition:

- **No browser-side Supabase client exists today** — every screen so far
  (including login) is server-driven, cookie-based sessions and a
  service-role client (`lib/supabase/server.ts`). This phase adds
  `lib/supabase/client.ts`, a `createBrowserClient` (`@supabase/ssr`)
  factory for client components.
- **New public env vars**: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same project/anon key the server
  already uses, just re-exposed under the `NEXT_PUBLIC_` prefix Next.js
  requires to bundle a value into client code). Safe to expose: every
  table this subscribes to already has a public-read RLS policy and *no*
  write policy at all — the anon key cannot write to any of them from the
  browser, only the service-role key (server-only) can.
  **Manual step for the operator**: add both to `.env` (local) and the
  Vercel project's environment variables (production) before this phase
  can work live — flagged here the same way prior phases flagged their
  manual SQL step.
- **What's subscribed**: `live_hole_scores` (filtered to the active round)
  and `live_match_box_submissions`, via Postgres Changes channels. The
  scoring screen's own writes still go through the existing Route Handler
  pattern (validated, server-side) — Realtime is read-only propagation of
  what already landed, never a write path.
- **Reconnect handling**: a golf course is exactly where a phone drops
  signal. On regaining a connection (network back online, or the tab
  un-backgrounding), the client re-subscribes and refetches the current
  state once, rather than trusting a channel to have silently queued
  missed events. A visible "reconnecting…" indicator covers the gap.

## Screens

**Tiger Center** — a small addition to the existing landing page: once a
round has both locks and isn't started, a banner surfaces above the four
control tiles with that round's summary and a **Start Round** button
(matches the ops-design spec's description).

**Player Portal** — once their round starts, a full-screen takeover
("Round started — Go to Scoring") appears next time they have the Portal
open, or immediately if it's already open (Realtime-driven, no push
notification — deferred per the ops-design spec).

**The scoring screen** — one player's view of their whole match box
(2 or 4 players): a hole selector (any order, not forced sequential — the
existing "Thru N" logic already tolerates gaps), each hole showing the
opponent's stroke field (editable by the assigned scorer, read-only
live-updating for everyone else in the box) and the player's own
putts/FIR/GIR fields. Visually extends the existing scorecard component
family's conventions (`components/scorecard/*` — grid layout, hole
legend, mobile swipe pattern) rather than inventing new visual language,
though this is a new editable component, not a reuse of the read-only
`PlayerScorecardView`. Ends with **Submit Scores**: one "you can't edit
after this" confirmation, then final.

## Error handling

- A failed write (network drop, server error) surfaces inline with a
  retry action — never silently discarded.
- No offline queueing/local-storage buffering in this phase — a genuinely
  offline hole entry has to be retried once signal returns. Named here as
  a known limitation, not solved now.
- Server-side validation rejects a score/putts value outside sane bounds
  (e.g. non-positive strokes) — mirrors the existing validation style in
  `app/api/portal/tiger/*` routes.
- A no-show, injury, or otherwise incomplete player is not handled by this
  phase — Tiger's Edit Scores screen (sub-phase 2) is where a host
  override for that lands.

## Testing

- Pure logic (Foursome scoring math, the individual-stats format
  exclusion) gets `node:test` unit tests, same style as
  `lib/live/orchestration.test.ts`/`scoring.test.ts` already have.
- Route Handlers get the same auth-gate test already standard in this
  codebase (`rejects when requirePlayer resolves null`) plus targeted
  tests of the scoring-opponent/self-report authorization split.
- Realtime subscription behavior (reconnect, live propagation) is
  browser-only and not practically unit-testable — covered by a manual
  walkthrough step in the implementation plan, consistent with how prior
  Tiger Center phases handled anything needing a real browser session.

## Out of scope for this spec

- Tiger's Edit Scores review, official submission, points, wager
  settlement, unsubmit (sub-phase 2).
- The public Website/leaderboard reading from this data (sub-phase 3) —
  today's public site keeps reading the old Sheet/Python-bridge feed
  throughout this phase, untouched.
- Real push notifications (already deferred, tournament-spec-wide).
- Offline queueing (named above).
- Prop-market win-condition evaluation (already flagged tournament-spec-wide
  as its own short investigation, unrelated to scoring itself).

## What "done" looks like

Tiger clicks Start Round on a fully-locked round. Every affected player
sees it in their Portal and can score their assigned opponent's strokes
and their own stats, hole by hole, watching their match box update live as
teammates and opponents enter data. Foursome rounds compute a real match
result and correctly stay out of personal stats. A player can Submit once
done and can't edit after. None of this yet shows up anywhere Tiger or the
public can officially act on it — that's sub-phase 2.
