# Fantasy Draft Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Fantasy picker with a mobile-first welcome → 3-tab draft → profile-drill-in → Submit Lineup → locked "Your Team" flow, and fix the underlying bug where the eligible-player list (and `LivePlayerScorecard`'s team badge) reads an always-empty roster instead of the real confirmed roster Tiger locks in via Master Settings.

**Architecture:** One new pure overlay function (`overlayConfirmedRoster`) is applied at the two existing chokepoints that already compute "the live tournament" — the server-side `fetchLiveTournament()` (Fantasy's save/validate route) and the client-side `useLiveTournament()` hook (everything else, including Fantasy's own read path and `LivePlayerScorecard`) — so every consumer gets the correct roster with no per-component changes. The draft flow itself is a small state machine in `app/fantasy/page.tsx` backed by a sessionStorage-persisted in-progress draft (survives navigating out to a player's profile page and back), with locking enforced both in the UI and, for real, in the save endpoint.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Supabase (existing `fantasy_teams` table, no schema change), `lucide-react` icons, `node:test` (via `tsx --test`).

**Spec:** `docs/superpowers/specs/2026-09-24-fantasy-draft-redesign-design.md`

## Global Constraints

- No new database columns or tables. "Submitted" = a row exists in `fantasy_teams`; "locked" = `getNextTournamentStatus() !== "upcoming"` (both already true today).
- Everyone drafts independently — no shared draft pool, no cross-user exclusivity.
- Mobile-first single-column layout; desktop reuses the same layout (no separate desktop design this round).
- Don't touch `lib/fantasy/scoring.ts`, `lib/fantasy/validate.ts`, `components/fantasy/FantasyResults.tsx`, `components/fantasy/FantasySignInGate.tsx`, or the `fantasy_teams` table — all stay exactly as they are.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` must all stay clean after every task.

---

## Task 1: `overlayConfirmedRoster` — the shared roster-fix rule

**Files:**
- Create: `lib/data/confirmedRosterOverlay.ts`
- Test: `lib/data/confirmedRosterOverlay.test.ts`

**Interfaces:**
- Produces: `overlayConfirmedRoster(tournament: Tournament, confirmedRoster: RosterEntry[]): Tournament` — pure. If `tournament.roster.maroon.length > 0 || tournament.roster.white.length > 0`, returns `tournament` unchanged (the live feed's own roster always wins once it exists). Otherwise, if `confirmedRoster` is empty, returns `tournament` unchanged. Otherwise returns `tournament` with `roster` replaced by the confirmed roster's player slugs, split by `team`.
- Consumes: `Tournament` from `@/lib/data/types`, `RosterEntry` from `@/lib/live/types` (`{ seasonYear: number; playerSlug: string; team: Team; displayName?: string; avatarSrc?: string | null }`).

- [ ] **Step 1: Write the failing test**

```ts
// lib/data/confirmedRosterOverlay.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { overlayConfirmedRoster } from "./confirmedRosterOverlay.ts";
import type { Tournament } from "./types.ts";
import type { RosterEntry } from "@/lib/live/types";

function tournamentWithRoster(maroon: string[], white: string[]): Tournament {
  return {
    slug: "2027",
    editionLabel: "The Maroon Masters 2027",
    year: 2027,
    venue: "Mission Hills CC",
    location: "Palm Springs, CA",
    dateLabel: "January 6–9, 2027",
    startDate: "2027-01-06",
    endDate: "2027-01-09",
    roster: { maroon, white },
    maroonPts: 0,
    whitePts: 0,
    pointsAvailable: 33,
    pointsToWin: 17,
    matches: [],
    individualLeaderboard: [],
  };
}

const confirmedRoster: RosterEntry[] = [
  { seasonYear: 2027, playerSlug: "cade-barone", team: "maroon" },
  { seasonYear: 2027, playerSlug: "cam-latto", team: "white" },
  { seasonYear: 2027, playerSlug: "drew-weisser", team: "maroon" },
];

test("overlayConfirmedRoster fills an empty roster from the confirmed roster, split by team", () => {
  const result = overlayConfirmedRoster(tournamentWithRoster([], []), confirmedRoster);
  assert.deepEqual(result.roster, { maroon: ["cade-barone", "drew-weisser"], white: ["cam-latto"] });
});

test("overlayConfirmedRoster leaves a non-empty roster alone even if a confirmed roster exists", () => {
  const result = overlayConfirmedRoster(tournamentWithRoster(["already-here"], []), confirmedRoster);
  assert.deepEqual(result.roster, { maroon: ["already-here"], white: [] });
});

test("overlayConfirmedRoster leaves an empty roster empty when there's no confirmed roster either", () => {
  const result = overlayConfirmedRoster(tournamentWithRoster([], []), []);
  assert.deepEqual(result.roster, { maroon: [], white: [] });
});

test("overlayConfirmedRoster doesn't mutate every other field", () => {
  const tournament = tournamentWithRoster([], []);
  const result = overlayConfirmedRoster(tournament, confirmedRoster);
  assert.equal(result.slug, tournament.slug);
  assert.equal(result.maroonPts, tournament.maroonPts);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/data/confirmedRosterOverlay.test.ts`
Expected: FAIL — `confirmedRosterOverlay.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/data/confirmedRosterOverlay.ts
//
// The pre-tournament roster (who Tiger has locked into Maroon/White in
// Master Settings -> Players & Teams, aka getConfirmedRoster()) and the
// live-tournament roster (tournament.roster, only populated once the
// Google Sheet feed is actually running) are two separate sources that
// nothing used to connect. This is the one rule that connects them,
// applied at both places a Tournament gets built (see
// lib/data/fetchLiveTournament.ts and lib/hooks/useLiveTournament.ts) so
// every consumer of tournament.roster sees the confirmed roster before the
// live feed exists, and the live feed's own roster once it does.
import type { Tournament } from "./types";
import type { RosterEntry } from "@/lib/live/types";

export function overlayConfirmedRoster(tournament: Tournament, confirmedRoster: RosterEntry[]): Tournament {
  if (tournament.roster.maroon.length > 0 || tournament.roster.white.length > 0) return tournament;
  if (confirmedRoster.length === 0) return tournament;

  return {
    ...tournament,
    roster: {
      maroon: confirmedRoster.filter((entry) => entry.team === "maroon").map((entry) => entry.playerSlug),
      white: confirmedRoster.filter((entry) => entry.team === "white").map((entry) => entry.playerSlug),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/data/confirmedRosterOverlay.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/data/confirmedRosterOverlay.ts lib/data/confirmedRosterOverlay.test.ts
git commit -m "Add overlayConfirmedRoster, the shared pre-tournament roster fix"
```

---

## Task 2: Wire the overlay into the server-side `fetchLiveTournament()`

**Files:**
- Modify: `lib/data/fetchLiveTournament.ts`

**Interfaces:**
- Consumes: `overlayConfirmedRoster` (Task 1), `getConfirmedRoster(): Promise<RosterEntry[]>` from `@/lib/data/activeSeasonOverlay` (already exists).
- Produces: `fetchLiveTournament(): Promise<Tournament>` — same signature as today, now with a correct `roster` before the live feed exists. Its only current caller, `app/api/fantasy/team/route.ts`, needs no changes to keep working.

- [ ] **Step 1: Make the change**

Replace the full contents of `lib/data/fetchLiveTournament.ts` with:

```ts
import { mergeLiveTournament } from "./live";
import { normalizePayload } from "./liveFeedNormalize";
import { overlayConfirmedRoster } from "./confirmedRosterOverlay";
import { getConfirmedRoster } from "./activeSeasonOverlay";
import type { Tournament } from "./types";

/**
 * Server-side equivalent of the client's useLiveTournament() hook, for use
 * in Route Handlers that need to validate something against the live
 * tournament's real data (e.g. resolving a bet's real market odds) —
 * fetches LIVE_FEED_URL directly rather than round-tripping through our
 * own /api/live-feed endpoint.
 *
 * Always returns a valid Tournament, never null — mirrors
 * mergeLiveTournament()'s own contract and the client's useLiveTournament()
 * hook: no live feed configured/reachable degrades to a roster confirmed
 * via Tiger's Master Settings (getConfirmedRoster()), or an empty roster if
 * that isn't set either — never a fatal error. This matters because
 * futures markets (Team Winner, Tournament Winner) only need
 * tournament.slug/individualLeaderboard, both valid on that fallback, so
 * they stay bettable with zero live feed data — exactly the state this app
 * is in most of the time before a tournament goes live.
 */
export async function fetchLiveTournament(): Promise<Tournament> {
  const tournament = await fetchLiveFeedTournament();
  const confirmedRoster = await getConfirmedRoster();
  return overlayConfirmedRoster(tournament, confirmedRoster);
}

async function fetchLiveFeedTournament(): Promise<Tournament> {
  const url = process.env.LIVE_FEED_URL;
  if (!url) return mergeLiveTournament(null);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return mergeLiveTournament(null);
    const data = await res.json();
    return mergeLiveTournament(normalizePayload(data));
  } catch {
    return mergeLiveTournament(null);
  }
}
```

This is a refactor of the existing function into two (the original logic moved into `fetchLiveFeedTournament`, unchanged) plus one new line applying the overlay — no behavior change for any existing caller beyond the roster now being correct.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/data/fetchLiveTournament.ts
git commit -m "fetchLiveTournament: fall back to the confirmed roster, not just an empty one"
```

---

## Task 3: Public `GET /api/confirmed-roster` route

**Files:**
- Create: `app/api/confirmed-roster/route.ts`

**Interfaces:**
- Produces: `GET` → `{ ok: true, roster: RosterEntry[] }`, `Cache-Control: no-store`. Public, no auth — this is the same data the public Teams page's "confirmed so far" section already renders.
- Consumes: `getConfirmedRoster()` from `@/lib/data/activeSeasonOverlay`.

- [ ] **Step 1: Write the route**

```ts
// app/api/confirmed-roster/route.ts
import { NextResponse } from "next/server";
import { getConfirmedRoster } from "@/lib/data/activeSeasonOverlay";

export async function GET() {
  const roster = await getConfirmedRoster();
  return NextResponse.json({ ok: true, roster }, { headers: { "Cache-Control": "no-store" } });
}
```

No dedicated test file — this mirrors `app/api/live-feed/route.ts`, an equally thin wrapper with no test of its own; the real logic it calls (`getConfirmedRoster`) is exercised by the existing Teams page and is out of scope to add tests for here.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/confirmed-roster/route.ts
git commit -m "Add public GET /api/confirmed-roster"
```

---

## Task 4: Wire the overlay into the client `useLiveTournament()` hook

**Files:**
- Modify: `lib/hooks/useLiveTournament.ts`

**Interfaces:**
- Consumes: `overlayConfirmedRoster` (Task 1), `GET /api/confirmed-roster` (Task 3).
- Produces: `useLiveTournament(pollMs?, endpoint?)` — same return shape as today (`{ tournament, payload, error, loading }`); `tournament.roster` is now correct before the live feed exists. No consumer of this hook (18 files, including `LivePlayerScorecard.tsx` and `app/fantasy/page.tsx`) needs any change.

- [ ] **Step 1: Make the change**

Replace the full contents of `lib/hooks/useLiveTournament.ts` with:

```ts
"use client";

import { useEffect, useState } from "react";
import { mergeLiveTournament, type LiveFeedPayload } from "@/lib/data/live";
import { overlayConfirmedRoster } from "@/lib/data/confirmedRosterOverlay";
import type { RosterEntry } from "@/lib/live/types";

export const LIVE_POLL_MS = 10000;
export const DETAIL_POLL_MS = 5000;

export function useLiveTournament(pollMs = LIVE_POLL_MS, endpoint = "/api/live-feed") {
  const [payload, setPayload] = useState<LiveFeedPayload | null>(null);
  const [confirmedRoster, setConfirmedRoster] = useState<RosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) throw new Error("feed unavailable");
        const data = await res.json();
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the live feed - showing the last update that worked.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadConfirmedRoster() {
      try {
        const res = await fetch("/api/confirmed-roster", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok && Array.isArray(data.roster)) setConfirmedRoster(data.roster);
      } catch {
        // Pre-tournament roster overlay just won't apply this poll - tournament.roster stays whatever it already was.
      }
    }

    load();
    loadConfirmedRoster();
    const id = setInterval(() => {
      load();
      loadConfirmedRoster();
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs, endpoint]);

  const tournament = overlayConfirmedRoster(mergeLiveTournament(payload), confirmedRoster);

  return { tournament, payload, error, loading };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useLiveTournament.ts
git commit -m "useLiveTournament: overlay the confirmed roster onto every consumer"
```

---

## Task 5: `fantasyPicksLocked` — the real lock check

**Files:**
- Create: `lib/fantasy/lock.ts`
- Test: `lib/fantasy/lock.test.ts`
- Modify: `app/api/fantasy/team/route.ts`

**Interfaces:**
- Produces: `fantasyPicksLocked(now?: Date): boolean` — `true` once `getNextTournamentStatus(now)` is no longer `"upcoming"`.
- Consumes: `getNextTournamentStatus` from `@/lib/data`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/fantasy/lock.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fantasyPicksLocked } from "./lock.ts";

// nextTournament (2027-upcoming.ts): liveAt "2027-01-06T09:30:00-06:00", endDate "2027-01-09".
test("fantasyPicksLocked is false before the tournament goes live", () => {
  assert.equal(fantasyPicksLocked(new Date("2026-01-01T00:00:00-06:00")), false);
});

test("fantasyPicksLocked is true once the tournament is live", () => {
  assert.equal(fantasyPicksLocked(new Date("2027-01-06T10:00:00-06:00")), true);
});

test("fantasyPicksLocked is true once the tournament has completed", () => {
  assert.equal(fantasyPicksLocked(new Date("2027-01-10T00:00:00-06:00")), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/fantasy/lock.test.ts`
Expected: FAIL — `lock.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/fantasy/lock.ts
import { getNextTournamentStatus } from "@/lib/data";

/**
 * Fantasy picks can be created or changed any time before the tournament
 * goes live; once it's live or completed, POST /api/fantasy/team refuses
 * the write (see app/api/fantasy/team/route.ts) and the UI switches to a
 * read-only "Your Team" view. No separate "submitted"/"locked" database
 * column - this is the one rule, reusing the site's existing tournament
 * status check.
 */
export function fantasyPicksLocked(now: Date = new Date()): boolean {
  return getNextTournamentStatus(now) !== "upcoming";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/fantasy/lock.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Wire it into the save endpoint**

In `app/api/fantasy/team/route.ts`, add the import and make the lock check the very first thing `POST` does (before any Supabase call, so a locked-out request never touches the database):

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchLiveTournament } from "@/lib/data/fetchLiveTournament";
import { validateFantasyPicks } from "@/lib/fantasy/validate";
import { fantasyTeamScore } from "@/lib/fantasy/scoring";
import { fantasyPicksLocked } from "@/lib/fantasy/lock";
```

```ts
export async function POST(request: Request) {
  if (fantasyPicksLocked()) {
    return NextResponse.json({ ok: false, error: "Fantasy picks are closed — the tournament has started." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  // ... rest of POST unchanged
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add lib/fantasy/lock.ts lib/fantasy/lock.test.ts app/api/fantasy/team/route.ts
git commit -m "Enforce the fantasy lock server-side, not just in the UI"
```

---

## Task 6: `draftState.ts` — the in-progress draft, persisted across the profile-page trip

**Files:**
- Create: `lib/fantasy/draftState.ts`
- Test: `lib/fantasy/draftState.test.ts`

**Interfaces:**
- Produces:
  - `type FantasySlot = "maroon" | "white" | "wildcard"`
  - `type DraftPicks = Record<FantasySlot, string | null>`
  - `EMPTY_DRAFT_PICKS: DraftPicks`
  - `draftStateKey(tournamentSlug: string): string`
  - `hasDraftInProgress(storage: StorageLike, tournamentSlug: string): boolean`
  - `readDraftPicks(storage: StorageLike, tournamentSlug: string): DraftPicks`
  - `writeDraftPick(storage: StorageLike, tournamentSlug: string, slot: FantasySlot, player: string): DraftPicks`
  - `seedDraftPicks(storage: StorageLike, tournamentSlug: string, picks: DraftPicks): void`
  - `clearDraftPicks(storage: StorageLike, tournamentSlug: string): void`
  - `isDraftComplete(picks: DraftPicks): picks is Record<FantasySlot, string>`
  - `nextEmptySlot(picks: DraftPicks): FantasySlot | null`
  - `safeSessionStorage: StorageLike` — a `try/catch`-wrapped real `sessionStorage`, safe to pass from components (private browsing can throw).
- Consumes: nothing beyond `node`/browser built-ins.

- [ ] **Step 1: Write the failing test**

```ts
// lib/fantasy/draftState.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_DRAFT_PICKS,
  clearDraftPicks,
  draftStateKey,
  hasDraftInProgress,
  isDraftComplete,
  nextEmptySlot,
  readDraftPicks,
  seedDraftPicks,
  writeDraftPick,
} from "./draftState.ts";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
}

test("draftStateKey is namespaced per tournament", () => {
  assert.equal(draftStateKey("2027"), "fantasy-draft:2027");
});

test("readDraftPicks returns all-null when nothing is saved", () => {
  const storage = fakeStorage();
  assert.deepEqual(readDraftPicks(storage, "2027"), EMPTY_DRAFT_PICKS);
});

test("readDraftPicks ignores corrupt JSON", () => {
  const storage = fakeStorage({ "fantasy-draft:2027": "not json" });
  assert.deepEqual(readDraftPicks(storage, "2027"), EMPTY_DRAFT_PICKS);
});

test("hasDraftInProgress is false until something is saved", () => {
  const storage = fakeStorage();
  assert.equal(hasDraftInProgress(storage, "2027"), false);
  seedDraftPicks(storage, "2027", EMPTY_DRAFT_PICKS);
  assert.equal(hasDraftInProgress(storage, "2027"), true);
});

test("writeDraftPick sets one slot and keeps the others", () => {
  const storage = fakeStorage();
  writeDraftPick(storage, "2027", "maroon", "cade-barone");
  const after = writeDraftPick(storage, "2027", "white", "cam-latto");
  assert.deepEqual(after, { maroon: "cade-barone", white: "cam-latto", wildcard: null });
  assert.deepEqual(readDraftPicks(storage, "2027"), after);
});

test("seedDraftPicks overwrites whatever was there (Edit Lineup starting from the saved server picks)", () => {
  const storage = fakeStorage();
  writeDraftPick(storage, "2027", "maroon", "cade-barone");
  seedDraftPicks(storage, "2027", { maroon: "drew-weisser", white: "cam-latto", wildcard: "pete-peabody" });
  assert.deepEqual(readDraftPicks(storage, "2027"), { maroon: "drew-weisser", white: "cam-latto", wildcard: "pete-peabody" });
});

test("clearDraftPicks removes the key entirely", () => {
  const storage = fakeStorage();
  writeDraftPick(storage, "2027", "maroon", "cade-barone");
  clearDraftPicks(storage, "2027");
  assert.equal(storage.getItem(draftStateKey("2027")), null);
  assert.equal(hasDraftInProgress(storage, "2027"), false);
});

test("draft state for one tournament doesn't leak into another", () => {
  const storage = fakeStorage();
  writeDraftPick(storage, "2027", "maroon", "cade-barone");
  assert.deepEqual(readDraftPicks(storage, "2028"), EMPTY_DRAFT_PICKS);
});

test("isDraftComplete is true only once all three slots are filled", () => {
  assert.equal(isDraftComplete(EMPTY_DRAFT_PICKS), false);
  assert.equal(isDraftComplete({ maroon: "a", white: "b", wildcard: null }), false);
  assert.equal(isDraftComplete({ maroon: "a", white: "b", wildcard: "c" }), true);
});

test("nextEmptySlot walks maroon, then white, then wildcard, then null", () => {
  assert.equal(nextEmptySlot(EMPTY_DRAFT_PICKS), "maroon");
  assert.equal(nextEmptySlot({ maroon: "a", white: null, wildcard: null }), "white");
  assert.equal(nextEmptySlot({ maroon: "a", white: "b", wildcard: null }), "wildcard");
  assert.equal(nextEmptySlot({ maroon: "a", white: "b", wildcard: "c" }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/fantasy/draftState.test.ts`
Expected: FAIL — `draftState.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/fantasy/draftState.ts
//
// A fantasy lineup being drafted but not yet submitted. Held in
// sessionStorage, keyed by tournament, so it survives navigating away to a
// player's profile page (to tap "Draft") and back - that's a real route
// change that unmounts the Fantasy page entirely. Device-only, cleared on a
// successful submit. Mirrors the {version, value} wrapper and injectable-
// storage convention lib/handicap/roundInProgress.ts already uses.

export type FantasySlot = "maroon" | "white" | "wildcard";
export type DraftPicks = Record<FantasySlot, string | null>;

export const EMPTY_DRAFT_PICKS: DraftPicks = { maroon: null, white: null, wildcard: null };

const SLOTS: FantasySlot[] = ["maroon", "white", "wildcard"];

export function draftStateKey(tournamentSlug: string): string {
  return `fantasy-draft:${tournamentSlug}`;
}

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const safeSessionStorage: StorageLike = {
  getItem(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Private browsing or storage disabled - the draft just won't survive a refresh this session.
    }
  },
  removeItem(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing to clear.
    }
  },
};

function isDraftPicks(value: unknown): value is DraftPicks {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return SLOTS.every((slot) => record[slot] === null || typeof record[slot] === "string");
}

function savedValue(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw);
    return stored?.version === 1 ? stored.value : undefined;
  } catch {
    return undefined;
  }
}

function save(storage: StorageLike, tournamentSlug: string, picks: DraftPicks): void {
  storage.setItem(draftStateKey(tournamentSlug), JSON.stringify({ version: 1, value: picks }));
}

/** Whether a draft (started via "Make Your Selections" or "Edit Lineup") exists at all, even one with nothing picked yet. */
export function hasDraftInProgress(storage: StorageLike, tournamentSlug: string): boolean {
  return storage.getItem(draftStateKey(tournamentSlug)) !== null;
}

/** The picks drafted so far - all null if no draft has been started. */
export function readDraftPicks(storage: StorageLike, tournamentSlug: string): DraftPicks {
  const value = savedValue(storage.getItem(draftStateKey(tournamentSlug)));
  return isDraftPicks(value) ? value : { ...EMPTY_DRAFT_PICKS };
}

/** Records one slot's pick, keeping whatever else was already drafted. Returns the resulting picks. */
export function writeDraftPick(storage: StorageLike, tournamentSlug: string, slot: FantasySlot, player: string): DraftPicks {
  const next = { ...readDraftPicks(storage, tournamentSlug), [slot]: player };
  save(storage, tournamentSlug, next);
  return next;
}

/** Starts (or restarts) a draft from a known set of picks - used to begin an empty draft, or to seed "Edit Lineup" from the saved server picks. */
export function seedDraftPicks(storage: StorageLike, tournamentSlug: string, picks: DraftPicks): void {
  save(storage, tournamentSlug, picks);
}

/** Throws away the in-progress draft - used once a submit succeeds. */
export function clearDraftPicks(storage: StorageLike, tournamentSlug: string): void {
  storage.removeItem(draftStateKey(tournamentSlug));
}

export function isDraftComplete(picks: DraftPicks): picks is Record<FantasySlot, string> {
  return picks.maroon !== null && picks.white !== null && picks.wildcard !== null;
}

/** The earliest of Maroon/White/Wildcard that isn't picked yet, or null once all three are. */
export function nextEmptySlot(picks: DraftPicks): FantasySlot | null {
  return SLOTS.find((slot) => !picks[slot]) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/fantasy/draftState.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/fantasy/draftState.ts lib/fantasy/draftState.test.ts
git commit -m "Add the sessionStorage-backed in-progress fantasy draft"
```

---

## Task 7: `FantasyPlayerRow` — one tappable draft-list row

**Files:**
- Create: `components/fantasy/FantasyPlayerRow.tsx`

**Interfaces:**
- Consumes: `Avatar` (`@/components/ui/Avatar`), `getPlayerAvatar`/`getPlayerDisplayName` (`@/lib/data/players`), `Team` (`@/lib/data/types`), `FantasySlot` (Task 6, `@/lib/fantasy/draftState`).
- Produces: `FantasyPlayerRow({ player, team, tournamentSlug, slot, selected, disabled }): JSX.Element` - a `<Link>` to `/leaderboard/{tournamentSlug}/players/{player}?draftSlot={slot}` (or a non-interactive row when `disabled`).

- [ ] **Step 1: Write the component**

```tsx
// components/fantasy/FantasyPlayerRow.tsx
"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";
import type { FantasySlot } from "@/lib/fantasy/draftState";

/**
 * One row in a draft tab's player list. Tapping it navigates to that
 * player's real profile page with ?draftSlot= set, which shows a "Draft"
 * button there (see FantasyDraftActionBar) instead of picking inline -
 * see the design spec for why. A row for a player already picked into a
 * *different* slot is shown disabled, since the server would reject that
 * combination anyway (lib/fantasy/validate.ts: all three picks must be
 * different players).
 */
export function FantasyPlayerRow({
  player,
  team,
  tournamentSlug,
  slot,
  selected,
  disabled,
}: {
  player: string;
  team: Team;
  tournamentSlug: string;
  slot: FantasySlot;
  selected: boolean;
  disabled: boolean;
}) {
  const displayName = getPlayerDisplayName(player);
  const avatar = getPlayerAvatar(player);

  const content = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar src={avatar} name={displayName} team={team} size="md" />
      <span className="min-w-0 flex-1 truncate font-sans text-sm font-semibold text-ink-900">{displayName}</span>
    </div>
  );

  if (disabled) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-transparent px-3 py-3 opacity-40">
        {content}
        <span className="shrink-0 font-condensed text-2xs uppercase tracking-wide text-ink-400">Picked elsewhere</span>
      </div>
    );
  }

  return (
    <Link
      href={`/leaderboard/${tournamentSlug}/players/${encodeURIComponent(player.toLowerCase())}?draftSlot=${slot}`}
      className={[
        "flex items-center justify-between gap-3 rounded-md border px-3 py-3 transition-colors",
        selected ? "border-gold-500 bg-gold-200/30" : "border-transparent hover:bg-cream-100",
      ].join(" ")}
    >
      {content}
      {selected ? (
        <span className="shrink-0 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">Drafted</span>
      ) : (
        <span aria-hidden="true" className="shrink-0 text-ink-300">
          →
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/fantasy/FantasyPlayerRow.tsx
git commit -m "Add FantasyPlayerRow"
```

---

## Task 8: `FantasyDraftTabs` — the 3-tab draft screen

**Files:**
- Create: `components/fantasy/FantasyDraftTabs.tsx`

**Interfaces:**
- Consumes: `FantasyPlayerRow` (Task 7); `nextEmptySlot`, `isDraftComplete`, `DraftPicks`, `FantasySlot` (Task 6); `Button` (`@/components/ui/Button`); `Tournament`, `Team` (`@/lib/data/types`); icons `Shirt`, `ThumbsUp`, `Layers` from `lucide-react`.
- Produces: `FantasyDraftTabs({ tournament, picks, onSubmit, saving, error }): JSX.Element`.

- [ ] **Step 1: Write the component**

```tsx
// components/fantasy/FantasyDraftTabs.tsx
"use client";

import { useState } from "react";
import { Shirt, ThumbsUp, Layers } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FantasyPlayerRow } from "./FantasyPlayerRow";
import { isDraftComplete, nextEmptySlot, type DraftPicks, type FantasySlot } from "@/lib/fantasy/draftState";
import type { Tournament, Team } from "@/lib/data/types";

const TABS: { slot: FantasySlot; label: string; icon: typeof Shirt }[] = [
  { slot: "maroon", label: "Maroon", icon: Shirt },
  { slot: "white", label: "White", icon: ThumbsUp },
  { slot: "wildcard", label: "Wildcard", icon: Layers },
];

function rosterFor(tournament: Tournament, picks: DraftPicks, slot: FantasySlot): { player: string; team: Team }[] {
  if (slot === "maroon") return tournament.roster.maroon.map((player) => ({ player, team: "maroon" as Team }));
  if (slot === "white") return tournament.roster.white.map((player) => ({ player, team: "white" as Team }));
  const both = [
    ...tournament.roster.maroon.map((player) => ({ player, team: "maroon" as Team })),
    ...tournament.roster.white.map((player) => ({ player, team: "white" as Team })),
  ];
  return both.filter(
    ({ player }) => player.toLowerCase() !== picks.maroon?.toLowerCase() && player.toLowerCase() !== picks.white?.toLowerCase()
  );
}

function otherPicks(picks: DraftPicks, slot: FantasySlot): string[] {
  return (Object.keys(picks) as FantasySlot[]).filter((key) => key !== slot && picks[key]).map((key) => picks[key] as string);
}

export function FantasyDraftTabs({
  tournament,
  picks,
  onSubmit,
  saving,
  error,
}: {
  tournament: Tournament;
  picks: DraftPicks;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [activeTab, setActiveTab] = useState<FantasySlot>(nextEmptySlot(picks) ?? "maroon");
  const complete = isDraftComplete(picks);
  const missing = TABS.filter((tab) => !picks[tab.slot]).map((tab) => tab.label);
  const excluded = otherPicks(picks, activeTab);

  return (
    <div className="pb-28">
      <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Draft Your Team</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">Pick one Maroon player, one White player, and a Wildcard from either team.</p>

      <div role="tablist" aria-label="Fantasy draft slots" className="mt-5 flex gap-2 border-b-2 border-ink-100">
        {TABS.map(({ slot, label, icon: Icon }) => {
          const active = activeTab === slot;
          return (
            <button
              key={slot}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(slot)}
              className={[
                "flex flex-1 flex-col items-center gap-1 border-b-2 px-2 pb-3 pt-1 font-condensed text-xs font-bold uppercase tracking-wide transition-colors",
                active ? "border-maroon-700 text-ink-900" : "border-transparent text-ink-400",
              ].join(" ")}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="flex items-center gap-1">
                {label}
                {picks[slot] && <span className="h-1.5 w-1.5 rounded-full bg-maroon-700" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {rosterFor(tournament, picks, activeTab).map(({ player, team }) => (
          <FantasyPlayerRow
            key={player}
            player={player}
            team={team}
            tournamentSlug={tournament.slug}
            slot={activeTab}
            selected={picks[activeTab]?.toLowerCase() === player.toLowerCase()}
            disabled={excluded.some((p) => p.toLowerCase() === player.toLowerCase())}
          />
        ))}
      </div>

      {error && <p className="mt-4 font-sans text-2xs text-score-under">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white px-4 py-4">
        <p className="mb-2 font-sans text-2xs text-ink-500">{complete ? "All three picked." : `Still need: ${missing.join(", ")}`}</p>
        <Button fullWidth disabled={!complete || saving} onClick={onSubmit}>
          {saving ? "Submitting..." : "Submit Lineup"}
        </Button>
      </div>
    </div>
  );
}
```

(`pb-28` on the wrapper keeps the fixed bottom bar from covering the last row in the list.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors. If `Shirt` or `Layers` isn't a valid `lucide-react` export in the installed version, TypeScript will flag the import - substitute `Shirt` with `Layers` or `Award`, or `Layers` with `Layers2` or `Spade`-adjacent icon (`Dices`), whichever `lucide-react` actually exports (check `node_modules/lucide-react/dist/lucide-react.d.ts` for the exact name).

- [ ] **Step 3: Commit**

```bash
git add components/fantasy/FantasyDraftTabs.tsx
git commit -m "Add FantasyDraftTabs"
```

---

## Task 9: `FantasyWelcome` — the pre-draft hero

**Files:**
- Create: `components/fantasy/FantasyWelcome.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/Button`).
- Produces: `FantasyWelcome({ editionLabel, onStart }): JSX.Element`.

- [ ] **Step 1: Write the component**

```tsx
// components/fantasy/FantasyWelcome.tsx
import { Button } from "@/components/ui/Button";

export function FantasyWelcome({ editionLabel, onStart }: { editionLabel: string; onStart: () => void }) {
  return (
    <div className="mt-6 text-center">
      <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Welcome to Maroon Masters Fantasy</h1>
      <p className="mt-2 font-sans text-sm text-ink-600">
        Pick 3 players for {editionLabel}: one from Team Maroon, one from Team White, and a Wildcard from either team. Each pick
        scores points for you on every hole they finish, in every round played:
      </p>
      <ul className="mx-auto mt-4 flex max-w-[320px] flex-col gap-1 text-left font-sans text-2xs text-ink-500">
        <li>
          <span className="font-semibold text-ink-800">Eagle or better</span> — 5 points
        </li>
        <li>
          <span className="font-semibold text-ink-800">Birdie</span> — 3 points
        </li>
        <li>
          <span className="font-semibold text-ink-800">Par</span> — 1 point
        </li>
        <li>
          <span className="font-semibold text-ink-800">Bogey</span> — 0 points
        </li>
        <li>
          <span className="font-semibold text-ink-800">Double bogey or worse</span> — -2 points
        </li>
      </ul>
      <Button className="mt-6" onClick={onStart}>
        Make Your Selections
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/fantasy/FantasyWelcome.tsx
git commit -m "Add FantasyWelcome"
```

---

## Task 10: `FantasyYourTeam` — the post-submit / locked view

**Files:**
- Create: `components/fantasy/FantasyYourTeam.tsx`

**Interfaces:**
- Consumes: `Avatar` (`@/components/ui/Avatar`), `Button` (`@/components/ui/Button`), `FantasyResults` (`./FantasyResults`, existing/unchanged), `getPlayerAvatar`/`getPlayerDisplayName` (`@/lib/data/players`), `fantasyTeamScore`, `FantasyPicks` (`@/lib/fantasy/scoring`, existing/unchanged), `Tournament`, `Team` (`@/lib/data/types`).
- Produces: `FantasyYourTeam({ tournament, picks, locked, onEdit }): JSX.Element`.

- [ ] **Step 1: Write the component**

```tsx
// components/fantasy/FantasyYourTeam.tsx
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FantasyResults } from "./FantasyResults";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import { fantasyTeamScore, type FantasyPicks } from "@/lib/fantasy/scoring";
import type { Tournament, Team } from "@/lib/data/types";

function teamOf(tournament: Tournament, player: string): Team {
  return tournament.roster.maroon.some((p) => p.toLowerCase() === player.toLowerCase()) ? "maroon" : "white";
}

export function FantasyYourTeam({
  tournament,
  picks,
  locked,
  onEdit,
}: {
  tournament: Tournament;
  picks: FantasyPicks;
  locked: boolean;
  onEdit: () => void;
}) {
  const roster: { label: string; player: string }[] = [
    { label: "Maroon", player: picks.maroonPlayer },
    { label: "White", player: picks.whitePlayer },
    { label: "Wildcard", player: picks.wildcardPlayer },
  ];

  return (
    <div>
      <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Your Team</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">{tournament.editionLabel}</p>

      <div className="mt-5 flex flex-col gap-3">
        {roster.map(({ label, player }) => (
          <div key={label} className="flex items-center gap-3 rounded-md border border-ink-100 bg-white p-3">
            <Avatar src={getPlayerAvatar(player)} name={getPlayerDisplayName(player)} team={teamOf(tournament, player)} size="md" />
            <div>
              <p className="m-0 font-condensed text-3xs font-bold uppercase tracking-wide text-ink-400">{label}</p>
              <p className="m-0 font-sans text-sm font-semibold text-ink-900">{getPlayerDisplayName(player)}</p>
            </div>
          </div>
        ))}
      </div>

      {locked ? (
        <FantasyResults tournament={tournament} scores={fantasyTeamScore(tournament, picks)} />
      ) : (
        <Button className="mt-5" variant="secondary" onClick={onEdit}>
          Edit Lineup
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/fantasy/FantasyYourTeam.tsx
git commit -m "Add FantasyYourTeam"
```

---

## Task 11: `FantasyDraftActionBar` — the Draft button on a player's profile page

**Files:**
- Create: `components/fantasy/FantasyDraftActionBar.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/Button`), `getPlayerFirstName` (`@/lib/data/players`), `writeDraftPick`, `safeSessionStorage`, `FantasySlot` (Task 6, `@/lib/fantasy/draftState`), `useRouter` (`next/navigation`).
- Produces: `FantasyDraftActionBar({ tournamentSlug, player, slot }): JSX.Element` - fixed bottom bar; tapping it writes the pick and navigates to `/fantasy`.

- [ ] **Step 1: Write the component**

```tsx
// components/fantasy/FantasyDraftActionBar.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { getPlayerFirstName } from "@/lib/data/players";
import { safeSessionStorage, writeDraftPick, type FantasySlot } from "@/lib/fantasy/draftState";

/**
 * Shown on a player's live profile page only when reached from the Fantasy
 * draft flow (?draftSlot=...). The page's own back button already returns
 * to /fantasy (see app/leaderboard/[slug]/players/[player]/page.tsx) - this
 * bar is the one new piece of UI, for actually drafting the player.
 */
export function FantasyDraftActionBar({
  tournamentSlug,
  player,
  slot,
}: {
  tournamentSlug: string;
  player: string;
  slot: FantasySlot;
}) {
  const router = useRouter();

  function handleDraft() {
    writeDraftPick(safeSessionStorage, tournamentSlug, slot, player);
    router.push("/fantasy");
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <Button fullWidth onClick={handleDraft}>
        Draft {getPlayerFirstName(player)}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/fantasy/FantasyDraftActionBar.tsx
git commit -m "Add FantasyDraftActionBar"
```

---

## Task 12: Wire `draftSlot` into the player profile route

**Files:**
- Modify: `app/leaderboard/[slug]/players/[player]/page.tsx`
- Modify: `components/scorecard/LivePlayerScorecard.tsx`

**Interfaces:**
- Consumes: `FantasyDraftActionBar` (Task 11), `FantasySlot` (`@/lib/fantasy/draftState`).
- Produces: `LivePlayerScorecard` gains an optional `draftSlot?: FantasySlot` prop; when set, it shows `FantasyDraftActionBar` and pads the page so the fixed bar doesn't cover content. No change to a normal (non-fantasy) visit.

- [ ] **Step 1: Update `LivePlayerScorecard`**

In `components/scorecard/LivePlayerScorecard.tsx`, add the import and prop, and render the action bar:

```tsx
import { PlayerBioSection } from "./PlayerBioSection";
import { PlayerProfileHeader } from "@/components/scorecard/PlayerProfileHeader";
import { PlayerScorecardView } from "./PlayerScorecardView";
import { FantasyDraftActionBar } from "@/components/fantasy/FantasyDraftActionBar";
import { DETAIL_POLL_MS, useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament, isLiveNow } from "@/lib/data";
import { getPlayerSlug, getPlayerDisplayName, getPlayerAvatar, getPlayerProfile } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";
import type { FantasySlot } from "@/lib/fantasy/draftState";
import { placementValueLabel } from "@/lib/leaderboard/placement";

export function LivePlayerScorecard({
  tournamentSlug,
  player,
  backHref,
  draftSlot,
}: {
  tournamentSlug: string;
  player: string;
  backHref?: string;
  draftSlot?: FantasySlot;
}) {
  const { tournament, loading, payload, error } = useLiveTournament(DETAIL_POLL_MS, `/api/live/players/${encodeURIComponent(getPlayerSlug(player))}`);

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Loading confirmed scores...</p>;
  }

  const team: Team = tournament.roster.maroon.some((n) => getPlayerSlug(n) === getPlayerSlug(player)) ? "maroon" : "white";
  const displayName = getPlayerDisplayName(player);
  const scorecard = tournament.scorecards?.find((s) => getPlayerSlug(s.player) === getPlayerSlug(player));
  const profile = getPlayerProfile(player);

  const ranked = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const standing = ranked.find((p) => getPlayerSlug(p.player) === getPlayerSlug(player));
  const position = standing ? placementValueLabel(ranked, ranked.indexOf(standing)) : null;
  const total = standing?.toPar ?? null;
  const lastRound = scorecard?.rounds[scorecard.rounds.length - 1];
  const playedCount = lastRound?.holes.filter((h) => h.score > 0).length ?? 0;
  const thru = lastRound == null ? null : playedCount >= lastRound.holes.length ? "F" : String(playedCount);

  return (
    <div className={draftSlot ? "pb-20" : undefined}>
      {error && <p role="status" className="mb-4 text-sm text-maroon-700">{error}</p>}
      <PlayerProfileHeader
        backHref={backHref ?? `/leaderboard/${tournamentSlug}`}
        backLabel="Back"
        displayName={displayName}
        avatarSrc={getPlayerAvatar(player)}
        team={team}
        editionLabel={nextTournament.editionLabel}
        bio={profile?.bio ?? null}
        live={isLiveNow()}
        position={position}
        total={total}
        thru={thru}
      />

      {scorecard && scorecard.rounds.length > 0 ? (
        <PlayerScorecardView scorecard={scorecard} tournament={tournament} />
      ) : (
        <div className="px-5 py-8 bg-cream-50 border border-ink-100 rounded-md text-center">
          <p className="font-sans text-sm text-ink-500 m-0">No rounds posted for {displayName} yet - check back once play begins.</p>
        </div>
      )}
      {(!scorecard || scorecard.rounds.length === 0) && <PlayerBioSection profile={profile} featuredYear={nextTournament.year} />}

      {draftSlot && <FantasyDraftActionBar tournamentSlug={tournamentSlug} player={player} slot={draftSlot} />}
    </div>
  );
}
```

- [ ] **Step 2: Update the page to read and pass `draftSlot`**

In `app/leaderboard/[slug]/players/[player]/page.tsx`, replace the top of the file through the `nextTournament.slug` branch:

```tsx
import { notFound } from "next/navigation";
import { PlayerScorecardView } from "@/components/scorecard/PlayerScorecardView";
import { PlayerProfileHeader } from "@/components/scorecard/PlayerProfileHeader";
import { LivePlayerScorecard } from "@/components/scorecard/LivePlayerScorecard";
import { pastTournaments, nextTournament, getTournament, getPlayerScorecard, playersOf } from "@/lib/data";
import { getPlayerSlug, getPlayerAvatar, getPlayerDisplayName, getPlayerProfile } from "@/lib/data/players";
import { placementValueLabel } from "@/lib/leaderboard/placement";
import { getScorecardsForTournament, getShotVideoUrls } from "@/lib/data/archivedScorecards";
import type { FantasySlot } from "@/lib/fantasy/draftState";

export function generateStaticParams() {
  return pastTournaments.flatMap((t) =>
    playersOf(t).map(({ name }) => ({ slug: t.slug, player: name.toLowerCase() }))
  );
}

function parseDraftSlot(value: string | string[] | undefined): FantasySlot | undefined {
  return value === "maroon" || value === "white" || value === "wildcard" ? value : undefined;
}

export default async function PlayerScorecardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; player: string }>;
  searchParams: Promise<{ fromMatch?: string | string[]; draftSlot?: string | string[] }>;
}) {
  const { slug, player } = await params;
  const { fromMatch, draftSlot: draftSlotParam } = await searchParams;
  const draftSlot = parseDraftSlot(draftSlotParam);
  const backHref = draftSlot
    ? "/fantasy"
    : typeof fromMatch === "string" && fromMatch.length > 0
      ? `/leaderboard/${encodeURIComponent(slug)}/matches/${encodeURIComponent(fromMatch)}`
      : `/leaderboard/${slug}`;

  if (slug === nextTournament.slug) {
    return (
      <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
        <LivePlayerScorecard tournamentSlug={slug} player={player} backHref={backHref} draftSlot={draftSlot} />
      </div>
    );
  }
```

Leave the rest of the file (the past-tournament branch below this point) unchanged.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/leaderboard/[slug]/players/[player]/page.tsx components/scorecard/LivePlayerScorecard.tsx
git commit -m "Show a Draft button on a player's profile when reached from Fantasy"
```

---

## Task 13: Rewrite `app/fantasy/page.tsx` as the 5-state flow

**Files:**
- Modify: `app/fantasy/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6, 8, 9, 10 (`draftState.ts`, `FantasyDraftTabs`, `FantasyWelcome`, `FantasyYourTeam`), plus existing `useLiveTournament`, `getNextTournamentStatus` (`@/lib/data`), `FantasyPicks` (`@/lib/fantasy/scoring`, unchanged).
- Produces: the page component itself - nothing else depends on its internals.

- [ ] **Step 1: Replace the file**

```tsx
// app/fantasy/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus } from "@/lib/data";
import { FantasyWelcome } from "@/components/fantasy/FantasyWelcome";
import { FantasyDraftTabs } from "@/components/fantasy/FantasyDraftTabs";
import { FantasyYourTeam } from "@/components/fantasy/FantasyYourTeam";
import {
  EMPTY_DRAFT_PICKS,
  clearDraftPicks,
  hasDraftInProgress,
  readDraftPicks,
  safeSessionStorage,
  seedDraftPicks,
  type DraftPicks,
} from "@/lib/fantasy/draftState";
import type { FantasyPicks } from "@/lib/fantasy/scoring";

function toFantasyPicks(picks: DraftPicks): FantasyPicks | null {
  if (!picks.maroon || !picks.white || !picks.wildcard) return null;
  return { maroonPlayer: picks.maroon, whitePlayer: picks.white, wildcardPlayer: picks.wildcard };
}

function toDraftPicks(picks: FantasyPicks): DraftPicks {
  return { maroon: picks.maroonPlayer, white: picks.whitePlayer, wildcard: picks.wildcardPlayer };
}

export default function FantasyPage() {
  const { tournament, loading: tournamentLoading, payload } = useLiveTournament();
  const [savedPicks, setSavedPicks] = useState<FantasyPicks | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [picks, setPicks] = useState<DraftPicks>(EMPTY_DRAFT_PICKS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load whatever team the user already has saved for the current tournament (if any).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/fantasy/team", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && data.picks) setSavedPicks(data.picks);
      } catch {
        // Couldn't load a saved team - leave it empty, the user can still draft fresh.
      } finally {
        if (!cancelled) setLoadingTeam(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resume a draft left in progress (started here, possibly continued on a
  // player's profile page and back) once the tournament slug is known.
  useEffect(() => {
    if (!tournament.slug) return;
    if (hasDraftInProgress(safeSessionStorage, tournament.slug)) {
      setPicks(readDraftPicks(safeSessionStorage, tournament.slug));
      setDrafting(true);
    }
  }, [tournament.slug]);

  const locked = getNextTournamentStatus() !== "upcoming";
  const rosterIsEmpty = tournament.roster.maroon.length === 0 && tournament.roster.white.length === 0;

  function startDraft(seed: DraftPicks) {
    seedDraftPicks(safeSessionStorage, tournament.slug, seed);
    setPicks(seed);
    setError(null);
    setDrafting(true);
  }

  async function submitLineup() {
    const fantasyPicks = toFantasyPicks(picks);
    if (!fantasyPicks) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/fantasy/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fantasyPicks),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Couldn't save your lineup.");
        return;
      }
      clearDraftPicks(safeSessionStorage, tournament.slug);
      setSavedPicks(fantasyPicks);
      setDrafting(false);
    } catch {
      setError("Couldn't reach the server - try again.");
    } finally {
      setSaving(false);
    }
  }

  if ((tournamentLoading && !payload) || loadingTeam) {
    return <p className="py-10 text-center font-sans text-sm text-ink-400">Loading Fantasy...</p>;
  }

  if (rosterIsEmpty) {
    return (
      <p className="rounded-md border border-ink-100 bg-cream-50 px-4 py-6 text-center font-sans text-sm text-ink-500">
        Rosters for {tournament.editionLabel} haven&rsquo;t been set yet — check back closer to the tournament.
      </p>
    );
  }

  if (drafting && !locked) {
    return <FantasyDraftTabs tournament={tournament} picks={picks} onSubmit={submitLineup} saving={saving} error={error} />;
  }

  if (savedPicks) {
    return (
      <FantasyYourTeam
        tournament={tournament}
        picks={savedPicks}
        locked={locked}
        onEdit={() => startDraft(toDraftPicks(savedPicks))}
      />
    );
  }

  if (locked) {
    return (
      <div className="mt-10 text-center">
        <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Fantasy</h1>
        <p className="mt-3 font-sans text-sm text-ink-500">Fantasy picks are closed for {tournament.editionLabel}.</p>
      </div>
    );
  }

  return <FantasyWelcome editionLabel={tournament.editionLabel} onStart={() => startDraft(EMPTY_DRAFT_PICKS)} />;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/fantasy/page.tsx
git commit -m "Rewrite the Fantasy page as welcome -> draft tabs -> your team"
```

---

## Task 14: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: every test passes, including all new tests from Tasks 1, 5, 6, and every pre-existing test still passing (in particular, nothing in `lib/data/*.test.ts`, `lib/wagers/*.test.ts`, or any test that constructs a `Tournament`/uses `useLiveTournament`/`fetchLiveTournament` broke).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean on every file this plan touched (pre-existing unrelated lint errors elsewhere, if any, are out of scope - confirm with `git stash` that they predate this work if any show up).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean build, `/fantasy`, `/api/confirmed-roster`, and `/api/fantasy/team` all listed among the routes.

- [ ] **Step 5: Manual smoke check with the dev server**

Run: `npm run dev`, then visit `/fantasy` signed in.

Expected today (before Cade locks any 2027 players into Maroon/White): the "Rosters haven't been set yet" message, unchanged from before this work - confirming the empty-roster path still renders correctly and nothing crashes. Note in the task wrap-up that full click-through of the welcome → draft tabs → profile → Draft → Submit Lineup → Your Team → Edit Lineup path needs a real confirmed roster to exist, which isn't true in production yet (see the spec's Testing section) - this is expected, not a bug, and matches how several recent rounds in `project_specs.md` shipped ahead of the data existing to fully click-test against.

- [ ] **Step 6: Update `project_specs.md`**

Add a new entry to the "Previously shipped rounds" list (matching the existing style/voice of that file's most recent entries) summarizing: the Fantasy draft redesign (welcome hero, 3 tabs, profile drill-in draft, Submit Lineup, Edit Lineup, lock-on-live), and the confirmed-roster overlay fix and what it also fixed for free (`LivePlayerScorecard`'s team badge). Note the same "not click-tested against a real locked roster yet" caveat from Step 5.

- [ ] **Step 7: Final commit**

```bash
git add project_specs.md
git commit -m "Update project_specs.md: Fantasy draft redesign"
```

---

## Self-Review Notes

- **Spec coverage:** Fix #1 (roster overlay, both server and client sites) - Tasks 1, 2, 3, 4. Fix #2 (real lock enforcement) - Task 5. Five page states - Task 13, built from Tasks 8-10. In-progress draft persistence - Task 6. Profile drill-in + Draft button - Tasks 7, 11, 12. Testing section - Tasks 1, 5, 6 (unit tests for every new pure function) and Task 14 (full-project verification). "What done looks like" checklist in the spec is covered end to end.
- **Type consistency checked:** `FantasySlot`/`DraftPicks` (Task 6) are the same type used in Tasks 7, 8, 11, 12, 13 throughout. `RosterEntry` (existing type) is what Task 1's `overlayConfirmedRoster` and Task 3's route both use unchanged. `FantasyPicks` (existing, from `lib/fantasy/scoring.ts`) is what `savedPicks`/`FantasyYourTeam`/`toFantasyPicks`/`toDraftPicks` all agree on in Task 13.
- **No placeholders:** every step above has real, complete code - nothing marked TBD.
