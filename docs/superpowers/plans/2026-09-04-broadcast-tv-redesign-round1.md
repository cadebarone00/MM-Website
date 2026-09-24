# Broadcast Visual Redesign — Round 1 (TV Scenes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `/broadcast` scene and overlay/takeover component moves from the current cream-card visual system to a full-bleed dark stage-lit broadcast-graphics system — no logic changes anywhere, JSX/Tailwind classes only.

**Architecture:** Each of 6 presentational components gets its root canvas replaced (cream card → full-bleed radial-vignette dark background + a low-opacity etched "MM" watermark), row/text styling updated for the dark background, and — in `IndividualLeaderboardScene` only — the hand-rolled score pill replaced with the existing `ScoreBadge` component. No new files, no new hooks, no new dependencies.

**Tech Stack:** React 19, Tailwind CSS 4 (arbitrary-value utilities for the radial gradient/watermark, since this exact vignette isn't a pre-existing utility class).

**Spec:** `docs/superpowers/specs/2026-09-04-broadcast-tv-redesign-round1-design.md`

## Global Constraints

- **No logic changes.** `statusLabel()`, `ptsLabel()`, `PairingNames()`, `matchResultLabel()`, `teamLabel()`, `marginLabel()`, `rankRows()` — every pure helper function in these files stays byte-for-byte identical. Every task below touches only the JSX return statement and className strings, never a function body that computes a value.
- **No `lib/broadcast/*.ts` file, hook, or data-fetching function is touched.** This is a restyle of 6 already-correct, already-tested presentational components.
- **Score colors stay `--color-score-under`/`--color-score-even`/`--color-score-over`** (red/green/near-black) via the existing `ScoreBadge` component — never a new color scheme, never gold used to mean a score value. Gold (`--color-gold-300`/`--color-gold-400`) is accent-only: dividers, watermark stroke, status glow, "Live"/"Final" label.
- **No new color tokens, no new fonts.** Every value used below already exists in `app/globals.css` (confirmed: `--color-maroon-700/900`, `--color-gold-300/400`, `--color-cream-50/100`, `--color-ink-400`, `--font-serif`, `--font-condensed`, `--font-sans`) or is a plain Tailwind arbitrary value built from them (the radial-gradient vignette and the watermark's `text-stroke` aren't pre-existing utility classes, since nothing like them existed before this round).
- The same watermark markup (a large, absolutely-positioned "MM" with `-webkit-text-stroke` and no fill) is repeated verbatim across every scene/takeover — this is intentional duplication of a tiny, purely-decorative snippet, not a DRY violation worth extracting into a shared component for a 6-file, one-round change.

---

## Task 1: `IndividualLeaderboardScene.tsx`

**Files:**
- Modify: `components/broadcast/scenes/IndividualLeaderboardScene.tsx` (full-file rewrite — every line changes except the imports' package paths and `rankRows`/`Row`, which move but don't change logic)

**Interfaces:**
- Consumes: `ScoreBadge` from `@/components/ui/ScoreBadge` (existing, `{value, chip, size}` props) — newly imported in this task.
- Produces: nothing new for later tasks — this file has no consumers among the other tasks below (each scene is independent).

- [ ] **Step 1: Replace the file**

Replace the entire contents of `components/broadcast/scenes/IndividualLeaderboardScene.tsx` with:

```tsx
import { getPlayerDisplayName } from "@/lib/data/players";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { BroadcastStanding } from "@/lib/broadcast/types";

interface Row extends BroadcastStanding {
  pos: number;
  showPos: boolean;
}

/** Groups ties (equal toPar) under one shared position number, blank on the rows underneath — same convention the reference broadcast leaderboard uses. */
function rankRows(standings: BroadcastStanding[]): Row[] {
  let pos = 0;
  let lastToPar: number | null = null;
  return standings.map((s, i) => {
    if (lastToPar === null || s.toPar !== lastToPar) {
      pos = i + 1;
      lastToPar = s.toPar;
      return { ...s, pos, showPos: true };
    }
    return { ...s, pos, showPos: false };
  });
}

/**
 * A TV leaderboard graphic in The Maroon Masters' own colors — a full-bleed
 * dark stage-lit canvas (not a card), modeled on modern golf broadcast
 * packages (Golf Channel / PGA Tour Live) rather than a plain website
 * table. Score colors are the site's real red/green/near-black convention
 * (ScoreBadge, shared with every scorecard on the site) — gold here is a
 * pure accent, never a score meaning. See the Round 1 redesign spec.
 */
export function IndividualLeaderboardScene({ standings, final = false }: { standings: BroadcastStanding[]; final?: boolean }) {
  const rows = rankRows(standings);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>

      <div className="relative z-[1] w-full max-w-[900px]">
        <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--color-gold-400)]/35 pb-3">
          <span className="font-serif text-lg italic text-[color:var(--color-cream-100)]">The Maroon Masters</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-cream-50)]">Individual Leaderboard</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">{final ? "Final" : "Live"}</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-2 py-16 text-center font-sans text-lg text-[color:var(--color-ink-400)]">
            No scores posted yet. Check back once play begins.
          </p>
        ) : (
          <div>
            {rows.map((r, i) => (
              <div
                key={r.player}
                className={[
                  "flex items-center gap-4 border-b border-white/[0.06] px-2 py-3",
                  i === 0 ? "bg-gradient-to-r from-[color:var(--color-gold-400)]/[0.08] to-transparent" : "",
                ].join(" ")}
              >
                <span className="w-8 shrink-0 text-right font-condensed text-lg font-bold tabular-nums text-[color:var(--color-ink-400)]">
                  {r.showPos ? r.pos : ""}
                </span>
                <span
                  aria-hidden
                  className={[
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    r.team === "maroon" ? "bg-[color:var(--color-maroon-500)] shadow-[0_0_6px_rgba(168,82,88,0.9)]" : "bg-[color:var(--color-cream-100)]",
                  ].join(" ")}
                />
                <span className="flex-1 truncate font-sans text-xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
                  {getPlayerDisplayName(r.player)}
                </span>
                <ScoreBadge value={r.toPar} chip size="lg" />
              </div>
            ))}
          </div>
        )}
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
git add components/broadcast/scenes/IndividualLeaderboardScene.tsx
git commit -m "feat(broadcast): redesign IndividualLeaderboardScene to the dark broadcast system"
```

---

## Task 2: `MatchPlayScene.tsx`

**Files:**
- Modify: `components/broadcast/scenes/MatchPlayScene.tsx` (full-file rewrite — `statusLabel`, `ptsLabel`, `PairingNames` are copied verbatim, unchanged; only the exported component's JSX changes)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `components/broadcast/scenes/MatchPlayScene.tsx` with:

```tsx
import type { BroadcastMatchBox, BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";

/** "Maroon 2 UP", "All Square", "White 3 & 2" (closed out early), "Halved" — presentation only, all the real math (leader/margin/holesRemaining) comes from lib/live/orchestration.ts. */
function statusLabel(box: BroadcastMatchBox): string {
  if (box.state === "Scheduled") return "Scheduled";
  if (box.state === "Armed") return "Starting Soon";
  if (box.leader === "tie") return box.state === "Final" ? "Halved" : "All Square";

  const team = box.leader === "maroon" ? "Maroon" : "White";
  if (box.state === "Final" && box.margin > box.holesRemaining) return `${team} ${box.margin} & ${box.holesRemaining}`;
  return `${team} ${box.margin} UP`;
}

/** "3.5" instead of "3.5000000000000004" — points are always in half-point steps, so one decimal is exact. */
function ptsLabel(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function PairingNames({ names }: { names: string[] }) {
  return <span className="truncate">{names.join(" / ")}</span>;
}

/**
 * A TV match-play graphic in The Maroon Masters' own colors — full-bleed
 * dark stage-lit canvas, same system as IndividualLeaderboardScene.tsx.
 * See the Round 1 redesign spec, §17/§19 of the master broadcast spec.
 */
export function MatchPlayScene({ matchPlay }: { matchPlay: BroadcastMatchPlay }) {
  const scoreLeader = matchPlay.maroonPts === matchPlay.whitePts ? "tie" : matchPlay.maroonPts > matchPlay.whitePts ? "maroon" : "white";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>

      <div className="relative z-[1] w-full max-w-[900px]">
        <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--color-gold-400)]/35 pb-3">
          <span className="font-serif text-lg italic text-[color:var(--color-cream-100)]">The Maroon Masters</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-cream-50)]">
            Match Play{matchPlay.roundLabel ? ` — ${matchPlay.roundLabel}` : ""}
          </span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">
            {matchPlay.final ? "Final" : "Live"}
          </span>
        </div>

        {matchPlay.matchBoxes.length === 0 ? (
          <p className="px-2 py-16 text-center font-sans text-lg text-[color:var(--color-ink-400)]">No round is live yet.</p>
        ) : (
          <div>
            {matchPlay.matchBoxes.map((box) => (
              <div key={box.boxNumber} className="flex items-center gap-4 border-b border-white/[0.06] px-2 py-3">
                <span className="w-6 shrink-0 text-right font-condensed text-lg font-bold tabular-nums text-[color:var(--color-ink-400)]">
                  {box.boxNumber}
                </span>
                <div className="flex flex-1 flex-col gap-1 overflow-hidden font-sans text-lg font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-maroon-500)] shadow-[0_0_6px_rgba(168,82,88,0.9)]" />
                    <PairingNames names={box.maroonNames} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-cream-100)]" />
                    <PairingNames names={box.whiteNames} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span
                    className={[
                      "font-condensed text-lg font-bold uppercase tracking-wide",
                      box.state === "Final"
                        ? "text-[color:var(--color-ink-400)]"
                        : "text-[color:var(--color-gold-300)] [text-shadow:0_0_12px_rgba(220,196,149,0.45)]",
                    ].join(" ")}
                  >
                    {statusLabel(box)}
                  </span>
                  {box.thru && <span className="font-condensed text-xs uppercase tracking-wide text-[color:var(--color-ink-400)]">{box.thru}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-[color:var(--color-gold-400)]/35 pt-3">
          <span className="font-condensed text-lg font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
            {scoreLeader === "tie" ? (
              <>
                All Square{" "}
                <span className="text-[color:var(--color-ink-400)]">
                  {ptsLabel(matchPlay.maroonPts)} – {ptsLabel(matchPlay.whitePts)}
                </span>
              </>
            ) : (
              <>
                <span className={scoreLeader === "maroon" ? "text-[color:var(--color-maroon-400)]" : "text-[color:var(--color-cream-50)]"}>
                  {scoreLeader === "maroon" ? "Maroon" : "White"} Leads
                </span>{" "}
                <span className="text-[color:var(--color-ink-400)]">
                  {ptsLabel(Math.max(matchPlay.maroonPts, matchPlay.whitePts))} – {ptsLabel(Math.min(matchPlay.maroonPts, matchPlay.whitePts))}
                </span>
              </>
            )}
          </span>
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
git add components/broadcast/scenes/MatchPlayScene.tsx
git commit -m "feat(broadcast): redesign MatchPlayScene to the dark broadcast system"
```

---

## Task 3: `HoldingScene.tsx`

**Files:**
- Modify: `components/broadcast/scenes/HoldingScene.tsx` (full-file rewrite)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `components/broadcast/scenes/HoldingScene.tsx` with:

```tsx
/**
 * Shown when nothing is live — venue/date info, same "holding pattern" a
 * real broadcast uses before/between rounds. Full-bleed vignette +
 * watermark, matching every other broadcast scene. See the Round 1
 * redesign spec and the master spec's §17.
 */
export function HoldingScene({ venue, dateLabel }: { venue: string; dateLabel: string }) {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-6 text-center text-[color:var(--color-maroon-50)] [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>
      <p className="relative z-[1] font-condensed text-sm uppercase tracking-[0.3em] text-[color:var(--color-gold-300)]">The Maroon Masters</p>
      <h1 className="relative z-[1] mt-4 font-serif text-5xl font-semibold sm:text-6xl">{venue}</h1>
      <p className="relative z-[1] mt-4 font-sans text-xl text-[color:var(--color-maroon-200)]">{dateLabel}</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/broadcast/scenes/HoldingScene.tsx
git commit -m "feat(broadcast): redesign HoldingScene to the dark broadcast system"
```

---

## Task 4: `EventOverlay.tsx`

**Files:**
- Modify: `components/broadcast/EventOverlay.tsx:30-42` (only the returned JSX changes — imports, the `MatchStateChangedPayload` interface, and the two early `return null` guards stay identical)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the returned JSX**

The current file's return statement (lines 30-42) reads:

```tsx
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
```

Replace it with:

```tsx
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-8 sm:pb-12">
      <div className="flex max-w-3xl items-center gap-4 border-t border-[color:var(--color-gold-400)]/40 bg-[color:var(--color-maroon-900)]/90 px-6 py-3 shadow-xl backdrop-blur-sm">
        <span className="shrink-0 font-condensed text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">
          Match {box.boxNumber}
        </span>
        <span className="font-condensed text-xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)] sm:text-2xl [text-shadow:0_0_12px_rgba(220,196,149,0.35)]">
          {teamLabel(payload.leader)} {marginLabel(payload.margin)}
          {payload.holesRemaining > 0 ? `, ${payload.holesRemaining} to play` : ""}
        </span>
      </div>
    </div>
  );
```

(This drops the `rounded-lg`/`ring-1` pill treatment for the flatter hairline-divider language the rest of the system now uses, and switches the message from `font-serif` to `font-condensed` uppercase to match the scoreboard-style typography used everywhere else a live status renders. It intentionally does NOT change this element's fixed position — `EventOverlay` and the host-manual `OverlayLayer` (Task 6) already occupy the same bottom-of-screen position from a prior round; repositioning either is out of scope for this restyle-only round.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/broadcast/EventOverlay.tsx
git commit -m "feat(broadcast): redesign EventOverlay to the dark broadcast system"
```

---

## Task 5: `EventTakeover.tsx`

**Files:**
- Modify: `components/broadcast/EventTakeover.tsx:41-84` (only the three returned JSX blocks change — imports and everything above line 41, including the `matchResultLabel`/box-lookup logic, stay identical)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the three returned JSX blocks**

The current `ROUND_FINAL` branch (lines 41-48) reads:

```tsx
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-maroon px-10 py-10">
        <div className="w-full max-w-[900px] rounded-2xl bg-[color:var(--color-cream-50)] px-10 py-16 text-center shadow-2xl ring-1 ring-[color:var(--color-gold-400)]/40">
          <p className="font-serif text-2xl italic text-[color:var(--color-maroon-700)]">The Maroon Masters</p>
          <p className="mt-6 font-condensed text-5xl font-bold uppercase tracking-wide text-[color:var(--color-maroon-900)]">Round {payload.round} Complete</p>
        </div>
      </div>
    );
```

Replace it with:

```tsx
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
        >
          MM
        </span>
        <div className="relative z-[1] text-center">
          <p className="font-serif text-2xl italic text-[color:var(--color-cream-100)]">The Maroon Masters</p>
          <p className="mt-6 font-condensed text-6xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">Round {payload.round} Complete</p>
        </div>
      </div>
    );
```

The current "box not found" fallback branch (lines 54-63) reads:

```tsx
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-maroon px-10 py-10">
        <div className="w-full max-w-[900px] rounded-2xl bg-[color:var(--color-cream-50)] px-10 py-16 text-center shadow-2xl ring-1 ring-[color:var(--color-gold-400)]/40">
          <p className="font-serif text-2xl italic text-[color:var(--color-maroon-700)]">The Maroon Masters</p>
          <p className="mt-6 font-condensed text-5xl font-bold uppercase tracking-wide text-[color:var(--color-maroon-900)]">
            {payload.leader === "tie" ? "Match Halved" : `${teamLabel(payload.leader)} Wins`}
          </p>
        </div>
      </div>
    );
