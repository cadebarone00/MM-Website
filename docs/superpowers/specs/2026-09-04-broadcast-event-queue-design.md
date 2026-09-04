# Watch Live Broadcast — Phase 2: Real-Time Event Queue

## Status

**Design only — nothing in this document has been built.** Per `CLAUDE.md`
Rule 2: no code until this file is reviewed and approved.

This is Phase 2 of the Watch Live Broadcast feature. It implements the
`broadcast_events` table and the rules/priority engine that the master spec
(`docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md`, §10-15,
§26, §44) designed but deliberately didn't build yet. That document remains
the source of truth for the overall feature (event taxonomy, priority tiers,
aging/expiration/dedup rules, the state machine) — this document does not
repeat those numbers, it grounds them in the real write paths and corrects
one assumption that turned out to be wrong once Phase 1 shipped. Read that
document first; this one assumes it.

## What changed since the master spec was written

The master spec assumed `MATCH_STATE_CHANGED`/`MATCH_WON`/`ROUND_FINAL`
would fire from dedicated write paths (`app/api/portal/tiger/matchboxes/*`,
`app/api/portal/tiger/rounds/*`). **That's not how this codebase actually
works.** Inspected 2026-09-04:

- `live_match_boxes.state` (AS / N-UP / dormie / N&M / Final) is **computed
  on read** by `effectiveMatchState()` (`lib/live/orchestration.ts`), not
  written by any route.
