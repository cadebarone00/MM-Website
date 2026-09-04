# Watch Live Broadcast — Phase 2 (Event Queue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a hole score is submitted or a round is started, `broadcast_events` fills up with correctly classified, prioritized rows (`SCORE_POSTED`, `MATCH_STATE_CHANGED`, `MATCH_WON`, `ROUND_STARTED`, `ROUND_FINAL`) — with zero visible change to `/broadcast` or Broadcast Controls (nothing reads the queue yet; that's Phase 4).

**Architecture:** A new `broadcast_events` table, filled by `publishBroadcastEvent()` calls added to the two existing routes that already change the underlying facts (`scoring/stroke`, `tiger/rounds/start`), always placed after those routes' real writes already succeeded. Because match status and round-completion are computed on read (`lib/live/orchestration.ts`), not stored, detection is a before/after diff around the score-write route — implemented as a pure, no-I/O function (`lib/broadcast/matchEvents.ts`) so it's unit-testable the same way `lib/live/orchestration.test.ts` already covers the functions it calls.

**Tech Stack:** Next.js 16 Route Handlers, Supabase Postgres (hand-maintained `schema.sql`) + Realtime, TypeScript, `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-04-broadcast-event-queue-design.md` (also read `docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md` §10-15/§26 for the priority-tier table and aging/expiration/dedup rules this plan implements without re-deriving).

## Global Constraints

- Every `publishBroadcastEvent` call happens **after** the underlying score/round write has already succeeded — a broadcast failure must never fail that request (master spec §32).
- No visible change to `/broadcast` or `/portal/admin/broadcast-controls` in this phase — do not touch anything under `components/broadcast/`.
- Match this repo's existing conventions exactly: `tsx --test` colocated `*.test.ts`, hand-maintained `supabase/schema.sql` (manual paste into the Supabase SQL Editor in production — no migration tool), service-role Supabase client for all broadcast writes, RLS `select using (true)` + no insert/update policy.
- Pure logic (detection, priority, rules, queue ordering) lives in files with **no I/O** and gets real unit tests, matching `lib/live/orchestration.ts`'s style. I/O-touching modules (`publish.ts`, the route wiring) follow this repo's actual convention of **no dedicated automated test** for that layer — verified by `tsc`/manual walkthrough instead, same as every other `lib/broadcast/*.ts` file that touches Supabase (`state.ts`, `leaderboardData.ts`, `matchPlayData.ts`, `liveSnapshot.ts` — none of which have a `.test.ts`).
- `season_year` between 2027 and 2034 everywhere, matching every other Master-Settings-era table.

---

## Task 1: `broadcast_events` schema

**Files:**
- Modify: `supabase/schema.sql` (append after line 1095, the current end of file)

**Interfaces:**
- Produces: the `broadcast_events` table with columns `id, season_year, kind, priority, status, payload, match_box_id, player_slug, round, hole, source, expires_at, created_at, updated_at` — every later task's Supabase calls against this table use exactly these column names.

- [ ] **Step 1: Append the table, index, RLS, and Realtime publication**

Append to the end of `supabase/schema.sql`:

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

- [ ] **Step 2: Sanity-check the SQL is well-formed**

Run: `grep -c "create table if not exists broadcast_events" supabase/schema.sql`
Expected: `1`

There's no local Postgres in this repo to apply this against automatically — this table gets created by pasting this block into the Supabase SQL Editor in production once this task is merged (same manual step every prior Tiger Center phase has used — see Task 10's checklist item).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(broadcast): add broadcast_events table (Phase 2)"
```

---

## Task 2: Shared event types

**Files:**
- Modify: `lib/broadcast/types.ts`

**Interfaces:**
- Consumes: nothing new (existing `BroadcastTeam` stays as-is).
- Produces: `BroadcastEventKind`, `BroadcastEventStatus`, `RawScorePostedEvent`, `RawMatchStateChangedEvent`, `RawMatchWonEvent`, `RawRoundStartedEvent`, `RawRoundFinalEvent`, `RawBroadcastEvent` (union), `BroadcastEventDraft` — every later task imports these exact names from `@/lib/broadcast/types`.

- [ ] **Step 1: Add the types**

Append to `lib/broadcast/types.ts`:

```ts
// --- Phase 2: Event Queue ---------------------------------------------
// See docs/superpowers/specs/2026-09-04-broadcast-event-queue-design.md.

export type BroadcastEventKind = "SCORE_POSTED" | "MATCH_STATE_CHANGED" | "MATCH_WON" | "ROUND_STARTED" | "ROUND_FINAL";

export type BroadcastEventStatus = "pending" | "queued" | "ready" | "playing" | "played" | "expired" | "dismissed";

export interface RawScorePostedEvent {
  kind: "SCORE_POSTED";
  seasonYear: number;
  playerSlug: string;
  round: number;
  hole: number;
  score: number;
  matchBoxId: string;
}

export interface RawMatchStateChangedEvent {
  kind: "MATCH_STATE_CHANGED";
  seasonYear: number;
  matchBoxId: string;
  round: number;
  leader: BroadcastTeam | "tie";
  margin: number;
  holesRemaining: number;
}