```

Replace it with:

```tsx
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
        >
          MM
        </span>
        <div className="relative z-[1] text-center">
          <p className="font-serif text-2xl italic text-[color:var(--color-cream-100)]">The Maroon Masters</p>
          <p className="mt-6 font-condensed text-6xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
            {payload.leader === "tie" ? "Match Halved" : `${teamLabel(payload.leader)} Wins`}
          </p>
        </div>
      </div>
    );
```

The current box-found full branch (lines 66-84) reads:

```tsx
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
            {matchResultLabel(box.leader, box.margin, box.holesRemaining)}
          </p>
          <p className="mt-4 font-sans text-lg text-[color:var(--color-maroon-900)]/80">
            {box.maroonNames.join(" / ")} vs. {box.whiteNames.join(" / ")}
          </p>
        </div>
      </div>
    </div>
  );
```

Replace it with:

```tsx
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>
      <div className="relative z-[1] text-center">
        <p className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">Match {box.boxNumber}</p>
        <p className="mt-3 font-condensed text-6xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)] [text-shadow:0_0_16px_rgba(220,196,149,0.4)]">
          {matchResultLabel(box.leader, box.margin, box.holesRemaining)}
        </p>
        <p className="mt-4 font-sans text-lg text-[color:var(--color-cream-100)]/80">
          {box.maroonNames.join(" / ")} vs. {box.whiteNames.join(" / ")}
        </p>
      </div>
    </div>
  );
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/broadcast/EventTakeover.tsx
git commit -m "feat(broadcast): redesign EventTakeover to the dark broadcast system"
```

---

## Task 6: `OverlayLayer.tsx`

**Files:**
- Modify: `components/broadcast/OverlayLayer.tsx:29-35` (only the returned JSX changes — the `isActive`/visibility-timer logic above it stays identical)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the returned JSX**

The current file's return statement (lines 29-35) reads:

```tsx
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-8 sm:pb-12">
      <div className="max-w-3xl rounded-lg bg-[color:var(--color-maroon-700)] px-6 py-3 text-center font-serif text-xl font-semibold text-white shadow-xl sm:text-2xl">
        {text}
      </div>
    </div>
  );
