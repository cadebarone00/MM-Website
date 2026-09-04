# Watch Live Broadcast — Phase 4a (Overlay/Takeover UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MATCH_STATE_CHANGED` events (already being produced by Phase 2) show as a lower-third banner over the current scene; `MATCH_WON`/`ROUND_FINAL` events take over the full screen, pausing rotation, then rotation resumes.

**Architecture:** `GET /api/broadcast` gains one field (`events`, from Phase 2's already-built `getNextInQueue()`). A new client hook mirrors the exact Realtime-then-refetch pattern `useLiveBroadcastState.ts` already uses, tracks "already shown" event ids in a ref (no DB writes), and picks the next one to display via a pure, unit-tested selection function. Two new presentational components render it; `SceneRenderer` freezes its existing rotation timer while a takeover is active.

**Tech Stack:** Next.js 16 Route Handlers, Supabase Postgres + Realtime, TypeScript, React 19, Tailwind CSS 4, `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-04-broadcast-overlay-takeover-design.md` (also assumes `docs/superpowers/specs/2026-09-04-broadcast-event-queue-design.md`, already built — this plan only reads from what that phase produced, never modifies it).

## Global Constraints

- No DB writes beyond the one schema column this plan adds. "Has this event been shown" lives client-side only (an in-memory `Set`, never persisted) — per the spec's explicit choice to avoid inventing a public write endpoint.
- Display mode is a fixed per-kind lookup, never inferred from priority number: `MATCH_STATE_CHANGED` → `"overlay"`, `MATCH_WON`/`ROUND_FINAL` → `"takeover"`. `SCORE_POSTED`/`ROUND_STARTED` never reach display code (they're always `status: "pending"`, and `getNextInQueue` only returns `"queued"`/`"ready"` rows).
- Preview mode (`/broadcast?preview=1&...`, Broadcast Controls' rehearsal iframe) never shows real queued events — same `enabled`-style gate every other live-data hook in this codebase already uses.
- Match this repo's existing conventions exactly: hand-maintained `supabase/schema.sql` (manual paste into the Supabase SQL Editor in production — no migration tool), `tsx --test` for pure logic, no automated tests for hooks that touch Supabase Realtime/timers (`useAutoScene.ts`, `useLiveBroadcastState.ts`, `useLiveBroadcastData.ts` — none have test files; `useBroadcastQueue.ts` follows the same convention).
- `season_year between 2027 and 2034` on any new/touched column, matching every other table.

---

## Task 1: Schema — takeover display duration

**Files:**
- Modify: `supabase/schema.sql` (append after the current end of file)

**Interfaces:**
- Produces: `broadcast_config.takeover_duration_ms` column — used by Task 3's `getBroadcastPayload()` mapping.

- [ ] **Step 1: Append the column**

Append to the end of `supabase/schema.sql`:

```sql

-- === Watch Live Broadcast: Phase 4a (Overlay/Takeover UI) =================
-- See docs/superpowers/specs/2026-09-04-broadcast-overlay-takeover-design.md.
-- overlay_duration_ms already exists (Phase 1) — this is its takeover-class
-- counterpart, same shape.
alter table broadcast_config add column if not exists takeover_duration_ms integer not null default 8000;
```

- [ ] **Step 2: Sanity-check**

Run: `grep -c "takeover_duration_ms integer not null default 8000" supabase/schema.sql`
Expected: `1`

No local Postgres to apply this against — it gets pasted into the Supabase SQL Editor in production once this task is merged (Task 10 records this as a follow-up step, same as every prior phase).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(broadcast): add takeover_duration_ms config column"
```

---

## Task 2: Types — config durations and payload events field

**Files:**
- Modify: `lib/broadcast/types.ts`

**Interfaces:**
- Consumes: `BroadcastEventRow` from `@/lib/broadcast/queue` (existing, Phase 2) — imported as a type-only import; this creates a type-only circular reference with `queue.ts` (which already imports types from this file), which TypeScript resolves fine at compile time (erased before runtime, no circularity risk) — do not "fix" this by moving `BroadcastEventRow` into this file instead.
- Produces: `BroadcastConfig.overlayDurationMs: number`, `BroadcastConfig.takeoverDurationMs: number`, `BroadcastPayload.events: BroadcastEventRow[]` — every later task that builds a `BroadcastPayload` or reads `BroadcastConfig` uses these exact field names.

- [ ] **Step 1: Add the import and extend the two interfaces**

In `lib/broadcast/types.ts`, add near the top (after the existing imports, if any — this file currently has none, so add it as the first line):

```ts
import type { BroadcastEventRow } from "./queue";
```

Then change:

```ts
export interface BroadcastConfig {
  seasonYear: number;
  sceneDurationsMs: Record<BroadcastScene, number>;
}

export interface BroadcastPayload {
  seasonYear: number;
  state: BroadcastState;
  config: BroadcastConfig;
}
```

to:

```ts
export interface BroadcastConfig {
  seasonYear: number;
  sceneDurationsMs: Record<BroadcastScene, number>;
  overlayDurationMs: number;
  takeoverDurationMs: number;
}

export interface BroadcastPayload {
  seasonYear: number;
  state: BroadcastState;
  config: BroadcastConfig;
  events: BroadcastEventRow[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors — `lib/broadcast/state.ts` and `app/broadcast/page.tsx` no longer satisfy the widened interfaces. **This is expected** — Task 3 fixes both. Confirm the errors are exactly in those two files and nowhere else, then move on (do not fix them in this task).

- [ ] **Step 3: Commit**

```bash
git add lib/broadcast/types.ts
git commit -m "feat(broadcast): widen BroadcastConfig/BroadcastPayload for overlay/takeover durations and events"
```

---

## Task 3: Wire config durations and events into the real payload + preview payload

**Files:**
- Modify: `lib/broadcast/state.ts`
- Modify: `app/broadcast/page.tsx`

**Interfaces:**
- Consumes: `getNextInQueue` from `@/lib/broadcast/queue` (existing, Phase 2); `BroadcastConfig`/`BroadcastPayload`'s widened shape (Task 2).
- Produces: `getBroadcastPayload()` now returns a fully valid `BroadcastPayload` per Task 2's interface — every later task that calls it (indirectly, via `app/broadcast/page.tsx`) gets `events`/`overlayDurationMs`/`takeoverDurationMs` populated.

- [ ] **Step 1: Extend `getBroadcastPayload()`**

In `lib/broadcast/state.ts`, add the import:

```ts
import { getNextInQueue } from "@/lib/broadcast/queue";
```

Change the config query and the `Promise.all` (currently):

```ts
  const [{ data: stateRow, error: stateError }, { data: configRow, error: configError }] = await Promise.all([
    service
      .from("broadcast_state")
      .select("current_scene, scene_started_at, automation_mode, paused, tournament_live, overlay_text, overlay_expires_at")
      .eq("season_year", seasonYear)
      .maybeSingle(),
    service.from("broadcast_config").select("scene_durations_ms").eq("season_year", seasonYear).maybeSingle(),
  ]);
```

to:

```ts
  const [{ data: stateRow, error: stateError }, { data: configRow, error: configError }, events] = await Promise.all([
    service
      .from("broadcast_state")
      .select("current_scene, scene_started_at, automation_mode, paused, tournament_live, overlay_text, overlay_expires_at")
      .eq("season_year", seasonYear)
      .maybeSingle(),
    service.from("broadcast_config").select("scene_durations_ms, overlay_duration_ms, takeover_duration_ms").eq("season_year", seasonYear).maybeSingle(),
    getNextInQueue(seasonYear),
  ]);
```

Then change the `config` construction (currently):

```ts
  const config: BroadcastConfig = {
    seasonYear,
    sceneDurationsMs: { ...DEFAULT_SCENE_DURATIONS_MS, ...(configRow?.scene_durations_ms ?? {}) },
  };

  return { seasonYear, state, config };
```

to:

```ts
  const config: BroadcastConfig = {
    seasonYear,
    sceneDurationsMs: { ...DEFAULT_SCENE_DURATIONS_MS, ...(configRow?.scene_durations_ms ?? {}) },
    overlayDurationMs: configRow?.overlay_duration_ms ?? 6000,
    takeoverDurationMs: configRow?.takeover_duration_ms ?? 8000,
  };

  return { seasonYear, state, config, events };
```

- [ ] **Step 2: Fix the preview payload**

In `app/broadcast/page.tsx`, change `previewPayload()`'s return (currently):

```ts
    config: { seasonYear: year, sceneDurationsMs: DEFAULT_SCENE_DURATIONS_MS },
  };
```

to:

```ts
    config: { seasonYear: year, sceneDurationsMs: DEFAULT_SCENE_DURATIONS_MS, overlayDurationMs: 6000, takeoverDurationMs: 8000 },
    events: [],
  };
```

`events: []` is not just a compile fix — it's correct behavior: preview mode must never show a real queued takeover (spec's Edge Cases section).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — the two failures from Task 2 are now fixed, and no new ones introduced.

- [ ] **Step 4: Commit**

```bash
git add lib/broadcast/state.ts app/broadcast/page.tsx
git commit -m "feat(broadcast): populate overlay/takeover durations and events in the real and preview payloads"
```

---

## Task 4: Pure event-display logic

**Files:**
- Create: `lib/broadcast/eventDisplay.ts`
- Test: `lib/broadcast/eventDisplay.test.ts`

**Interfaces:**
- Consumes: `BroadcastEventRow` from `@/lib/broadcast/queue` (existing); `BroadcastEventKind`, `BroadcastTeam` from `@/lib/broadcast/types` (existing).
- Produces: `BroadcastEventDisplayMode` (`"overlay" | "takeover"`), `ActiveBroadcastEvent` interface (`{id, kind, displayMode, payload}`), `DISPLAY_MODE_BY_KIND`, `pickActiveEvent(events, shownIds): ActiveBroadcastEvent | null`, `marginLabel(margin: number): string`, `closedMarginLabel(margin: number, holesRemaining: number): string`, `teamLabel(team: BroadcastTeam | "tie"): string` — all used by Task 6 (`useBroadcastQueue`), Task 7 (`EventOverlay`), and Task 8 (`EventTakeover`).

- [ ] **Step 1: Write the failing tests**

Create `lib/broadcast/eventDisplay.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { closedMarginLabel, DISPLAY_MODE_BY_KIND, marginLabel, pickActiveEvent, teamLabel, type ActiveBroadcastEvent } from "./eventDisplay.ts";
import type { BroadcastEventRow } from "./queue.ts";

function row(overrides: Partial<BroadcastEventRow>): BroadcastEventRow {
  return {
    id: "id-1",
    kind: "MATCH_STATE_CHANGED",
    priority: 40,
    status: "queued",
    payload: {},
    expiresAt: null,
    createdAt: "2027-01-06T12:00:00Z",
    ...overrides,
  };
}

test("DISPLAY_MODE_BY_KIND maps exactly the two visible kinds, nothing else", () => {
  assert.deepEqual(DISPLAY_MODE_BY_KIND, {
    MATCH_STATE_CHANGED: "overlay",
    MATCH_WON: "takeover",
    ROUND_FINAL: "takeover",
  });
});

test("pickActiveEvent returns the first row with a known display mode", () => {
  const events = [row({ id: "a", kind: "MATCH_WON" })];
  const result = pickActiveEvent(events, new Set());
  assert.deepEqual(result, { id: "a", kind: "MATCH_WON", displayMode: "takeover", payload: {} });
});

test("pickActiveEvent skips ids already in the shown set", () => {
  const events = [row({ id: "a", kind: "MATCH_STATE_CHANGED" }), row({ id: "b", kind: "MATCH_WON" })];
  const result = pickActiveEvent(events, new Set(["a"]));
  assert.equal(result?.id, "b");
});

test("pickActiveEvent skips a kind with no known display mode and warns, rather than crashing", () => {
  const events = [row({ id: "a", kind: "SCORE_POSTED" }), row({ id: "b", kind: "MATCH_STATE_CHANGED" })];
  const result = pickActiveEvent(events, new Set());
  assert.equal(result?.id, "b");
});

test("pickActiveEvent returns null when every row is shown or unrecognized", () => {
  const events = [row({ id: "a", kind: "SCORE_POSTED" })];
  assert.equal(pickActiveEvent(events, new Set()), null);
});

test("pickActiveEvent returns null on an empty list", () => {
  assert.equal(pickActiveEvent([], new Set()), null);
});

test("marginLabel: AS at zero, N UP otherwise", () => {
  assert.equal(marginLabel(0), "AS");
  assert.equal(marginLabel(1), "1 UP");
  assert.equal(marginLabel(3), "3 UP");
});

test("closedMarginLabel: N & M when the match closed early (margin > holesRemaining)", () => {
  assert.equal(closedMarginLabel(3, 2), "3 & 2");
});

test("closedMarginLabel: N UP when the match closed exactly at the last playable hole", () => {
  assert.equal(closedMarginLabel(1, 0), "1 UP");
});

test("teamLabel maps maroon/white/tie", () => {
  assert.equal(teamLabel("maroon"), "Maroon");
  assert.equal(teamLabel("white"), "White");
  assert.equal(teamLabel("tie"), "Tie");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/broadcast/eventDisplay.test.ts`
Expected: FAIL — `Cannot find module './eventDisplay.ts'`

- [ ] **Step 3: Implement**

Create `lib/broadcast/eventDisplay.ts`:

```ts
// lib/broadcast/eventDisplay.ts
//
// Pure logic for deciding what to show from the broadcast_events queue and
// how to word it. No I/O. See
// docs/superpowers/specs/2026-09-04-broadcast-overlay-takeover-design.md.
import type { BroadcastEventRow } from "./queue";
import type { BroadcastEventKind, BroadcastTeam } from "./types";

export type BroadcastEventDisplayMode = "overlay" | "takeover";

export interface ActiveBroadcastEvent {
  id: string;
  kind: BroadcastEventKind;
  displayMode: BroadcastEventDisplayMode;
  payload: Record<string, unknown>;
}

/**
 * Explicit per-kind lookup, never inferred from priority number (spec's
 * own instruction — priority is for queue ordering, not display
 * treatment). SCORE_POSTED/ROUND_STARTED are deliberately absent — they
 * never leave status "pending" (Phase 2's rules engine), so getNextInQueue
 * (status in queued/ready only) can never hand them to this function in
 * the first place; the absence here is a second line of defense, not the
 * only one.
 */
export const DISPLAY_MODE_BY_KIND: Partial<Record<BroadcastEventKind, BroadcastEventDisplayMode>> = {
  MATCH_STATE_CHANGED: "overlay",
  MATCH_WON: "takeover",
  ROUND_FINAL: "takeover",
};

/**
 * First not-yet-shown row with a known display mode. `events` is expected
 * already priority-sorted (getNextInQueue/sortQueueRows do that) — this
 * never re-sorts. A row whose kind isn't in DISPLAY_MODE_BY_KIND is
 * skipped with a console.warn rather than shown malformed or crashing —
 * see the spec's Edge Cases.
 */
export function pickActiveEvent(events: BroadcastEventRow[], shownIds: ReadonlySet<string>): ActiveBroadcastEvent | null {
  for (const event of events) {
    if (shownIds.has(event.id)) continue;
    const displayMode = DISPLAY_MODE_BY_KIND[event.kind];
    if (!displayMode) {
      console.warn(`broadcast: no display mode for event kind "${event.kind}" (id ${event.id}) — skipping.`);
      continue;
    }
    return { id: event.id, kind: event.kind, displayMode, payload: event.payload };
  }
  return null;
}

/** "AS" or "N UP" — an in-progress (not yet closed) match's status. */
export function marginLabel(margin: number): string {
  return margin === 0 ? "AS" : `${margin} UP`;
}

/**
 * "N & M" (closed early) or "N UP" (closed at the last playable hole) — a
 * CLOSED match's final result. Same formula components/broadcast/scenes/MatchPlayScene.tsx's
 * private statusLabel() already uses for the exact same distinction —
 * kept as a separate, exported, unit-tested function here rather than
 * importing that scene's private helper, since it isn't exported and this
 * module needs it independently testable.
 */
export function closedMarginLabel(margin: number, holesRemaining: number): string {
  return margin > holesRemaining ? `${margin} & ${holesRemaining}` : `${margin} UP`;
}

export function teamLabel(team: BroadcastTeam | "tie"): string {
  return team === "maroon" ? "Maroon" : team === "white" ? "White" : "Tie";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/broadcast/eventDisplay.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/broadcast/eventDisplay.ts lib/broadcast/eventDisplay.test.ts
git commit -m "feat(broadcast): pure event-display selection and label formatting"
```

---

## Task 5: `useBroadcastQueue` hook

**Files:**
- Create: `lib/broadcast/useBroadcastQueue.ts`

**Interfaces:**
- Consumes: `pickActiveEvent`, `ActiveBroadcastEvent` from `@/lib/broadcast/eventDisplay` (Task 4); `BroadcastEventRow` from `@/lib/broadcast/queue` (existing); `BroadcastConfig` from `@/lib/broadcast/types` (existing/Task 2); `createSupabaseBrowserClient` from `@/lib/supabase/client` (existing).
- Produces: `useBroadcastQueue(seasonYear: number, initialEvents: BroadcastEventRow[], config: BroadcastConfig, enabled?: boolean): ActiveBroadcastEvent | null` — used by Task 9 (`BroadcastStage`). No test file — matches this repo's convention for hooks touching Supabase Realtime/timers (Global Constraints).

- [ ] **Step 1: Implement**

Create `lib/broadcast/useBroadcastQueue.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { pickActiveEvent, type ActiveBroadcastEvent } from "./eventDisplay";
import type { BroadcastEventRow } from "./queue";
import type { BroadcastConfig } from "./types";

/**
 * Which broadcast_events row (if any) should be showing right now, and
 * drives it through its display duration and on to the next one — all
 * client-local, no DB writes (spec's explicit choice: "has this been
 * shown" lives in a ref, never persisted, same no-persistent-controller
 * philosophy as Phase 1's scene rotation). Realtime-then-refetch against
 * the same GET /api/broadcast endpoint every other broadcast hook already
 * uses — see lib/broadcast/useLiveBroadcastState.ts for the identical
 * shape this copies.
 *
 * Pass `enabled: false` for the Broadcast Controls rehearsal preview
 * (`/broadcast?preview=1`) — same convention useLiveBroadcastState.ts
 * already uses; a rehearsal must never show a real, currently-queued
 * takeover it isn't meant to represent.
 */
export function useBroadcastQueue(seasonYear: number, initialEvents: BroadcastEventRow[], config: BroadcastConfig, enabled = true): ActiveBroadcastEvent | null {
  const [events, setEvents] = useState(initialEvents);
  const shownIds = useRef<Set<string>>(new Set());
  const [bump, setBump] = useState(0);
  const [activeEvent, setActiveEvent] = useState<ActiveBroadcastEvent | null>(() => (enabled ? pickActiveEvent(initialEvents, shownIds.current) : null));

  // Realtime subscribe/refetch — identical shape to useLiveBroadcastState.ts.
  useEffect(() => {
    if (!enabled) return;

    async function reload() {
      try {
        const res = await fetch("/api/broadcast", { cache: "no-store" });
        if (res.ok) setEvents((await res.json()).events);
      } catch {
        // Stays on the last-known events until the next successful refresh.
      }
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn("Realtime env vars not set — /broadcast will only pick up new events on page load.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`broadcast-events-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_events", filter: `season_year=eq.${seasonYear}` }, reload)
      .subscribe();

    function onVisible() {
      if (document.visibilityState === "visible") reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reload);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reload);
    };
  }, [seasonYear, enabled]);

  // Re-pick whenever the event list changes (a Realtime-triggered refetch)
  // or a display-duration timer fires (bump) — never on its own timer.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: this IS the re-evaluation, same justification as useAutoScene.ts's tick().
    setActiveEvent(enabled ? pickActiveEvent(events, shownIds.current) : null);
  }, [events, bump, enabled]);

  // Display-duration timer for whatever's currently active. Deliberately
  // keyed on activeEvent?.id / activeEvent?.displayMode (stable
  // primitives), NOT on the activeEvent object itself: pickActiveEvent()
  // returns a fresh object literal on every call, so depending on the
  // object would restart this timer on every unrelated events refetch
  // (e.g. a routine SCORE_POSTED arriving via Realtime while a takeover is
  // already showing) instead of letting the display duration run to
  // completion.
  useEffect(() => {
    if (!enabled || !activeEvent) return;
    const durationMs = activeEvent.displayMode === "takeover" ? config.takeoverDurationMs : config.overlayDurationMs;
    const id = setTimeout(() => {
      shownIds.current.add(activeEvent.id);
      setBump((n) => n + 1);
    }, durationMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: activeEvent.id/displayMode are the real deps, not the activeEvent object.
  }, [enabled, activeEvent?.id, activeEvent?.displayMode, config.overlayDurationMs, config.takeoverDurationMs]);

  return activeEvent;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/broadcast/useBroadcastQueue.ts
git commit -m "feat(broadcast): useBroadcastQueue hook"
```

---

## Task 6: `EventOverlay` component

**Files:**
- Create: `components/broadcast/EventOverlay.tsx`

**Interfaces:**
- Consumes: `ActiveBroadcastEvent` from `@/lib/broadcast/eventDisplay` (Task 4); `marginLabel`, `teamLabel` from the same module; `BroadcastMatchPlay` from `@/lib/broadcast/matchPlayData` (existing).
- Produces: `EventOverlay({ event, matchPlay }: { event: ActiveBroadcastEvent | null; matchPlay: BroadcastMatchPlay })` — used by Task 9 (`SceneRenderer`).

- [ ] **Step 1: Implement**

Create `components/broadcast/EventOverlay.tsx`:

```tsx
import { marginLabel, teamLabel, type ActiveBroadcastEvent } from "@/lib/broadcast/eventDisplay";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import type { BroadcastTeam } from "@/lib/broadcast/types";

interface MatchStateChangedPayload {
  matchBoxId: string;
  round: number;
  leader: BroadcastTeam | "tie";
  margin: number;
  holesRemaining: number;
}

/**
 * Lower-third banner for a MATCH_STATE_CHANGED event — renders over
 * whatever scene is currently playing, never interrupts rotation. Looks up
 * the match box's names/number in the already-live matchPlay data rather
 * than fetching anything of its own (spec's Rendering section). Renders
 * nothing if the box can't be found (matchPlay hasn't caught up yet, or
 * the event isn't a MATCH_STATE_CHANGED at all) — a null render still
 * counts as "shown" by useBroadcastQueue's own timer, so the queue keeps
 * moving either way.
 */
export function EventOverlay({ event, matchPlay }: { event: ActiveBroadcastEvent | null; matchPlay: BroadcastMatchPlay }) {
  if (!event || event.displayMode !== "overlay") return null;

  const payload = event.payload as unknown as MatchStateChangedPayload;
  const box = matchPlay.matchBoxes.find((b) => b.id === payload.matchBoxId);
  if (!box) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-8 sm:pb-12">
      <div className="flex max-w-3xl items-center gap-4 rounded-lg bg-[color:var(--color-maroon-900)] px-6 py-3 shadow-xl ring-1 ring-[color:var(--color-gold-400)]/40">
        <span className="shrink-0 font-condensed text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">
          Match {box.boxNumber}
        </span>
        <span className="font-serif text-xl font-semibold text-white sm:text-2xl">
          {teamLabel(payload.leader)} {marginLabel(payload.margin)}
          {payload.holesRemaining > 0 ? `, ${payload.holesRemaining} to play` : ""}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/broadcast/EventOverlay.tsx
git commit -m "feat(broadcast): EventOverlay component (MATCH_STATE_CHANGED lower-third)"
```

---

## Task 7: `EventTakeover` component

**Files:**
- Create: `components/broadcast/EventTakeover.tsx`

**Interfaces:**
- Consumes: `ActiveBroadcastEvent` from `@/lib/broadcast/eventDisplay` (Task 4); `closedMarginLabel`, `teamLabel` from the same module; `BroadcastMatchPlay` from `@/lib/broadcast/matchPlayData` (existing).
- Produces: `EventTakeover({ event, matchPlay }: { event: ActiveBroadcastEvent | null; matchPlay: BroadcastMatchPlay })` — used by Task 9 (`SceneRenderer`).

- [ ] **Step 1: Implement**

Create `components/broadcast/EventTakeover.tsx`:

```tsx
import { closedMarginLabel, teamLabel, type ActiveBroadcastEvent } from "@/lib/broadcast/eventDisplay";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import type { BroadcastTeam } from "@/lib/broadcast/types";

interface MatchWonPayload {
  matchBoxId: string;
  round: number;
  leader: BroadcastTeam | "tie";
  margin: number;
  maroonPts: number;
  whitePts: number;
}

interface RoundFinalPayload {
  round: number;
}

/**
 * Full-bleed graphic for MATCH_WON/ROUND_FINAL — SceneRenderer renders
 * this INSTEAD OF the rotating scene while it's active (rotation is
 * frozen for the duration, see SceneRenderer.tsx). For MATCH_WON, looks
 * up the box in the already-live matchPlay data for its number/names AND
 * its live margin/holesRemaining — closedMarginLabel() reproduces exactly
 * what MatchPlayScene.tsx's private statusLabel() already shows for a
 * Final box ("3 & 2" for an early closeout, "1 UP" for one that went the
 * distance), sourced from matchPlay rather than the event payload itself
 * (Phase 2's MATCH_WON payload doesn't carry holesRemaining — see the
 * spec's correction note). Renders nothing if the box can't be found, same
 * as EventOverlay.
 */
export function EventTakeover({ event, matchPlay }: { event: ActiveBroadcastEvent | null; matchPlay: BroadcastMatchPlay }) {
  if (!event || event.displayMode !== "takeover") return null;

  if (event.kind === "ROUND_FINAL") {
    const payload = event.payload as unknown as RoundFinalPayload;
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-maroon px-10 py-10">
        <div className="w-full max-w-[900px] rounded-2xl bg-[color:var(--color-cream-50)] px-10 py-16 text-center shadow-2xl ring-1 ring-[color:var(--color-gold-400)]/40">
          <p className="font-serif text-2xl italic text-[color:var(--color-maroon-700)]">The Maroon Masters</p>
          <p className="mt-6 font-condensed text-5xl font-bold uppercase tracking-wide text-[color:var(--color-maroon-900)]">Round {payload.round} Complete</p>
        </div>
      </div>
    );
  }

  const payload = event.payload as unknown as MatchWonPayload;
  const box = matchPlay.matchBoxes.find((b) => b.id === payload.matchBoxId);
  if (!box) return null;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-maroon px-10 py-10">
      <div className="w-full max-w-[900px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-[color:var(--color-gold-400)]/40">
        <div className="bg-[color:var(--color-cream-50)] px-8 pb-5 pt-7 text-center">
          <p className="font-serif text-2xl italic text-[color:var(--color-maroon-700)]">The Maroon Masters</p>
          <div className="mx-auto mt-3 h-px w-24 bg-[color:var(--color-gold-400)]" />
        </div>
        <div className="bg-gradient-trophy px-8 py-10 text-center">
          <p className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-maroon-900)]/70">Match {box.boxNumber}</p>
          <p className="mt-3 font-condensed text-5xl font-bold uppercase tracking-wide text-[color:var(--color-maroon-900)]">
            {teamLabel(box.leader)} Wins {closedMarginLabel(box.margin, box.holesRemaining)}
          </p>
          <p className="mt-4 font-sans text-lg text-[color:var(--color-maroon-900)]/80">
            {box.maroonNames.join(" / ")} vs. {box.whiteNames.join(" / ")}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/broadcast/EventTakeover.tsx