export interface RawMatchWonEvent {
  kind: "MATCH_WON";
  seasonYear: number;
  matchBoxId: string;
  round: number;
  leader: BroadcastTeam | "tie";
  margin: number;
  maroonPts: number;
  whitePts: number;
}

export interface RawRoundStartedEvent {
  kind: "ROUND_STARTED";
  seasonYear: number;
  round: number;
}

export interface RawRoundFinalEvent {
  kind: "ROUND_FINAL";
  seasonYear: number;
  round: number;
}

export type RawBroadcastEvent =
  | RawScorePostedEvent
  | RawMatchStateChangedEvent
  | RawMatchWonEvent
  | RawRoundStartedEvent
  | RawRoundFinalEvent;

export interface BroadcastEventDraft {
  priority: number;
  status: Extract<BroadcastEventStatus, "pending" | "queued">;
  expiresAt: string | null;
  payload: Record<string, unknown>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (these are additive types with no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add lib/broadcast/types.ts
git commit -m "feat(broadcast): add Phase 2 event types"
```

---

## Task 3: Priority table and aging

**Files:**
- Create: `lib/broadcast/priority.ts`
- Test: `lib/broadcast/priority.test.ts`

**Interfaces:**
- Consumes: `BroadcastEventKind` from `@/lib/broadcast/types` (Task 2).
- Produces: `DEFAULT_PRIORITIES: Record<BroadcastEventKind, number>`, `effectivePriority(priority: number, createdAt: string, now: Date): number` — used by `queue.ts` (Task 6) and `rules.ts` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `lib/broadcast/priority.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRIORITIES, effectivePriority } from "./priority.ts";

test("DEFAULT_PRIORITIES matches the master spec's §13 tiers for Phase 2's event kinds", () => {
  assert.deepEqual(DEFAULT_PRIORITIES, {
    ROUND_STARTED: 0,
    SCORE_POSTED: 10,
    MATCH_STATE_CHANGED: 40,
    MATCH_WON: 70,
    ROUND_FINAL: 75,
  });
});

test("effectivePriority adds no bonus at 0 minutes waiting", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  assert.equal(effectivePriority(40, now.toISOString(), now), 40);
});

test("effectivePriority adds 2 points per minute waited", () => {
  const createdAt = new Date("2027-01-06T12:00:00Z");
  const now = new Date("2027-01-06T12:05:00Z");
  assert.equal(effectivePriority(40, createdAt.toISOString(), now), 50);
});

test("effectivePriority clamps the aging bonus at +30", () => {
  const createdAt = new Date("2027-01-06T12:00:00Z");
  const now = new Date("2027-01-06T13:00:00Z");
  assert.equal(effectivePriority(40, createdAt.toISOString(), now), 70);
});

