# Watch Live Broadcast — Phase 4a: Overlay/Takeover UI

## Status

**Design only — nothing in this document has been built.** Per `CLAUDE.md`
Rule 2: no code until this file is reviewed and approved.

This is the first of four sequenced rounds under the master spec's Phase 4
("Production Graphics"), scoped 2026-09-04 by decomposing that phase rather
than building it as one spec (see [[watch-live-broadcast-spec]]). Build
order for the whole of Phase 4: **(1) this round — overlay/takeover UI for
the event kinds Phase 2 already produces**, (2) birdie/eagle/hole-in-one
classification, (3) hole-won + leader-change detection, (4) a host-triggered
Tournament Winner feature. Each gets its own spec → plan → build cycle.

This round makes Phase 2's `broadcast_events` queue visible for the first
time — until now it fills correctly but nothing on `/broadcast` reads it.

## Goal

`MATCH_STATE_CHANGED` events show as a lower-third banner over whatever
scene is already playing. `MATCH_WON`/`ROUND_FINAL` events take over the
full screen (pausing the rotating scene underneath) for a few seconds, then
rotation resumes. No new database writes beyond one small config column;
everything about "what's currently showing" and "have I already shown this"
lives client-side, matching Phase 1's no-persistent-controller philosophy.

## Data Flow

`GET /api/broadcast` (`app/api/broadcast/route.ts`, unchanged endpoint)
gets one addition: alongside `state`/`config`, it now also returns `events`
— the result of Phase 2's already-built `getNextInQueue(seasonYear)`
(`lib/broadcast/queue.ts`), which already does the priority/aging/expiry
filtering and sorting this needs. No new endpoint.

```
Host action or player score write (existing Phase 2 wiring)
  → broadcast_events row inserted/updated
  → Supabase Realtime fan-out on broadcast_events (already on the
    publication — added in Phase 2's schema migration)
  → every open /broadcast tab's new useBroadcastQueue hook refetches
    GET /api/broadcast, takes .events from the response
  → SceneRenderer decides: takeover, overlay, or normal rotation
```

This is the exact shape `useLiveBroadcastState.ts` already uses for
`broadcast_state` (Realtime subscription → refetch the same GET endpoint →
take one field off the response) — `useBroadcastQueue` copies that pattern
for `broadcast_events` instead of inventing a new one.

## Client State: What's Showing Right Now

New hook, `lib/broadcast/useBroadcastQueue.ts`:

```ts
export interface ActiveBroadcastEvent {
  id: string;
  kind: "MATCH_STATE_CHANGED" | "MATCH_WON" | "ROUND_FINAL";
  displayMode: "overlay" | "takeover";
  payload: Record<string, unknown>;
}

export function useBroadcastQueue(seasonYear: number, initialEvents: BroadcastEventRow[]): ActiveBroadcastEvent | null;
```