```

Replace it with:

```tsx
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-8 sm:pb-12">
      <div className="max-w-3xl border-t border-[color:var(--color-gold-400)]/40 bg-[color:var(--color-maroon-900)]/90 px-6 py-3 text-center font-serif text-xl font-semibold text-[color:var(--color-cream-50)] shadow-xl backdrop-blur-sm sm:text-2xl">
        {text}
      </div>
    </div>
  );
```

(Keeps `font-serif` here, unlike `EventOverlay`'s switch to `font-condensed` in Task 4 — this is the host's own free-text announcement voice, deliberately distinct from the scoreboard-style automated overlays, per the spec's note that a host announcement and a system overlay are "an unrelated concern.")

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/broadcast/OverlayLayer.tsx
git commit -m "feat(broadcast): redesign OverlayLayer to the dark broadcast system"
```

---

## Task 7: Full verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: same pass/fail counts as before this plan started (this is a presentational-only change — no test file in this repo covers any of these 6 components, so the count should be unaffected either way).

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three exit 0. If `npm run lint` reports pre-existing issues in files this plan never touched, confirm via `npx eslint components/broadcast` (scoped to just this plan's directory) that these 6 files specifically are clean.

- [ ] **Step 3: Manual visual walkthrough**

Open `/broadcast` (or `/broadcast?preview=1&year=<a year with data>&scene=individual_leaderboard`, then `&scene=match_play`, then `&scene=holding`) and confirm:
- All three scenes render full-bleed on the dark vignette canvas, no cream card visible anywhere, and the "MM" watermark is visible (faint, bottom-right) on all three.
- On the leaderboard scene: to-par scores render via `ScoreBadge` in the site's real red (under par) / green (even) / near-black-on-light (over par) colors — compare directly against how a score renders on an existing scorecard page to confirm it's the identical color scheme, not a new one. Specifically check how the "over par" chip (`ScoreBadge`'s `chip` mode uses a solid light `ink-100` background for that case, unlike the translucent tints for under/even) reads against the dark canvas — confirm it's legible and not jarring; this is inherent to reusing `ScoreBadge` unmodified (per this plan's constraints) rather than something to fix here, but worth a look.
- The leader's row (position 1) shows a subtle gold-tinted highlight, not a separate footer bar.
- On the match play scene: an in-progress match's status ("2 UP", "AS") glows gold; a completed match's status ("3 & 2", "Halved") is muted, not glowing.
- Trigger a `MATCH_STATE_CHANGED` (or use preview) and confirm `EventOverlay` matches the new hairline/glow treatment.
- Trigger a `MATCH_WON`/`ROUND_FINAL` (or use preview) and confirm `EventTakeover` matches the new full-bleed/watermark treatment, including the "box not found" fallback text if you can force that case.
- Post a host announcement from Broadcast Controls and confirm `OverlayLayer` matches too.

- [ ] **Step 4: Update phasing memory**

Not a code step — once verified working, note that Round 1 (broadcast TV scenes) of the visual redesign is shipped, and Round 2 (the public `/leaderboard` pages) is the next, separate spec/plan/build cycle.