test("effectivePriority never goes negative when createdAt is slightly after now (clock skew)", () => {
  const createdAt = new Date("2027-01-06T12:00:05Z");
  const now = new Date("2027-01-06T12:00:00Z");
  assert.equal(effectivePriority(40, createdAt.toISOString(), now), 40);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/broadcast/priority.test.ts`
Expected: FAIL — `Cannot find module './priority.ts'`

- [ ] **Step 3: Implement**

Create `lib/broadcast/priority.ts`:

```ts
// lib/broadcast/priority.ts
//
// Default priority tiers (master spec §13) and the sort-time aging
// calculation. No I/O.
import type { BroadcastEventKind } from "./types";

export const DEFAULT_PRIORITIES: Record<BroadcastEventKind, number> = {
  ROUND_STARTED: 0,
  SCORE_POSTED: 10,
  MATCH_STATE_CHANGED: 40,
  MATCH_WON: 70,
  ROUND_FINAL: 75,
};

const MAX_AGING_BONUS = 30;
const AGING_PER_MINUTE = 2;

/**
 * A queued event's effective priority for sort purposes: base priority
 * plus up to MAX_AGING_BONUS extra, accruing at AGING_PER_MINUTE per
 * minute waited — so a medium-priority event that's been waiting a long
 * time eventually surfaces instead of being starved (master spec §13).
 * Sort-time only, never stored.
 */
export function effectivePriority(priority: number, createdAt: string, now: Date): number {
  const minutesWaiting = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 60000);
  return priority + Math.min(MAX_AGING_BONUS, minutesWaiting * AGING_PER_MINUTE);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/broadcast/priority.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/broadcast/priority.ts lib/broadcast/priority.test.ts
git commit -m "feat(broadcast): priority tiers and aging calculation"
```

---

## Task 4: Match-box and round-final event detection

**Files:**
- Create: `lib/broadcast/matchEvents.ts`
- Test: `lib/broadcast/matchEvents.test.ts`

**Interfaces:**
- Consumes: `MatchBoxResult` from `@/lib/live/orchestration` (existing); `RawMatchStateChangedEvent`, `RawMatchWonEvent`, `RawRoundFinalEvent` from `@/lib/broadcast/types` (Task 2).
- Produces: `detectMatchBoxEvent(before: MatchBoxResult, after: MatchBoxResult, matchBoxId: string, seasonYear: number, round: number): RawMatchStateChangedEvent | RawMatchWonEvent | null`, `detectRoundFinal(beforeComplete: boolean, afterComplete: boolean, seasonYear: number, round: number): RawRoundFinalEvent | null` — used by Task 8 (stroke route wiring).

- [ ] **Step 1: Write the failing tests**

Create `lib/broadcast/matchEvents.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMatchBoxEvent, detectRoundFinal } from "./matchEvents.ts";
import type { MatchBoxResult } from "@/lib/live/orchestration";

function result(overrides: Partial<MatchBoxResult> = {}): MatchBoxResult {
  return { maroonPts: 0, whitePts: 0, leader: "tie", margin: 0, holesRemaining: 18, ...overrides };
}

test("detectMatchBoxEvent returns null when nothing changed", () => {
  const r = result({ leader: "maroon", margin: 1, holesRemaining: 10 });
  assert.equal(detectMatchBoxEvent(r, r, "box-1", 2027, 3), null);
});

test("detectMatchBoxEvent returns MATCH_STATE_CHANGED when leader/margin/holesRemaining shift but the box isn't closed", () => {
  const before = result({ leader: "maroon", margin: 1, holesRemaining: 10 });
  const after = result({ leader: "maroon", margin: 2, holesRemaining: 9 });
  const event = detectMatchBoxEvent(before, after, "box-1", 2027, 3);
  assert.deepEqual(event, { kind: "MATCH_STATE_CHANGED", seasonYear: 2027, matchBoxId: "box-1", round: 3, leader: "maroon", margin: 2, holesRemaining: 9 });
});

test("detectMatchBoxEvent returns MATCH_WON when a box closes at 18 holes complete", () => {
  const before = result({ leader: "white", margin: 1, holesRemaining: 1 });
  const after = result({ leader: "white", margin: 1, holesRemaining: 0, whitePts: 1 });
  const event = detectMatchBoxEvent(before, after, "box-2", 2027, 1);
  assert.deepEqual(event, { kind: "MATCH_WON", seasonYear: 2027, matchBoxId: "box-2", round: 1, leader: "white", margin: 1, maroonPts: 0, whitePts: 1 });
});

test("detectMatchBoxEvent returns MATCH_WON on an early closeout (3&2) — the case effectiveMatchState-based detection would have missed", () => {
  const before = result({ leader: "maroon", margin: 2, holesRemaining: 3 });
  const after = result({ leader: "maroon", margin: 3, holesRemaining: 2, maroonPts: 1 }); // margin(3) > holesRemaining(2): decided early
  const event = detectMatchBoxEvent(before, after, "box-3", 2027, 2);
  assert.deepEqual(event, { kind: "MATCH_WON", seasonYear: 2027, matchBoxId: "box-3", round: 2, leader: "maroon", margin: 3, maroonPts: 1, whitePts: 0 });
});

test("detectMatchBoxEvent returns null once a box is already closed, even if a later (moot) hole is entered", () => {
  const before = result({ leader: "maroon", margin: 3, holesRemaining: 2, maroonPts: 1 });
  const after = result({ leader: "maroon", margin: 4, holesRemaining: 1, maroonPts: 1 });
  assert.equal(detectMatchBoxEvent(before, after, "box-3", 2027, 2), null);
});

test("detectRoundFinal fires only on the false -> true transition", () => {
  assert.deepEqual(detectRoundFinal(false, true, 2027, 4), { kind: "ROUND_FINAL", seasonYear: 2027, round: 4 });
  assert.equal(detectRoundFinal(true, true, 2027, 4), null);
  assert.equal(detectRoundFinal(false, false, 2027, 4), null);
  assert.equal(detectRoundFinal(true, false, 2027, 4), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/broadcast/matchEvents.test.ts`
Expected: FAIL — `Cannot find module './matchEvents.ts'`

- [ ] **Step 3: Implement**

Create `lib/broadcast/matchEvents.ts`:

```ts
// lib/broadcast/matchEvents.ts
//
// Pure detection of match-box/round broadcast-worthy transitions, given
// matchBoxResult() computed before and after a stroke write. No I/O — same
// style as lib/live/orchestration.ts. See
// docs/superpowers/specs/2026-09-04-broadcast-event-queue-design.md
// (Trigger Points, item 3) for why this diffs matchBoxResult() rather than
// effectiveMatchState(): the latter has no concept of an early closeout.
import type { MatchBoxResult } from "@/lib/live/orchestration";
import type { RawMatchStateChangedEvent, RawMatchWonEvent, RawRoundFinalEvent } from "./types";

function isClosed(result: Pick<MatchBoxResult, "maroonPts" | "whitePts">): boolean {
  return result.maroonPts > 0 || result.whitePts > 0;
}

/**
 * Given a match box's result before and after a stroke write, decide what
 * (if anything) to publish. Returns null if nothing meaningfully changed.
 * A newly-closed box always wins over a state-changed classification for
 * the same write (master spec §13's dedup philosophy — one underlying
 * change, one event).
 */
export function detectMatchBoxEvent(
  before: MatchBoxResult,
  after: MatchBoxResult,
  matchBoxId: string,
  seasonYear: number,
  round: number
): RawMatchStateChangedEvent | RawMatchWonEvent | null {
  const wasClosed = isClosed(before);
  const isNowClosed = isClosed(after);

  if (!wasClosed && isNowClosed) {
    return {
      kind: "MATCH_WON",
      seasonYear,
      matchBoxId,
      round,
      leader: after.leader,
      margin: after.margin,
      maroonPts: after.maroonPts,
      whitePts: after.whitePts,
    };
  }

  if (wasClosed) return null; // already decided — don't re-fire on a later, moot hole in the same box

  if (before.leader === after.leader && before.margin === after.margin && before.holesRemaining === after.holesRemaining) {
    return null;
  }

  return {
    kind: "MATCH_STATE_CHANGED",
    seasonYear,
    matchBoxId,
    round,
    leader: after.leader,
    margin: after.margin,
    holesRemaining: after.holesRemaining,
  };
}

/** Round-complete transition — fires only on the false -> true edge. */
export function detectRoundFinal(beforeComplete: boolean, afterComplete: boolean, seasonYear: number, round: number): RawRoundFinalEvent | null {
  if (beforeComplete || !afterComplete) return null;
  return { kind: "ROUND_FINAL", seasonYear, round };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/broadcast/matchEvents.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/broadcast/matchEvents.ts lib/broadcast/matchEvents.test.ts
git commit -m "feat(broadcast): pure match-box/round-final event detection"
```

---

## Task 5: Rules engine

**Files:**
- Create: `lib/broadcast/rules.ts`
- Test: `lib/broadcast/rules.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_PRIORITIES` from `@/lib/broadcast/priority` (Task 3); `RawBroadcastEvent` variants, `BroadcastEventDraft` from `@/lib/broadcast/types` (Task 2).
- Produces: `scorePostedRule`, `matchStateChangedRule`, `matchWonRule`, `roundStartedRule`, `roundFinalRule` — each `(event, now?: Date) => BroadcastEventDraft` — used by Task 7 (`publish.ts`).

- [ ] **Step 1: Write the failing tests**

Create `lib/broadcast/rules.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStateChangedRule, matchWonRule, roundFinalRule, roundStartedRule, scorePostedRule } from "./rules.ts";

const NOW = new Date("2027-01-06T12:00:00Z");

test("scorePostedRule: priority 10, status pending, never expires", () => {
  const draft = scorePostedRule({ kind: "SCORE_POSTED", seasonYear: 2027, playerSlug: "cade-barone", round: 1, hole: 5, score: 4, matchBoxId: "box-1" }, NOW);
  assert.equal(draft.priority, 10);
  assert.equal(draft.status, "pending");
  assert.equal(draft.expiresAt, null);
  assert.deepEqual(draft.payload, { playerSlug: "cade-barone", round: 1, hole: 5, score: 4, matchBoxId: "box-1" });
});

test("matchStateChangedRule: priority 40, status queued, expires in 10 minutes", () => {
  const draft = matchStateChangedRule({ kind: "MATCH_STATE_CHANGED", seasonYear: 2027, matchBoxId: "box-1", round: 1, leader: "maroon", margin: 2, holesRemaining: 9 }, NOW);
  assert.equal(draft.priority, 40);
  assert.equal(draft.status, "queued");
  assert.equal(draft.expiresAt, new Date(NOW.getTime() + 10 * 60 * 1000).toISOString());
  assert.deepEqual(draft.payload, { matchBoxId: "box-1", round: 1, leader: "maroon", margin: 2, holesRemaining: 9 });
});

test("matchWonRule: priority 70, status queued, expires in 30 minutes", () => {
  const draft = matchWonRule({ kind: "MATCH_WON", seasonYear: 2027, matchBoxId: "box-1", round: 1, leader: "maroon", margin: 3, maroonPts: 1, whitePts: 0 }, NOW);
  assert.equal(draft.priority, 70);
  assert.equal(draft.status, "queued");
  assert.equal(draft.expiresAt, new Date(NOW.getTime() + 30 * 60 * 1000).toISOString());
  assert.deepEqual(draft.payload, { matchBoxId: "box-1", round: 1, leader: "maroon", margin: 3, maroonPts: 1, whitePts: 0 });
});

test("roundStartedRule: priority 0, status pending, never expires", () => {
  const draft = roundStartedRule({ kind: "ROUND_STARTED", seasonYear: 2027, round: 2 }, NOW);
  assert.equal(draft.priority, 0);
  assert.equal(draft.status, "pending");
  assert.equal(draft.expiresAt, null);
  assert.deepEqual(draft.payload, { round: 2 });
});

test("roundFinalRule: priority 75, status queued, expires in 30 minutes", () => {
  const draft = roundFinalRule({ kind: "ROUND_FINAL", seasonYear: 2027, round: 2 }, NOW);
  assert.equal(draft.priority, 75);
  assert.equal(draft.status, "queued");
  assert.equal(draft.expiresAt, new Date(NOW.getTime() + 30 * 60 * 1000).toISOString());
  assert.deepEqual(draft.payload, { round: 2 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/broadcast/rules.test.ts`
Expected: FAIL — `Cannot find module './rules.ts'`

- [ ] **Step 3: Implement**

Create `lib/broadcast/rules.ts`:

```ts
// lib/broadcast/rules.ts
//
// One pure function per raw event kind -> BroadcastEventDraft. No I/O.
// Matches lib/live/scoring.ts's style. Priority numbers and expiration
// defaults per the master spec's §13 (overlay-class: 10 min, takeover-class: 30 min).
import { DEFAULT_PRIORITIES } from "./priority";
import type {
  BroadcastEventDraft,
  RawMatchStateChangedEvent,
  RawMatchWonEvent,
  RawRoundFinalEvent,
  RawRoundStartedEvent,
  RawScorePostedEvent,
} from "./types";

const OVERLAY_EXPIRES_MS = 10 * 60 * 1000;
const TAKEOVER_EXPIRES_MS = 30 * 60 * 1000;

function expiresAt(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

export function scorePostedRule(event: RawScorePostedEvent, now: Date = new Date()): BroadcastEventDraft {
  void now;
  return {
    priority: DEFAULT_PRIORITIES.SCORE_POSTED,
    status: "pending",
    expiresAt: null,
    payload: { playerSlug: event.playerSlug, round: event.round, hole: event.hole, score: event.score, matchBoxId: event.matchBoxId },
  };
}

export function matchStateChangedRule(event: RawMatchStateChangedEvent, now: Date = new Date()): BroadcastEventDraft {
  return {
    priority: DEFAULT_PRIORITIES.MATCH_STATE_CHANGED,
    status: "queued",
    expiresAt: expiresAt(now, OVERLAY_EXPIRES_MS),
    payload: { matchBoxId: event.matchBoxId, round: event.round, leader: event.leader, margin: event.margin, holesRemaining: event.holesRemaining },
  };
}

export function matchWonRule(event: RawMatchWonEvent, now: Date = new Date()): BroadcastEventDraft {
  return {
    priority: DEFAULT_PRIORITIES.MATCH_WON,
    status: "queued",
    expiresAt: expiresAt(now, TAKEOVER_EXPIRES_MS),
    payload: { matchBoxId: event.matchBoxId, round: event.round, leader: event.leader, margin: event.margin, maroonPts: event.maroonPts, whitePts: event.whitePts },
  };
}

export function roundStartedRule(event: RawRoundStartedEvent, now: Date = new Date()): BroadcastEventDraft {
  void now;
  return { priority: DEFAULT_PRIORITIES.ROUND_STARTED, status: "pending", expiresAt: null, payload: { round: event.round } };
}

export function roundFinalRule(event: RawRoundFinalEvent, now: Date = new Date()): BroadcastEventDraft {
  return { priority: DEFAULT_PRIORITIES.ROUND_FINAL, status: "queued", expiresAt: expiresAt(now, TAKEOVER_EXPIRES_MS), payload: { round: event.round } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/broadcast/rules.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/broadcast/rules.ts lib/broadcast/rules.test.ts
git commit -m "feat(broadcast): rules engine (raw event -> BroadcastEventDraft)"
```

---

## Task 6: Queue ordering

**Files:**
- Create: `lib/broadcast/queue.ts`
- Test: `lib/broadcast/queue.test.ts`

**Interfaces:**
- Consumes: `effectivePriority` from `@/lib/broadcast/priority` (Task 3); `BroadcastEventKind`, `BroadcastEventStatus` from `@/lib/broadcast/types` (Task 2).
- Produces: `BroadcastEventRow` interface, `sortQueueRows(rows: BroadcastEventRow[], now: Date): BroadcastEventRow[]` (pure), `getNextInQueue(seasonYear: number): Promise<BroadcastEventRow[]>` (I/O — unused by any caller in this phase; written now, per the spec, so Phase 4 doesn't redefine the ordering rule a second time).

- [ ] **Step 1: Write the failing tests**

Create `lib/broadcast/queue.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortQueueRows, type BroadcastEventRow } from "./queue.ts";

function row(overrides: Partial<BroadcastEventRow>): BroadcastEventRow {
  return {
    id: "id",
    kind: "MATCH_STATE_CHANGED",
    priority: 40,
    status: "queued",
    payload: {},
    expiresAt: null,
    createdAt: "2027-01-06T12:00:00Z",
    ...overrides,
  };
}

test("sortQueueRows orders by priority descending", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  const low = row({ id: "low", priority: 40 });
  const high = row({ id: "high", priority: 70 });
  assert.deepEqual(sortQueueRows([low, high], now).map((r) => r.id), ["high", "low"]);
});

test("sortQueueRows breaks priority ties by created_at ascending", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  const later = row({ id: "later", createdAt: "2027-01-06T11:59:00Z" });
  const earlier = row({ id: "earlier", createdAt: "2027-01-06T11:58:00Z" });
  assert.deepEqual(sortQueueRows([later, earlier], now).map((r) => r.id), ["earlier", "later"]);
});

test("sortQueueRows excludes expired rows", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  const expired = row({ id: "expired", expiresAt: "2027-01-06T11:00:00Z" });
  const active = row({ id: "active", expiresAt: "2027-01-06T13:00:00Z" });
  assert.deepEqual(sortQueueRows([expired, active], now).map((r) => r.id), ["active"]);
});

test("sortQueueRows only includes queued/ready rows", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  const pending = row({ id: "pending", status: "pending" });
  const queued = row({ id: "queued", status: "queued" });
  const ready = row({ id: "ready", status: "ready" });
  const played = row({ id: "played", status: "played" });
  assert.deepEqual(sortQueueRows([pending, queued, ready, played], now).map((r) => r.id).sort(), ["queued", "ready"]);
});

test("sortQueueRows applies aging: a long-waiting lower base-priority row can overtake a fresher higher base-priority one", () => {
  const now = new Date("2027-01-06T12:30:00Z");
  const fresh = row({ id: "fresh", priority: 45, createdAt: "2027-01-06T12:29:00Z" }); // 1 min waited -> 47
  const aged = row({ id: "aged", priority: 40, createdAt: "2027-01-06T12:00:00Z" }); // 30 min waited -> +30 capped -> 70
  assert.deepEqual(sortQueueRows([fresh, aged], now).map((r) => r.id), ["aged", "fresh"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/broadcast/queue.test.ts`
Expected: FAIL — `Cannot find module './queue.ts'`

- [ ] **Step 3: Implement**

Create `lib/broadcast/queue.ts`:

```ts
// lib/broadcast/queue.ts
//
// The single "next in queue" query (master spec §12): active rows for a
// season, ordered by effective (aged) priority desc, then created_at asc.
// sortQueueRows is pure/testable; getNextInQueue is the thin I/O wrapper —
// unused by any caller until Phase 4 reads the queue, written now so that
// phase doesn't redefine ordering a second time. Server-only (getNextInQueue
// pulls in @/lib/supabase/server via next/headers, same rule as
// lib/broadcast/state.ts).
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { effectivePriority } from "./priority";
import type { BroadcastEventKind, BroadcastEventStatus } from "./types";

export interface BroadcastEventRow {
  id: string;
  kind: BroadcastEventKind;
  priority: number;
  status: BroadcastEventStatus;
  payload: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
}

/** Active (queued/ready), unexpired rows, ordered by aged priority desc then created_at asc. Pure — no I/O. */
export function sortQueueRows(rows: BroadcastEventRow[], now: Date): BroadcastEventRow[] {
  return rows
    .filter((row) => (row.status === "queued" || row.status === "ready") && (!row.expiresAt || new Date(row.expiresAt) > now))
    .sort((a, b) => {
      const diff = effectivePriority(b.priority, b.createdAt, now) - effectivePriority(a.priority, a.createdAt, now);
      return diff !== 0 ? diff : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

export async function getNextInQueue(seasonYear: number): Promise<BroadcastEventRow[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("broadcast_events")
    .select("id, kind, priority, status, payload, expires_at, created_at")
    .eq("season_year", seasonYear)
    .in("status", ["queued", "ready"]);

  if (error) {
    console.error("broadcast_events queue read failed:", error.message);
    return [];
  }

  const rows: BroadcastEventRow[] = (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as BroadcastEventKind,
    priority: r.priority,
    status: r.status as BroadcastEventStatus,
    payload: r.payload as Record<string, unknown>,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
  return sortQueueRows(rows, new Date());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/broadcast/queue.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/broadcast/queue.ts lib/broadcast/queue.test.ts
git commit -m "feat(broadcast): queue ordering (priority desc, aged, unexpired)"
```

---

## Task 7: `publishBroadcastEvent`

**Files:**
- Create: `lib/broadcast/publish.ts`

**Interfaces:**
- Consumes: all five rule functions from `@/lib/broadcast/rules` (Task 5); `RawBroadcastEvent` from `@/lib/broadcast/types` (Task 2).
- Produces: `publishBroadcastEvent(event: RawBroadcastEvent): Promise<void>` — used by Task 8 (stroke route) and Task 9 (rounds/start route). No dedicated test file — I/O-touching module, matching this repo's existing convention for `lib/broadcast/state.ts` etc. (see Global Constraints).

- [ ] **Step 1: Implement**

Create `lib/broadcast/publish.ts`:

```ts
// lib/broadcast/publish.ts
//
// publishBroadcastEvent() — called once from each write path, after the
// underlying write already succeeded (master spec §10/§32). Classifies via
// rules.ts, dedups against an existing pending/queued row for the same
// kind + identifying columns (master spec §13), inserts/updates
// broadcast_events. Server-only.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { matchStateChangedRule, matchWonRule, roundFinalRule, roundStartedRule, scorePostedRule } from "./rules";
import type { BroadcastEventDraft, RawBroadcastEvent } from "./types";

function draftFor(event: RawBroadcastEvent, now: Date): BroadcastEventDraft {
  switch (event.kind) {
    case "SCORE_POSTED":
      return scorePostedRule(event, now);
    case "MATCH_STATE_CHANGED":
      return matchStateChangedRule(event, now);
    case "MATCH_WON":
      return matchWonRule(event, now);
    case "ROUND_STARTED":
      return roundStartedRule(event, now);
    case "ROUND_FINAL":
      return roundFinalRule(event, now);
  }
}

interface EventColumns {
  matchBoxId: string | null;
  playerSlug: string | null;
  round: number | null;
  hole: number | null;
}

function columnsFor(event: RawBroadcastEvent): EventColumns {
  switch (event.kind) {
    case "SCORE_POSTED":
      return { matchBoxId: event.matchBoxId, playerSlug: event.playerSlug, round: event.round, hole: event.hole };
    case "MATCH_STATE_CHANGED":
    case "MATCH_WON":
      return { matchBoxId: event.matchBoxId, playerSlug: null, round: event.round, hole: null };
    case "ROUND_STARTED":
    case "ROUND_FINAL":
      return { matchBoxId: null, playerSlug: null, round: event.round, hole: null };
  }
}

/**
 * Dedup filter columns per kind (master spec §13): a player-level event
 * dedups on player+round+hole; a match-level event dedups on the box; a
 * round-level event dedups on the round. Returned as [column, value] pairs
 * so publishBroadcastEvent can chain .eq() for however many apply.
 */
function dedupFilters(event: RawBroadcastEvent): [string, string | number][] {
  switch (event.kind) {
    case "SCORE_POSTED":
      return [["player_slug", event.playerSlug], ["round", event.round], ["hole", event.hole]];
    case "MATCH_STATE_CHANGED":
    case "MATCH_WON":
      return [["match_box_id", event.matchBoxId]];
    case "ROUND_STARTED":
    case "ROUND_FINAL":
      return [["round", event.round]];
  }
}

export async function publishBroadcastEvent(event: RawBroadcastEvent): Promise<void> {
  const now = new Date();
  const draft = draftFor(event, now);
  const columns = columnsFor(event);
  const service = createSupabaseServiceRoleClient();

  let existingId: string | null = null;
  let query = service
    .from("broadcast_events")
    .select("id")
    .eq("season_year", event.seasonYear)
    .eq("kind", event.kind)
    .in("status", ["pending", "queued"]);
  for (const [column, value] of dedupFilters(event)) {
    query = query.eq(column, value);
  }
  const { data: existing } = await query.maybeSingle();
  existingId = existing?.id ?? null;

  const row = {
    season_year: event.seasonYear,
    kind: event.kind,
    priority: draft.priority,
    status: draft.status,
    payload: draft.payload,
    match_box_id: columns.matchBoxId,
    player_slug: columns.playerSlug,
    round: columns.round,
    hole: columns.hole,
    source: "system",
    expires_at: draft.expiresAt,
    updated_at: now.toISOString(),
  };

  if (existingId) {
    await service.from("broadcast_events").update(row).eq("id", existingId);
  } else {
    await service.from("broadcast_events").insert(row);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/broadcast/publish.ts
git commit -m "feat(broadcast): publishBroadcastEvent (classify, dedup, write)"
```

---

## Task 8: Wire into the score-write route

**Files:**
- Modify: `app/api/portal/scoring/stroke/route.ts`

**Interfaces:**
- Consumes: `buildLiveTournamentSnapshot` (existing, `@/lib/broadcast/liveSnapshot`); `matchBoxResult`, `roundIsComplete` (existing, `@/lib/live/orchestration`); `detectMatchBoxEvent`, `detectRoundFinal` (Task 4); `publishBroadcastEvent` (Task 7).
- Produces: nothing new for later tasks — this is a leaf wiring task.

- [ ] **Step 1: Add the imports**

In `app/api/portal/scoring/stroke/route.ts`, add to the existing import block (after the existing `canScoreStrokesFor, scoresAgree` import line):

```ts
import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { detectMatchBoxEvent, detectRoundFinal } from "@/lib/broadcast/matchEvents";
import { publishBroadcastEvent } from "@/lib/broadcast/publish";
```

- [ ] **Step 2: Capture the "before" snapshot, right before the write loop**

The existing code (`app/api/portal/scoring/stroke/route.ts:97`) reads:

```ts
  if (!canScoreStrokesFor(box, player.playerSlug, targetPlayerSlugs)) {
    return NextResponse.json({ ok: false, error: "You're not the assigned scorer for that player." }, { status: 403 });
  }

  for (const target of targetPlayerSlugs as string[]) {
```

Change it to:

```ts
  if (!canScoreStrokesFor(box, player.playerSlug, targetPlayerSlugs)) {
    return NextResponse.json({ ok: false, error: "You're not the assigned scorer for that player." }, { status: 403 });
  }

  let beforeSnapshot: Awaited<ReturnType<typeof buildLiveTournamentSnapshot>> | null = null;
  try {
    beforeSnapshot = await buildLiveTournamentSnapshot(seasonYear);
  } catch (err) {
    console.error("broadcast: could not read pre-write snapshot:", err);
  }

  for (const target of targetPlayerSlugs as string[]) {
```

- [ ] **Step 3: Publish after the write loop completes**

The existing code ends with:

```ts
  return NextResponse.json({ ok: true });
}
```

Change it to:

```ts
  try {
    for (const target of targetPlayerSlugs as string[]) {
      await publishBroadcastEvent({ kind: "SCORE_POSTED", seasonYear, playerSlug: target, round, hole, score, matchBoxId: box.id });
    }

    if (beforeSnapshot) {
      const afterSnapshot = await buildLiveTournamentSnapshot(seasonYear);
      const boxEvent = detectMatchBoxEvent(matchBoxResult(beforeSnapshot, box), matchBoxResult(afterSnapshot, box), box.id, seasonYear, round);
      if (boxEvent) await publishBroadcastEvent(boxEvent);

      const roundFinalEvent = detectRoundFinal(
        roundIsComplete(beforeSnapshot, round, box.format),
        roundIsComplete(afterSnapshot, round, box.format),
        seasonYear,
        round
      );
      if (roundFinalEvent) await publishBroadcastEvent(roundFinalEvent);
    }
  } catch (err) {
    console.error("broadcast publish failed:", err);
  }

  return NextResponse.json({ ok: true });
}
```

Also add `matchBoxResult` and `roundIsComplete` to the existing `@/lib/live/orchestration` import (it currently imports `canScoreStrokesFor, scoresAgree` from there):

```ts
import { canScoreStrokesFor, matchBoxResult, roundIsComplete, scoresAgree } from "@/lib/live/orchestration";
```

- [ ] **Step 4: Verify the existing test still passes and the route typechecks**

Run: `npx tsx --test app/api/portal/scoring/stroke/route.test.ts`
Expected: PASS (unchanged — this route gains a broadcast side effect, not a new auth path).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/scoring/stroke/route.ts
git commit -m "feat(broadcast): publish SCORE_POSTED/MATCH_STATE_CHANGED/MATCH_WON/ROUND_FINAL from stroke route"
```

---

## Task 9: Wire into the round-start route

**Files:**
- Modify: `app/api/portal/tiger/rounds/start/route.ts`

**Interfaces:**
- Consumes: `publishBroadcastEvent` (Task 7).
- Produces: nothing new for later tasks — this is a leaf wiring task.

- [ ] **Step 1: Add the import**

In `app/api/portal/tiger/rounds/start/route.ts`, add after the existing `isValidSeasonYear` import:

```ts
import { publishBroadcastEvent } from "@/lib/broadcast/publish";
```

- [ ] **Step 2: Publish after both existing writes succeed**

The existing code ends with:

```ts
  const { error: boxesError } = await service.from("live_match_boxes").update({ started: true }).eq("season_year", year).eq("round", round);
  if (boxesError) {
    return NextResponse.json({ ok: false, error: "Round was marked started, but could not open its match boxes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

Change it to:

```ts
  const { error: boxesError } = await service.from("live_match_boxes").update({ started: true }).eq("season_year", year).eq("round", round);
  if (boxesError) {
    return NextResponse.json({ ok: false, error: "Round was marked started, but could not open its match boxes." }, { status: 500 });
  }

  try {
    await publishBroadcastEvent({ kind: "ROUND_STARTED", seasonYear: year, round });
  } catch (err) {
    console.error("broadcast publish failed:", err);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify the existing test still passes and the route typechecks**

Run: `npx tsx --test app/api/portal/tiger/rounds/start/route.test.ts`
Expected: PASS (unchanged).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/tiger/rounds/start/route.ts
git commit -m "feat(broadcast): publish ROUND_STARTED from rounds/start route"
```

---

## Task 10: Full verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every new file from Tasks 3-6 and the two unchanged route tests from Tasks 8-9.

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three exit 0.

- [ ] **Step 3: Manual production migration (only after this is merged)**

Paste Task 1's SQL block into the Supabase SQL Editor in production — same manual step every prior Tiger Center phase has used (see [[tiger-center-build-phasing]]). Confirm `broadcast_events` exists by querying it (`select * from broadcast_events limit 1;` — empty result is fine, it just needs to exist without erroring).

- [ ] **Step 4: Manual walkthrough (acceptance criteria from the spec)**

With a live/dev round set up: submit a hole score that doesn't change any match's leader/margin/holesRemaining and doesn't finish a round — confirm exactly one new `broadcast_events` row, `kind = 'SCORE_POSTED'`, `priority = 10`, `status = 'pending'`. Submit a score that shifts a match's margin without closing it — confirm a second row, `kind = 'MATCH_STATE_CHANGED'`, `priority = 40`, `status = 'queued'`. Submit the score that closes a match out early (before 18 holes) — confirm `kind = 'MATCH_WON'`, `priority = 70`, `status = 'queued'`, and no accompanying `MATCH_STATE_CHANGED` for that same submission. Start a round — confirm `kind = 'ROUND_STARTED'`, `priority = 0`. Open `/broadcast` and `/portal/admin/broadcast-controls` before and after all of the above — confirm nothing looks different on screen.

- [ ] **Step 5: Update phasing memory**

This isn't a code step — after this phase is verified working, update the [[watch-live-broadcast-spec]] memory file (and `docs/superpowers/specs/2026-09-02-watch-live-broadcast-design.md`'s §44 Phase 2 entry) to say Phase 2 is shipped, the same way Phase 1's entries were corrected earlier — so a future session doesn't have to rediscover this from `git log` the way this one did for Phase 1.