Behavior:
1. Subscribes to `broadcast_events` Realtime (`filter: season_year=eq.${seasonYear}`, same channel-per-concern convention as `useLiveBroadcastState`/`useLiveBroadcastData`), refetches `GET /api/broadcast` on any change, keeps `events` in local state.
2. Maintains an in-memory `Set<string>` of event IDs already shown this tab session (a plain `useRef`, not persisted — a fresh page load or tab is allowed to re-show something still in the active window, same as Phase 1's rotation resuming from server state on refresh rather than remembering exactly where it left off).
3. **Display-mode lookup is a fixed table, not inferred from priority**: `{MATCH_WON: "takeover", ROUND_FINAL: "takeover", MATCH_STATE_CHANGED: "overlay"}`. `SCORE_POSTED`/`ROUND_STARTED` never appear here — `getNextInQueue` already excludes `pending`-status rows (Phase 2's rules engine only ever gives those two kinds `status: "pending"`, never `"queued"`), so they can't reach this hook at all; the lookup table exists for clarity and to fail loudly (see Edge Cases) if that ever changes.
4. Picks the first item in `events` (already priority-sorted by `getNextInQueue`) whose `id` is not in the shown-set. That becomes the returned `ActiveBroadcastEvent`.
5. A `setTimeout` for that event's configured display duration (§ Config below) marks its `id` into the shown-set and re-evaluates step 4 against the current `events` array — moving to the next queued item if one exists, or returning to normal rotation (`null`) if not.
6. If the picked event's `id` disappears from a later `events` fetch (host cleared it, or — in a later phase — a host skipped it) before its timer fires, dismiss it immediately and re-evaluate, rather than waiting out a timer for content no longer meant to show.

## Config: Display Durations

`broadcast_config.overlay_duration_ms` already exists (Phase 1, default
`6000`) — reused as-is for `MATCH_STATE_CHANGED`'s on-screen duration. One
new column, matching that existing one's shape exactly:

```sql
alter table broadcast_config add column if not exists takeover_duration_ms integer not null default 8000;
```

`lib/broadcast/types.ts`'s `BroadcastConfig` interface gains
`takeoverDurationMs: number`, read the same way `overlayDurationMs` already
would be (checked: Phase 1 never actually added `overlayDurationMs` to the
TS interface despite the column existing in SQL — this round adds **both**
`overlayDurationMs` and `takeoverDurationMs` to the interface and to
`lib/broadcast/state.ts`'s `getBroadcastPayload()` mapping, since the
overlay one was always meant to be config-driven and this is the first
round that actually needs to read it).

## Rendering: Takeover Pauses Rotation, Overlay Doesn't

`components/broadcast/SceneRenderer.tsx` changes:

- Add `activeEvent: ActiveBroadcastEvent | null` as a prop (computed by
  `BroadcastStage` via the new hook, passed down — same data-flow shape as
  every other piece of broadcast state today).
- `useAutoScene`'s existing `enabled` param already exists for exactly this
  purpose (Producer Mode already uses it to freeze rotation) — pass
  `enabled={isAuto && activeEvent?.displayMode !== "takeover"}` instead of
  today's `enabled={isAuto}`. While a takeover is active, the rotation timer
  simply doesn't tick; `sceneAt()` is a pure function of elapsed real time
  (`lib/broadcast/rotation.ts`), so when the takeover ends and `enabled`
  flips back true, rotation resumes from whatever scene real elapsed time
  says should be showing now — **not** necessarily the scene that was
  showing when the takeover began. This mirrors how a real broadcast
  doesn't "rewind" programming after a cutaway; explicitly accepted, not a
  bug, and it's the only design that doesn't need a second persisted
  "paused-at" timestamp.
- Render order — `OverlayLayer` (the existing host-manual announcement) keeps its current unconditional placement at the end of `SceneRenderer`'s output, outside and after everything below; only the scene-vs-takeover choice is new:
  ```tsx
  {activeEvent?.displayMode === "takeover"
    ? <EventTakeover event={activeEvent} matchPlay={matchPlay} />
    : <>
        {/* existing scene === "..." && <...Scene /> block, unchanged */}
        <EventOverlay event={activeEvent} matchPlay={matchPlay} />
      </>}
  <OverlayLayer text={state.overlayText} expiresAt={state.overlayExpiresAt} />
  ```
  A host announcement and a system takeover are both allowed to want the
  screen; if a host posts an announcement during a system takeover it will
  visually stack (`OverlayLayer` is unconditional) — accepted as a rare,
  low-stakes host-caused overlap, not designed around further in this
  round.

## New Components

```
components/broadcast/
  EventOverlay.tsx    — lower-third banner for MATCH_STATE_CHANGED.
                         null-renders if activeEvent is null or its
                         displayMode isn't "overlay".
  EventTakeover.tsx   — full-bleed graphic for MATCH_WON/ROUND_FINAL.
                         null-renders if activeEvent is null or its
                         displayMode isn't "takeover".
```

Both need to turn a payload of raw ids/numbers into words. Neither hits the
network or Supabase for this — they're handed the already-fetched
`matchPlay: BroadcastMatchPlay` (from `lib/broadcast/matchPlayData.ts`,
already flowing into `SceneRenderer` today) and look up the box by id:

```ts
const box = matchPlay.matchBoxes.find((b) => b.id === payload.matchBoxId);
```

- **`EventOverlay` (`MATCH_STATE_CHANGED`)**: `box` found → `"${teamLabel(payload.leader)} ${marginLabel(payload.leader, payload.margin)}, ${payload.holesRemaining} to play"` alongside the box's player names (`box.maroonNames`/`box.whiteNames`) and `box.boxNumber`. `marginLabel`: `margin === 0` → `"AS"`, else `` `${margin} UP` ``. `box` not found (e.g. `matchPlay` hasn't loaded that round yet, or the box was since removed) → render nothing for this event rather than a broken banner; it still counts as "shown" once its timer elapses (§ Client State step 5), so the queue keeps moving.
- **`EventTakeover` (`MATCH_WON`/`ROUND_FINAL`)**: `MATCH_WON` → `box` found → `"${teamLabel(payload.leader)} wins — Match ${box.boxNumber}"` with player names below it. **Correction from initial drafting:** the natural golf notation ("3&2", "1 UP") needs `holesRemaining` at the moment the match closed, but Phase 2's `RawMatchWonEvent`/`matchWonRule` payload only carries `leader`/`margin`/`maroonPts`/`whitePts` — no `holesRemaining`. Rather than reopening already-shipped Phase 2 code for this round, the takeover text is scoped to what the payload actually has: team + box number + player names, no "N&M" detail. Full golf notation on the takeover graphic is a fine, small follow-up once this round proves the display mechanism works — not blocking it. `ROUND_FINAL` has no `matchBoxId` (round-scoped, per Phase 2's schema) — renders a simpler `"Round ${payload.round} complete"` graphic, no box lookup needed.
- Both full-bleed/lower-third visual treatments follow the site's existing maroon/white identity, matching `HoldingScene`/`MatchPlayScene`'s established broadcast styling — no new design system, reuse `components/ui/*` primitives already used elsewhere in `components/broadcast/scenes/`.