- Round-complete status is likewise computed on read by `roundIsComplete()`
  — there is no "finish this round" host action yet (the Edit Scores phase,
  which would add one, isn't built).
- The **only** route that writes `live_hole_scores` is
  `POST /api/portal/scoring/stroke` (`app/api/portal/scoring/stroke/route.ts`).
  `matchboxes/*` routes only create/edit box assignments (pairings, tee
  times); `rounds/start` only flips `live_round_state.started`;
  `rounds/lock` only gates course/matchups setup before a round starts —
  none of them touch scores or derive match state.

So `MATCH_STATE_CHANGED`, `MATCH_WON`, and `ROUND_FINAL` can only be
detected as a **before/after diff around the one route that changes the
inputs those computations read** — `stroke/route.ts`. This document's
architecture reflects that; the master spec's Event Taxonomy table (§11)
is otherwise unchanged (same kinds, same phase assignment, same priorities
from §13).

## Goal

After a hole score is submitted, `broadcast_events` fills up with correctly
classified, prioritized rows — `SCORE_POSTED` always, `MATCH_STATE_CHANGED`/
`MATCH_WON`/`ROUND_FINAL` when the write actually caused that transition —
with no visible change to `/broadcast` yet (that's Phase 4). Verified by
querying the table during a live round, not by watching the screen.

## Trigger Points

### `POST /api/portal/scoring/stroke` (the real hook for almost everything)

After each target player's `live_hole_scores` row is written (the existing
per-target loop at `stroke/route.ts:97-116`), **for that target's match
box**:

1. Always call `publishBroadcastEvent({ kind: "SCORE_POSTED", seasonYear, playerSlug: target, round, hole, score, matchBoxId: box.id })`.
2. Build a `LiveTournamentSnapshot` from the fresh state (same pattern
   `rounds/lock/route.ts:51-66` already uses to build one for
   `roundIsComplete`/`validateMatchBox` — reuse that shape, don't invent a
   second one). Compute `matchBoxResult(snapshot, box)` **after** the write.
3. **Correction from initial drafting** (found while grounding this in
   `lib/live/orchestration.ts`): diffing `effectiveMatchState()` is the
   wrong signal. It only returns `"Final"` once all 18 holes are entered —
   it has no concept of an early closeout (a match won 3&2, the most common
   real finish in match play), and otherwise sits on `"Live"` for the whole
   match, so a diff on it would almost never fire `MATCH_STATE_CHANGED` and
   would miss every early `MATCH_WON`. The correct signal is
   `matchBoxResult()` — already what the shipped Match Play scene uses
   (`lib/broadcast/matchPlayData.ts:107-108`) — compared against the same
   function called on the **pre-write** snapshot (fetch `live_hole_scores`
   for the box once before the loop starts, alongside the existing
   box/round-state reads already at the top of the handler — one extra read,
   not one per target):
   - A box is "closed" (won) when `maroonPts > 0 || whitePts > 0` (true
     exactly when `matchBoxResult`'s internal `matchClosed` condition —
     `completed === 18 || margin > holesRemaining` — holds; a tie at 18
     holes also yields nonzero, 0.5/0.5, points, correctly counting as
     closed). If closed **now** and **wasn't closed before this write**:
     publish `MATCH_WON` — `{ matchBoxId: box.id, leader, margin, maroonPts, whitePts }` —
     and skip `MATCH_STATE_CHANGED` for this box (the win is the more
     specific classification of the same change; no reason to publish
     both for one underlying event, matching §13's dedup philosophy).
   - Otherwise, if `leader`, `margin`, or `holesRemaining` differ from
     before the write: publish `MATCH_STATE_CHANGED` —
     `{ matchBoxId: box.id, leader, margin, holesRemaining }`. This is the
     raw shape (no baked "2 UP"/"dormie"/"AS" label — nothing in this
     codebase computes that string today; whichever phase first renders
     this event's UI derives the label from these primitives then, not
     Phase 2).
4. After the per-target loop finishes (all targets' scores written), check
   `roundIsComplete(snapshotAfter, round, box.format)` against
   `roundIsComplete(snapshotBefore, round, box.format)` — actually **not
   meaningful per-box**: round completion depends on every box in the
   round, not just this one. Compute it from a full-round snapshot (all
   boxes for `season_year`+`round`, same shape `rounds/lock/route.ts`
   already builds) once, after the loop, before/after compared the same
   way. If it flips false→true:
   `publishBroadcastEvent({ kind: "ROUND_FINAL", seasonYear, round })`.

All four `publishBroadcastEvent` calls are wrapped in one `try/catch` around
the whole block, placed **after** `stroke/route.ts`'s existing score writes
already succeeded and already returned their own errors — a broadcast
failure is logged (`console.error`, §32 of the master spec) and never turns
a successful score submission into a 500.

### `POST /api/portal/tiger/rounds/start`

After `live_round_state`/`live_match_boxes` are marked `started` (the
existing writes at `rounds/start/route.ts:29-37`):
`publishBroadcastEvent({ kind: "ROUND_STARTED", seasonYear, round })`. Same
try/catch-after-success placement.

## Data Model

```sql
-- === Watch Live Broadcast: Phase 2 (Event Queue) ==========================
-- See docs/superpowers/specs/2026-09-04-broadcast-event-queue-design.md.

create table if not exists broadcast_events (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2027 and 2034),
  kind text not null check (kind in (
    'SCORE_POSTED', 'MATCH_STATE_CHANGED', 'MATCH_WON', 'ROUND_STARTED', 'ROUND_FINAL'
  )),
  priority integer not null,
  status text not null default 'pending' check (status in (
    'pending', 'queued', 'ready', 'playing', 'played', 'expired', 'dismissed'
  )),
  payload jsonb not null default '{}',
  -- Nullable references, populated per kind (a ROUND_STARTED event has no
  -- match_box_id/player_slug; a SCORE_POSTED one has both). No FK to
  -- live_match_boxes: match boxes aren't deleted mid-tournament in this
  -- codebase's existing flows, but the raw fact tables this mirrors
  -- (live_hole_scores) don't FK either — matching that existing looseness
  -- rather than introducing a stricter constraint this feature doesn't need.
  match_box_id uuid,
  player_slug text,
  round integer,
  hole integer,
  source text not null default 'system' check (source in ('system', 'host')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcast_events_queue_idx
  on broadcast_events (season_year, status, priority desc, created_at asc);

alter table broadcast_events enable row level security;
drop policy if exists broadcast_events_select_all on broadcast_events;
create policy broadcast_events_select_all on broadcast_events for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'broadcast_events'
  ) then
    alter publication supabase_realtime add table broadcast_events;
  end if;
end $$;
```

No history table (a `played`/`expired`/`dismissed` row *is* the history,
filtered by `status` — master spec §12). No FK from `broadcast_state.active_event_id`
yet — that field stays unused until Phase 4 actually sets it (nothing reads
it in Phase 2).

## Priority / Aging / Expiration / Dedup

Unchanged from the master spec §13 — implemented, not redesigned, here:

| Priority | Event (Phase 2 scope only) |
|---|---|
| 0 | `ROUND_STARTED` — no rule currently acts on it beyond logging; reserved for Phase 4/7 ("Round 2 has begun" announcement) |
| 10 | `SCORE_POSTED`, no notable classification — logged (`status: 'pending'`), never becomes `queued` (birdie/eagle classification is Phase 4/7, not this phase) |
| 40 | `MATCH_STATE_CHANGED` (raw `leader`/`margin`/`holesRemaining` payload — no baked AS/N-UP/dormie label, see Trigger Points) |
| 70 | `MATCH_WON` |
| 75 | `ROUND_FINAL` |

Aging (`priority + min(30, minutes_waiting * 2)`, sort-time only, not
stored), expiration defaults (`broadcast_config` — reuse the existing
`priorities` jsonb column already sitting in that table since Phase 1,
unused until now), and dedup-by-replace (same `kind` +
`match_box_id`/`round`/`hole` → update the existing `pending`/`queued` row
instead of inserting a second one) are exactly as specified in the master
document's §13. No changes.

`ROUND_STARTED`'s rule, like `SCORE_POSTED`'s, always returns
`status: "pending"` — logged, never `queued` — since nothing in this phase
consumes it. A later phase that wants it to actually announce something
changes the rule function, not the trigger point.

## Rules Engine

`lib/broadcast/rules.ts` — one pure function per raw kind, matching
`lib/live/scoring.ts`'s existing style (pure, unit-tested, no I/O):

```ts
export interface BroadcastEventDraft {
  priority: number;
  status: "pending" | "queued";
  expiresAt: string | null;
  payload: Record<string, unknown>;
}

export function scorePostedRule(event: RawScorePostedEvent): BroadcastEventDraft;
export function matchStateChangedRule(event: RawMatchStateChangedEvent): BroadcastEventDraft;
export function matchWonRule(event: RawMatchWonEvent): BroadcastEventDraft;
export function roundStartedRule(event: RawRoundStartedEvent): BroadcastEventDraft;
export function roundFinalRule(event: RawRoundFinalEvent): BroadcastEventDraft;
```

(Exact `Raw*Event` field shapes — e.g. `RawScorePostedEvent`'s
`{ seasonYear, playerSlug, round, hole, score, matchBoxId }` — are pinned
down in the implementation plan, not here; the Trigger Points section above
already fixes what data is available at each call site, which is what
determines them.)

`lib/broadcast/publish.ts` exports `publishBroadcastEvent(rawEvent)`:
dispatches to the matching rule function by `kind`, checks for an existing
`pending`/`queued` row to replace (dedup), inserts/updates
`broadcast_events` via the service-role client. Never touches
`broadcast_state` in Phase 2 (no takeover exists yet to trigger — that's
Phase 4's job, reading this table).

`lib/broadcast/priority.ts`: the table above as a `Record<BroadcastEventKind, number>`
plus the aging calculation as a pure function,
`effectivePriority(priority: number, createdAt: string, now: Date): number`.

`lib/broadcast/queue.ts`: the single "next in queue" query (master spec
§12) — `select * from broadcast_events where season_year = $1 and status in
('queued','ready') and (expires_at is null or expires_at > now()) order by
priority desc, created_at asc` — as a typed function, unused by any caller
in Phase 2 (nothing reads the queue yet) but written and unit-tested now so
Phase 4 doesn't redefine the ordering rule a second time.

## Testing Strategy

**Correction from initial drafting:** this repo's `app/api/**/*.test.ts`
files have no Supabase mocking/test-DB harness anywhere (checked
`stroke/route.test.ts`, `rounds/start/route.test.ts`, and every sibling —
each contains exactly one test, asserting the route rejects when
`requirePlayer`/`requireHost` resolves null). Route tests exercising a full
happy path with real match-state transitions aren't achievable in this
repo's actual testing convention, so the plan below doesn't add them.
Instead, the before/after diffing logic (§ Trigger Points) is written as a
**pure function with no I/O** — same shape as `lib/live/orchestration.ts`'s
existing functions — so it gets real unit-test coverage the same way
`orchestration.test.ts` already covers `effectiveMatchState`/
`matchBoxResult`: hand-built `LiveTournamentSnapshot`/`MatchBoxResult`
fixtures in, assertions on the output, zero mocking needed. The route
becomes a thin I/O wrapper around this function plus `publishBroadcastEvent`.

- `lib/broadcast/matchEvents.ts` — new pure module:
  `detectMatchBoxEvent(before: MatchBoxResult, after: MatchBoxResult, matchBoxId: string): RawMatchStateChangedEvent | RawMatchWonEvent | null`
  and `detectRoundFinal(beforeComplete: boolean, afterComplete: boolean, round: number): RawRoundFinalEvent | null`
  — implement exactly the closed/changed logic from Trigger Points item 3.
  Tested in `lib/broadcast/matchEvents.test.ts`: table-driven cases over
  `{leader, margin, holesRemaining, maroonPts, whitePts}` before/after pairs
  — no change → `null`; margin change only → `MATCH_STATE_CHANGED`; closes
  at 18 holes → `MATCH_WON`; closes early (`margin > holesRemaining`,
  e.g. 3&2) → `MATCH_WON` (this is the case the original `effectiveMatchState`-based
  design would have missed — assert it explicitly); already-closed before
  and after → `null` (no re-firing on an unrelated hole in an already-decided
  box).
- `lib/broadcast/rules.test.ts`: one test per rule function
  (`scorePostedRule`, `matchStateChangedRule`, `matchWonRule`,
  `roundStartedRule`, `roundFinalRule`) — given a raw event, assert the
  returned `BroadcastEventDraft`'s priority/status/payload against the
  table in this document.
- `lib/broadcast/priority.test.ts`: aging calculation at 0/15/30/60+ minutes
  waiting, clamped at +30.
- `lib/broadcast/queue.test.ts`: ordering (priority desc, then created_at
  asc), expired rows excluded.
- `app/api/portal/scoring/stroke/route.test.ts` /
  `app/api/portal/tiger/rounds/start/route.test.ts`: unchanged from what
  exists today — the auth-rejection test still passes as-is (these routes
  gain a broadcast side effect, not a new auth path); no new route tests
  added, matching this repo's actual convention rather than the repo's
  test file naming making it look like more coverage exists than does.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Migration

Same hand-maintained `supabase/schema.sql` + manual paste into the Supabase
SQL Editor pattern as every prior phase (see the master spec §26's
resolution and [[tiger-center-build-phasing]]). One new table, one index,
one RLS policy, one Realtime-publication addition — no `alter` on any
existing table.

## Edge Cases

- **Simultaneous stroke writes for the same match box** (both players'
  scorers submit close together): each request computes its own
  before/after snapshot independently: whichever request's write commits
  second sees the first request's score already in its "before" snapshot,
  so it correctly attributes any resulting state change to its own write
  without double-counting or missing it. No locking needed — this mirrors
  how the existing scoring writes already handle concurrent submissions
  (no transaction wrapping today; not introduced here either).
- **A stroke write corrects an already-`Final` box's score** (not possible
  yet — no host score-edit route exists — but worth stating): `stroke/route.ts`
  already blocks this today via the existing submission-lock check
  (`existingSubmission`), so this case can't occur through this route as it
  stands. If/when Edit Scores ships a host correction path, it needs its
  own `publishBroadcastEvent` wiring — explicitly out of scope here.
- **`ROUND_FINAL` fires but the round was already broadcast as final once
  before** (shouldn't happen — completion is monotonic given no score-edit
  path exists yet — but the dedup rule covers it defensively: a second
  identical `ROUND_FINAL` for the same `round` replaces the pending one
  rather than stacking).
- **`publishBroadcastEvent` throws** (Supabase unreachable, etc.): logged,
  swallowed, scoring write already succeeded and already returned — §32.

## Acceptance Criteria

1. Submitting a hole score that doesn't change any match's state or close
   out a round inserts exactly one `broadcast_events` row: `SCORE_POSTED`,
   priority 10, status `pending`.
2. Submitting a hole score that changes a match's `leader`/`margin`/
   `holesRemaining` (per `matchBoxResult()`) without closing it out inserts
   a second row: `MATCH_STATE_CHANGED`, priority 40, status `queued`,
   payload carrying the raw `leader`/`margin`/`holesRemaining`.
3. Submitting the hole score that closes out a match — including an early
   closeout (e.g. 3&2, `margin > holesRemaining`), not just a full 18 holes
   — inserts a third kind instead: `MATCH_WON`, priority 70, status
   `queued`, no accompanying `MATCH_STATE_CHANGED` for that same write.
4. Submitting the hole score that completes the last unfinished box in a
   round inserts `ROUND_FINAL`, priority 75, status `queued`, scoped to that
   `round` (not a specific match box).
5. Starting a round inserts `ROUND_STARTED`, priority 0.
6. The `try/catch` around every `publishBroadcastEvent` call is placed after
   the underlying score-write/round-start write has already succeeded and
   already been assembled into the response — verified by code inspection
   (the write and its success response construction happen before the
   broadcast block, matching §32's existing "never fail the underlying
   write" convention elsewhere in this codebase) rather than a route-level
   failure-injection test, per the Testing Strategy correction above.
7. `/broadcast` (and Broadcast Controls) behave identically to before this
   phase — no visible change, per this document's Goal section. Verified by
   a manual check (open both, confirm nothing looks different) rather than
   an automated test, since there's genuinely nothing new for one to assert.

## Explicitly Out of Scope (this phase)

Everything Phase 4+ in the master spec: any takeover/overlay actually
consuming this queue, birdie/eagle/hole-in-one classification,
`LEADER_CHANGED`, video, audio, host queue controls (Play Next/Play
Now/Skip/Replay/Clear Queue — those need something in the queue that's
actually being *shown* first, which is Phase 4's job).