git commit -m "feat(broadcast): EventTakeover component (MATCH_WON/ROUND_FINAL full-screen)"
```

---

## Task 8: Wire into `SceneRenderer` and `BroadcastStage`

**Files:**
- Modify: `components/broadcast/SceneRenderer.tsx`
- Modify: `components/broadcast/BroadcastStage.tsx`

**Interfaces:**
- Consumes: `useBroadcastQueue` (Task 5); `EventOverlay` (Task 6); `EventTakeover` (Task 7); `ActiveBroadcastEvent` from `@/lib/broadcast/eventDisplay` (Task 4).
- Produces: nothing new for later tasks — this is the final wiring task.

- [ ] **Step 1: Update `SceneRenderer`**

In `components/broadcast/SceneRenderer.tsx`, add the import:

```ts
import type { ActiveBroadcastEvent } from "@/lib/broadcast/eventDisplay";
import { EventOverlay } from "./EventOverlay";
import { EventTakeover } from "./EventTakeover";
```

Add `activeEvent` to the props type and destructuring (currently):

```ts
export function SceneRenderer({
  state,
  config,
  standings,
  leaderboardFinal,
  matchPlay,
  holding,
}: {
  state: BroadcastState;
  config: BroadcastConfig;
  standings: BroadcastStanding[];
  leaderboardFinal: boolean;
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
}) {
```

to:

```ts
export function SceneRenderer({
  state,
  config,
  standings,
  leaderboardFinal,
  matchPlay,
  holding,
  activeEvent,
}: {
  state: BroadcastState;
  config: BroadcastConfig;
  standings: BroadcastStanding[];
  leaderboardFinal: boolean;
  matchPlay: BroadcastMatchPlay;
  holding: { venue: string; dateLabel: string };
  activeEvent: ActiveBroadcastEvent | null;
}) {
```

Change the rotation-enabled line (currently):

```ts
  const autoScene = useAutoScene(state.sceneStartedAt, config, isAuto);
```

to:

```ts
  // Freeze rotation while a takeover is showing — resumes from whatever
  // scene current elapsed time says should be playing once it ends (not
  // necessarily the one that was showing when the takeover began — see
  // the spec's Rendering section for why that's accepted, not a bug).
  const autoScene = useAutoScene(state.sceneStartedAt, config, isAuto && activeEvent?.displayMode !== "takeover");
```

Change the return block (currently):

```ts
  return (
    <>
      {scene === "individual_leaderboard" && <IndividualLeaderboardScene standings={standings} final={leaderboardFinal} />}
      {scene === "match_play" && <MatchPlayScene matchPlay={matchPlay} />}
      {scene === "holding" && <HoldingScene venue={holding.venue} dateLabel={holding.dateLabel} />}
      <OverlayLayer text={state.overlayText} expiresAt={state.overlayExpiresAt} />
    </>
  );
```

to:

```ts
  return (
    <>
      {activeEvent?.displayMode === "takeover" ? (
        <EventTakeover event={activeEvent} matchPlay={matchPlay} />
      ) : (
        <>
          {scene === "individual_leaderboard" && <IndividualLeaderboardScene standings={standings} final={leaderboardFinal} />}
          {scene === "match_play" && <MatchPlayScene matchPlay={matchPlay} />}
          {scene === "holding" && <HoldingScene venue={holding.venue} dateLabel={holding.dateLabel} />}
          <EventOverlay event={activeEvent} matchPlay={matchPlay} />
        </>
      )}
      <OverlayLayer text={state.overlayText} expiresAt={state.overlayExpiresAt} />
    </>
  );
```

- [ ] **Step 2: Update `BroadcastStage`**

In `components/broadcast/BroadcastStage.tsx`, add the import:

```ts
import { useBroadcastQueue } from "@/lib/broadcast/useBroadcastQueue";
```

Add the hook call and pass its result down. Currently:

```ts
  const { standings, leaderboardFinal, matchPlay } = useLiveBroadcastData(broadcast.seasonYear, {
    standings: initialStandings,
    leaderboardFinal: initialLeaderboardFinal,
    matchPlay: initialMatchPlay,
  });
  const state = useLiveBroadcastState(broadcast.seasonYear, broadcast.state, !preview);
  useReloadOnDisplayYearChange(broadcast.seasonYear, !preview);

  return (
    <SceneRenderer state={state} config={broadcast.config} standings={standings} leaderboardFinal={leaderboardFinal} matchPlay={matchPlay} holding={holding} />
  );
```

to:

```ts
  const { standings, leaderboardFinal, matchPlay } = useLiveBroadcastData(broadcast.seasonYear, {
    standings: initialStandings,
    leaderboardFinal: initialLeaderboardFinal,
    matchPlay: initialMatchPlay,
  });
  const state = useLiveBroadcastState(broadcast.seasonYear, broadcast.state, !preview);
  const activeEvent = useBroadcastQueue(broadcast.seasonYear, broadcast.events, broadcast.config, !preview);
  useReloadOnDisplayYearChange(broadcast.seasonYear, !preview);

  return (
    <SceneRenderer
      state={state}
      config={broadcast.config}
      standings={standings}
      leaderboardFinal={leaderboardFinal}
      matchPlay={matchPlay}
      holding={holding}
      activeEvent={activeEvent}
    />
  );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/broadcast/SceneRenderer.tsx components/broadcast/BroadcastStage.tsx
git commit -m "feat(broadcast): wire overlay/takeover UI into SceneRenderer and BroadcastStage"
```

---

## Task 9: Full verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the 11 new `eventDisplay.test.ts` tests.

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three exit 0. (If `npm run lint` reports pre-existing issues in files this plan never touched, confirm via `npx eslint lib/broadcast components/broadcast` scoped to just this plan's directories that those specific files are clean — same check Phase 2's verification used.)

- [ ] **Step 3: Manual production migration (only after this is merged)**

Paste Task 1's SQL line into the Supabase SQL Editor in production — same manual step every prior phase has used. Confirm `broadcast_config`'s existing rows have picked up the new `takeover_duration_ms` column with its default (`select season_year, takeover_duration_ms from broadcast_config;`).

- [ ] **Step 4: Manual walkthrough (acceptance criteria from the spec)**

With a live/dev round set up: submit a hole score that shifts a match's margin without closing it — confirm a lower-third banner appears over the current scene within a few seconds, without interrupting rotation, and disappears after `overlay_duration_ms` (6s default). Submit the score that closes a match early — confirm a full-screen takeover appears, the rotating scene underneath is frozen, and normal rotation resumes after `takeover_duration_ms` (8s default) without a manual refresh. Open two `/broadcast` tabs at once — confirm both show the same takeover within roughly a Realtime round-trip of each other. Confirm a routine score submission that doesn't change any match's state shows nothing at all. Open `/broadcast?preview=1&year=<a year>&scene=match_play` — confirm no real takeover/overlay ever appears there even if one is actively showing on the real `/broadcast`.

- [ ] **Step 5: Update phasing memory**

Not a code step — once verified working, update the [[watch-live-broadcast-spec]] memory and the master spec's Phase 4 status to say this first Phase 4 round (overlay/takeover UI) is shipped, and that birdie/eagle classification, hole-won/leader-change detection, and Tournament Winner remain as the next three sequenced rounds.