## Testing Strategy

Matches Phase 2's already-corrected convention for this codebase:

- **Pure logic gets real unit tests.** The "pick the next not-yet-shown
  event from a sorted list, respecting a shown-set" selection logic and the
  `marginLabel`/team-label formatting helpers are extracted as small pure
  functions (e.g. `lib/broadcast/eventDisplay.ts`: `pickActiveEvent(events,
  shownIds, displayModeFor)`, `marginLabel`, `teamLabel`) and unit-tested
  with `tsx --test`, no mocking — same as `lib/broadcast/matchEvents.ts`'s
  style. `useBroadcastQueue.ts` itself (the hook: Realtime subscription,
  timers, React state) stays thin and untested directly, matching this
  repo's existing convention that hooks touching Supabase/timers don't get
  unit tests (`useAutoScene.ts`, `useLiveBroadcastState.ts`,
  `useLiveBroadcastData.ts` — none have test files).
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Manual walkthrough (this phase's real acceptance test, same as Phase 1/2):
  open `/broadcast`, trigger a `MATCH_STATE_CHANGED` by submitting a score
  that shifts a match's margin — confirm a lower-third banner appears over
  the current scene without interrupting rotation, and disappears after
  `overlay_duration_ms`. Submit a score that closes a match early — confirm
  a full-screen takeover appears, rotation is frozen underneath, and normal
  rotation resumes after `takeover_duration_ms`. Open two `/broadcast` tabs
  at once — confirm both show the same takeover at roughly the same time
  (Realtime propagation delay only, matching Phase 1's §34 "effectively
  synchronized" standard — no frame-accurate sync attempted).

## Edge Cases

- **Two takeover-class events queue up close together** (a match closes,
  then the round finishes moments later): `useBroadcastQueue` shows them
  one after another (step 5's re-evaluation naturally picks the next
  not-yet-shown item) — never simultaneously, never stacked.
- **A `MATCH_STATE_CHANGED` event's box is renamed/removed mid-display**
  (shouldn't happen in normal play, but `matchPlay` is independently
  live-updating): `EventOverlay` re-renders on the next `matchPlay` refresh:
  if the box lookup starts failing mid-display, it degrades to rendering
  nothing rather than crashing, per the "box not found" behavior above.
- **A tab is backgrounded during a takeover, then refocused after the
  takeover's duration has passed**: `useLiveBroadcastData`'s existing
  `visibilitychange` refetch already covers this — a fresh `events` fetch
  on refocus reflects current reality; the local shown-set and timers are
  disposable per-tab state, never a source of truth.
- **`getNextInQueue` returns an event kind not in the display-mode lookup**
  (e.g. a future phase adds a new kind and its rule accidentally sets
  `status: "queued"`): treated as `displayMode: undefined` → never selected
  by `pickActiveEvent`, logged via `console.warn` once per unrecognized
  kind seen (cheap safety net, not a crash) rather than silently rendering
  something malformed.
- **Preview mode** (`/broadcast?preview=1&year=&scene=`, Broadcast
  Controls' rehearsal iframe): `useBroadcastQueue` is not called at all when
  `preview` is true — same `enabled`-style gate `useLiveBroadcastState`
  already uses — a rehearsal never shows a real, currently-queued takeover
  it isn't meant to represent.

## Migration

One column, same hand-maintained `supabase/schema.sql` + manual paste
convention as every prior phase:
`alter table broadcast_config add column if not exists takeover_duration_ms integer not null default 8000;`

## Acceptance Criteria

1. A `MATCH_STATE_CHANGED` event (already being produced by Phase 2)
   appears as a lower-third banner within a few seconds of the underlying
   score write, without interrupting the currently-rotating scene, and
   disappears on its own after `overlay_duration_ms`.
2. A `MATCH_WON` or `ROUND_FINAL` event takes over the full screen, freezes
   rotation for its duration, and rotation resumes afterward without a
   manual refresh.
3. Two `/broadcast` tabs open at once show the same takeover within roughly
   a Realtime round-trip of each other.
4. Nothing changes about `/broadcast`'s behavior when the queue is empty —
   identical to Phase 1/2's current behavior.
5. `SCORE_POSTED`/`ROUND_STARTED` rows (status `pending`) never appear as
   any kind of overlay or takeover — confirmed by code inspection
   (`getNextInQueue` already excludes non-`queued`/`ready` statuses) plus
   the manual walkthrough not showing anything on a routine score entry.

## Explicitly Out of Scope (this round)

Birdie/eagle/hole-in-one classification, `LEADER_CHANGED`/`HOLE_WON`
detection, a Tournament Winner scene, any host control over the queue
(Play Next/Skip/Clear — Phase 5), any change to the existing host-manual
announcement (`OverlayLayer.tsx`/`broadcast_state.overlay_text`) — all
separate, later rounds per this document's Status section.
