# Player Area Nav + Scoring Status Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give signed-in players a persistent 3-way nav (Website / Portal / Scoring) usable from anywhere, and build the first real Scoring screen — a status view showing whether a round is scheduled, and its tee time/matchup/live state.

**Architecture:** Two independent pieces sharing one visual shell. (1) `PlayerAreaNav`, a client component reading the existing `useAccountSession()` hook, rendered in the root layout for player sessions only. (2) `/portal/scoring`, a new server-rendered route that reads round/matchup data and renders one of three states through a generalized `LoadingScreen`. The round-status computation reuses the already-shipped `effectiveMatchState()` — no new match-state logic.

**Tech Stack:** Next.js App Router (server components + one client component), Tailwind CSS v4, Supabase (`live_round_state`/`live_match_boxes` tables), `node:test` for pure-logic unit tests (matches `lib/live/orchestration.test.ts`).

**Spec:** `docs/superpowers/specs/2026-08-29-player-area-nav-scoring-design.md`

## Global Constraints

- **Worktree/branch base is `worktree-tiger-center-matchups`, NOT `main`.** This plan's data code uses `LiveMatchBox.round`, which only exists on that branch (main still has the old `tournamentYear/day/session` shape). When setting up the isolated worktree for this plan, branch it from `worktree-tiger-center-matchups`, not from `main`.
- No React component test framework exists in this repo (`npm test` only runs `.test.ts`/`.test.mts` under `lib/` and `app/`, per `package.json`'s `test` script) — UI tasks are verified via `npx tsc --noEmit`, `npm run lint`, `npm run build`, and a manual dev-server check, matching how every prior UI round in this project was verified. Only pure logic (no Supabase I/O) gets `node:test` unit tests, matching `lib/live/orchestration.test.ts`'s own documented limitation that Supabase-touching code needs a real request lifecycle to test.
- Follow the existing per-file convention for mapping Supabase rows to `Live*` types (a local `interface FooRow` + a local mapping function in the file that queries it) rather than introducing a shared abstraction — every existing route (`app/api/portal/tiger/rounds/route.ts`, `app/api/portal/tiger/matchboxes/route.ts`) already does it this way.
- Exact copy, verbatim: "Waiting For Matchup", "Upcoming Round", "Waiting For Round To Begin", "Round Live", "Scorecard".

---

### Task 1: Generalize `LoadingScreen` for a swappable heading + a top greeting slot

**Files:**
- Modify: `components/LoadingScreen.tsx`
- Modify: `components/home/HomeEntrySplash.tsx`
- Modify: `app/account/choose/page.tsx`

**Interfaces:**
- Produces: `LoadingScreen({ heading: ReactNode; raised?: boolean; topSlot?: ReactNode; children?: ReactNode })` — `heading` is now required (was hardcoded text), `topSlot` is new.

- [ ] **Step 1: Update `LoadingScreen` to accept `heading` and `topSlot`**

Replace the full contents of `components/LoadingScreen.tsx`:

```tsx
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Full-screen background used by every full-takeover screen: the plain
 * "site is loading" splash (fans / signed-out visitors), the post-login
 * fork screen (`/account/choose`), and the Scoring status screen
 * (`/portal/scoring`). `heading` is the big title line (was hardcoded
 * "The Maroon Masters" — now each caller supplies its own so this shell can
 * be reused for different titles). `topSlot` is a separate, optional small
 * line pinned near the top of the screen (e.g. a "Welcome, {name}"
 * greeting), independent of the centered/raised heading block below it.
 *
 * Purely presentational — it doesn't decide when to show or hide itself;
 * callers own that.
 */
export function LoadingScreen({
  heading,
  raised = false,
  topSlot,
  children,
}: {
  heading: ReactNode;
  raised?: boolean;
  topSlot?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      <Image
        src="/loading/mobile.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover lg:hidden"
      />
      <Image
        src="/loading/desktop.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hidden object-cover lg:block"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-maroon-900/70 via-maroon-900/30 to-maroon-900/70" />

      {topSlot && (
        <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+2rem)] px-6 text-center font-sans text-sm font-medium text-cream-50/90">
          {topSlot}
        </div>
      )}

      <div
        className={`relative flex h-full flex-col items-center gap-6 px-6 text-center ${
          raised
            ? "justify-start pt-[22vh] lg:pt-[18vh]"
            : "justify-center -translate-y-[3vh] lg:translate-y-0"
        }`}
      >
        <h1 className="font-serif text-4xl font-bold uppercase tracking-eyebrow text-cream-50 drop-shadow-lg sm:text-5xl">
          {heading}
        </h1>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `HomeEntrySplash` to pass `heading`**

In `components/home/HomeEntrySplash.tsx`, change:

```tsx
  if (showSplash) {
    return <LoadingScreen />;
  }
```

to:

```tsx
  if (showSplash) {
    return <LoadingScreen heading="The Maroon Masters" />;
  }
```

- [ ] **Step 3: Update the fork screen to pass `heading`**

In `app/account/choose/page.tsx`, change:

```tsx
  return (
    <LoadingScreen raised>
```

to:

```tsx
  return (
    <LoadingScreen heading="The Maroon Masters" raised>
```

- [ ] **Step 4: Verify no regressions**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (exit code 0), no new warnings.

Start the dev server and open `/` in a browser: confirm the homepage splash still shows "The Maroon Masters" exactly as before (title text, positioning, timing unchanged). Log in as a player (or reuse the temporary-debug-route technique from earlier in this project if no test login is handy) and open `/account/choose`: confirm it's unchanged — "The Maroon Masters" raised, Portal/Website links below.

- [ ] **Step 5: Commit**

```bash
git add components/LoadingScreen.tsx components/home/HomeEntrySplash.tsx app/account/choose/page.tsx
git commit -m "refactor: make LoadingScreen's heading a prop, add a top greeting slot"
```

---

### Task 2: `PlayerAreaNav` — the persistent Website/Portal/Scoring switcher

**Files:**
- Create: `components/nav/PlayerAreaNav.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `useAccountSession()` from `@/lib/useAccountSession` (existing) — renders nothing unless `session?.kind === "player"`.
- Produces: `PlayerAreaNav()` — a component with no props, rendered once in the root layout.

- [ ] **Step 1: Create `PlayerAreaNav`**

```tsx
// components/nav/PlayerAreaNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccountSession } from "@/lib/useAccountSession";

const SEGMENTS = [
  { href: "/", label: "Website" },
  { href: "/portal", label: "Portal" },
  { href: "/portal/scoring", label: "Scoring" },
] as const;

type SegmentHref = (typeof SEGMENTS)[number]["href"];

function activeSegment(pathname: string): SegmentHref {
  if (pathname.startsWith("/portal/scoring")) return "/portal/scoring";
  if (pathname.startsWith("/portal")) return "/portal";
  return "/";
}

/**
 * A persistent switcher between the three areas a player account has
 * access to — Website, Portal, Scoring — so they never have to go back to
 * the post-login fork screen (`/account/choose`) to move between them.
 * Rendered in the root layout for every page; renders nothing for fans,
 * Tiger, or signed-out visitors.
 */
export function PlayerAreaNav() {
  const session = useAccountSession();
  const pathname = usePathname();

  if (session?.kind !== "player") return null;

  const active = activeSegment(pathname);

  return (
    <nav className="flex h-11 items-stretch bg-maroon-900">
      {SEGMENTS.map((segment) => {
        const on = segment.href === active;
        return (
          <Link
            key={segment.href}
            href={segment.href}
            className={[
              "flex flex-1 items-center justify-center font-condensed text-xs font-bold uppercase tracking-wide transition-colors",
              on ? "bg-cream-50 text-maroon-700" : "text-white",
            ].join(" ")}
          >
            {segment.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Render it in the root layout**

In `app/layout.tsx`, add the import alongside the existing `Header`/`Footer` imports:

```tsx
import { PlayerAreaNav } from "@/components/nav/PlayerAreaNav";
```

Then change:

```tsx
        <Header />
        {children}
```

to:

```tsx
        <Header />
        <PlayerAreaNav />
        {children}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

In the dev server, confirm with a signed-out visitor (or a fan account) that nothing new appears under the header on any page. Confirm with a player account that the bar appears on every page, is maroon with white text, 3 equal segments reading Website/Portal/Scoring, and the correct segment turns white-with-maroon-text on `/`, `/portal`, and `/portal/scoring` (this last one will 404 until Task 4 — checking the highlight logic itself doesn't require the page to exist, `usePathname()` still reports it correctly).

- [ ] **Step 4: Commit**

```bash
git add components/nav/PlayerAreaNav.tsx app/layout.tsx
git commit -m "feat: add persistent Website/Portal/Scoring nav for player accounts"
```

---

### Task 3: `lib/live/currentRoundForPlayer.ts` — find and describe a player's next round

**Files:**
- Create: `lib/live/currentRoundForPlayer.ts`
- Test: `lib/live/currentRoundForPlayer.test.ts`

**Interfaces:**
- Consumes: `LiveRoundState`, `LiveMatchBox`, `LiveTournamentSnapshot`, `MatchState` (from `./types`); `effectiveMatchState` (from `./orchestration`); `getPlayerDisplayName` (from `@/lib/data/players`); `createSupabaseServerClient` (from `@/lib/supabase/server`).
- Produces:
  - `CurrentRoundResult` — `{ round: LiveRoundState; matchBox: LiveMatchBox; state: MatchState }`
  - `pickCurrentRound(rounds: LiveRoundState[], matchBoxes: LiveMatchBox[], playerSlug: string): CurrentRoundResult | null` — pure, used by Task 4.
  - `matchupLabel(playerSlug: string, matchBox: LiveMatchBox): string` — pure, used by Task 4.
  - `findCurrentRoundForPlayer(playerSlug: string): Promise<CurrentRoundResult | null>` — I/O wrapper, used by Task 4.

- [ ] **Step 1: Write the failing tests for `pickCurrentRound` and `matchupLabel`**

```ts
// lib/live/currentRoundForPlayer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveMatchBox, LiveRoundState } from "./types.ts";
import { getPlayerDisplayName } from "../data/players/index.ts";
import { pickCurrentRound, matchupLabel } from "./currentRoundForPlayer.ts";

function round(overrides: Partial<LiveRoundState> & { round: number }): LiveRoundState {
  return {
    started: false,
    courseId: null,
    date: "2027-01-06",
    format: "Fourball",
    courseLocked: true,
    matchupsLocked: true,
    ...overrides,
  };
}

function box(overrides: Partial<LiveMatchBox> & { round: number; maroonPlayers: string[]; whitePlayers: string[] }): LiveMatchBox {
  return {
    id: "box-1",
    boxNumber: 1,
    format: "Fourball",
    teeTime: new Date("2027-01-06T09:30:00-06:00"),
    state: "Scheduled",
    started: false,
    ...overrides,
  };
}

test("pickCurrentRound returns null when no round is fully locked", () => {
  const rounds = [round({ round: 1, courseLocked: false })];
  const boxes = [box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] })];
  assert.equal(pickCurrentRound(rounds, boxes, "cam"), null);
});

test("pickCurrentRound returns null when the player has no box in any locked round", () => {
  const rounds = [round({ round: 1 })];
  const boxes = [box({ round: 1, maroonPlayers: ["hugo", "nate"], whitePlayers: ["drew", "luke"] })];
  assert.equal(pickCurrentRound(rounds, boxes, "cam"), null);
});

test("pickCurrentRound returns Scheduled when the round hasn't started", () => {
  const rounds = [round({ round: 1 })];
  const boxes = [box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: false })];
  const result = pickCurrentRound(rounds, boxes, "cam");
  assert.equal(result?.state, "Scheduled");
  assert.equal(result?.round.round, 1);
});

test("pickCurrentRound returns Armed when started but the tee time hasn't arrived", () => {
  const rounds = [round({ round: 1 })];
  const futureTeeTime = new Date(Date.now() + 60 * 60 * 1000);
  const boxes = [box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: true, teeTime: futureTeeTime })];
  assert.equal(pickCurrentRound(rounds, boxes, "cam")?.state, "Armed");
});

test("pickCurrentRound returns Live once started and the tee time has passed", () => {
  const rounds = [round({ round: 1 })];
  const pastTeeTime = new Date(Date.now() - 60 * 60 * 1000);
  const boxes = [box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: true, teeTime: pastTeeTime })];
  assert.equal(pickCurrentRound(rounds, boxes, "cam")?.state, "Live");
});

test("pickCurrentRound skips a Final round in favor of the next locked round", () => {
  const rounds = [round({ round: 1 }), round({ round: 2 })];
  const boxes = [
    box({ round: 1, boxNumber: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], state: "Final" }),
    box({ round: 2, boxNumber: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"], started: false }),
  ];
  const result = pickCurrentRound(rounds, boxes, "cam");
  assert.equal(result?.round.round, 2);
  assert.equal(result?.state, "Scheduled");
});

test("matchupLabel lists the player first, teammate before opponents, for Fourball", () => {
  const matchBox = box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] });
  const expected = `You & ${getPlayerDisplayName("hugo")} vs. ${getPlayerDisplayName("drew")} & ${getPlayerDisplayName("luke")}`;
  assert.equal(matchupLabel("cam", matchBox), expected);
});

test("matchupLabel handles Singles (one player per side, no teammate)", () => {
  const matchBox = box({ round: 1, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["drew"] });
  assert.equal(matchupLabel("cam", matchBox), `You vs. ${getPlayerDisplayName("drew")}`);
});

test("matchupLabel works from either side of the box", () => {
  const matchBox = box({ round: 1, maroonPlayers: ["cam", "hugo"], whitePlayers: ["drew", "luke"] });
  const expected = `You & ${getPlayerDisplayName("luke")} vs. ${getPlayerDisplayName("cam")} & ${getPlayerDisplayName("hugo")}`;
  assert.equal(matchupLabel("drew", matchBox), expected);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test lib/live/currentRoundForPlayer.test.ts`
Expected: FAIL — `currentRoundForPlayer.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Implement `currentRoundForPlayer.ts`**

```ts
// lib/live/currentRoundForPlayer.ts
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerDisplayName } from "@/lib/data/players";
import { effectiveMatchState } from "./orchestration";
import type { LiveMatchBox, LiveRoundState, LiveTournamentSnapshot, MatchFormat, MatchState } from "./types";

export interface CurrentRoundResult {
  round: LiveRoundState;
  matchBox: LiveMatchBox;
  state: MatchState;
}

// effectiveMatchState() only needs matchBox.state/.started/.teeTime plus
// hole-completeness (via snapshot.scores) to tell Scheduled/Armed/Live/Final
// apart. No live scoring exists yet anywhere in this build, so an empty
// snapshot is accurate today and needs no changes once scoring ships.
const EMPTY_SNAPSHOT: LiveTournamentSnapshot = {
  players: {},
  courses: {},
  roundCourses: {},
  scores: new Map(),
  matchBoxes: [],
};

/**
 * The next round relevant to this player: the lowest-numbered fully locked
 * round (course + matchups) that has a match box containing them, whose
 * computed state isn't yet Final. Pure — no I/O — so the selection rule is
 * fully unit-testable without a live Supabase instance.
 */
export function pickCurrentRound(rounds: LiveRoundState[], matchBoxes: LiveMatchBox[], playerSlug: string): CurrentRoundResult | null {
  const lockedRounds = rounds.filter((r) => r.courseLocked && r.matchupsLocked).sort((a, b) => a.round - b.round);

  for (const round of lockedRounds) {
    const matchBox = matchBoxes.find(
      (box) => box.round === round.round && (box.maroonPlayers.includes(playerSlug) || box.whitePlayers.includes(playerSlug))
    );
    if (!matchBox) continue;

    const state = effectiveMatchState(EMPTY_SNAPSHOT, matchBox);
    if (state === "Final") continue;

    return { round, matchBox, state };
  }

  return null;
}

/**
 * "You & Cam vs. Drew & Hugo" (Fourball/Foursome) or "You vs. Drew"
 * (Singles) — this player's side first, teammate before opponents.
 */
export function matchupLabel(playerSlug: string, matchBox: LiveMatchBox): string {
  const onMaroon = matchBox.maroonPlayers.includes(playerSlug);
  const ownSide = onMaroon ? matchBox.maroonPlayers : matchBox.whitePlayers;
  const otherSide = onMaroon ? matchBox.whitePlayers : matchBox.maroonPlayers;
  const teammates = ownSide.filter((slug) => slug !== playerSlug).map(getPlayerDisplayName);
  const opponents = otherSide.map(getPlayerDisplayName);
  return `${["You", ...teammates].join(" & ")} vs. ${opponents.join(" & ")}`;
}

interface RoundRow {
  round: number;
  started: boolean;
  course_id: string | null;
  date: string | null;
  format: string | null;
  course_locked: boolean;
  matchups_locked: boolean;
}

function roundFromRow(row: RoundRow): LiveRoundState {
  return {
    round: row.round,
    started: row.started,
    courseId: row.course_id,
    date: row.date,
    format: row.format as MatchFormat | null,
    courseLocked: row.course_locked,
    matchupsLocked: row.matchups_locked,
  };
}

interface MatchBoxRow {
  id: string;
  round: number;
  box_number: number;
  format: string;
  tee_time: string;
  maroon_players: string[];
  white_players: string[];
  state: string;
  started: boolean;
}

function matchBoxFromRow(row: MatchBoxRow): LiveMatchBox {
  return {
    id: row.id,
    round: row.round,
    boxNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  };
}

// Not unit tested: createSupabaseServerClient() needs a real request
// lifecycle, same documented limitation as lib/portal/requireHost.test.mts
// and app/api/portal/profile/route.test.mts. pickCurrentRound() above (the
// actual selection rule) is where the real logic lives and is fully tested.
export async function findCurrentRoundForPlayer(playerSlug: string): Promise<CurrentRoundResult | null> {
  const supabase = await createSupabaseServerClient();

  const [{ data: roundRows }, { data: boxRows }] = await Promise.all([
    supabase.from("live_round_state").select("round, started, course_id, date, format, course_locked, matchups_locked").order("round"),
    supabase.from("live_match_boxes").select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started").order("round"),
  ]);

  const rounds = (roundRows ?? []).map(roundFromRow);
  const matchBoxes = (boxRows ?? []).map(matchBoxFromRow);

  return pickCurrentRound(rounds, matchBoxes, playerSlug);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test lib/live/currentRoundForPlayer.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Run the full checks**

Run: `npm test`
Expected: every test in the repo still passes (this file's tests plus all existing ones).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/live/currentRoundForPlayer.ts lib/live/currentRoundForPlayer.test.ts
git commit -m "feat: add pickCurrentRound/matchupLabel/findCurrentRoundForPlayer"
```

---

### Task 4: `/portal/scoring` — the Scoring status screen

**Files:**
- Create: `components/portal/ScoringStatusScreen.tsx`
- Create: `app/portal/scoring/page.tsx`

**Interfaces:**
- Consumes: `LoadingScreen` (from `@/components/LoadingScreen`, Task 1); `CurrentRoundResult`, `matchupLabel`, `findCurrentRoundForPlayer` (from `@/lib/live/currentRoundForPlayer`, Task 3); `nextTournament` (from `@/lib/data`); `getPlayerProfileBySlug` (from `@/lib/data/players`); `createSupabaseServerClient` (from `@/lib/supabase/server`).
- Produces: `ScoringStatusScreen({ playerName: string; playerSlug: string; result: CurrentRoundResult | null })`.

- [ ] **Step 1: Create the presentational screen**

```tsx
// components/portal/ScoringStatusScreen.tsx
import { LoadingScreen } from "@/components/LoadingScreen";
import { matchupLabel, type CurrentRoundResult } from "@/lib/live/currentRoundForPlayer";
import { nextTournament } from "@/lib/data";

function formatTeeTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * The three states of the Scoring landing screen (see
 * docs/superpowers/specs/2026-08-29-player-area-nav-scoring-design.md):
 * no round yet, an upcoming (not-yet-live) round, and a live round. The
 * actual hole-by-hole scoring entry screen doesn't exist yet — tapping the
 * Scorecard box does nothing for now.
 */
export function ScoringStatusScreen({
  playerName,
  playerSlug,
  result,
}: {
  playerName: string;
  playerSlug: string;
  result: CurrentRoundResult | null;
}) {
  const topSlot = <>Welcome, {playerName}</>;

  if (!result) {
    return (
      <LoadingScreen heading={`Maroon Masters ${nextTournament.year}`} topSlot={topSlot}>
        <p className="font-sans text-lg text-cream-50/90">Waiting For Matchup</p>
      </LoadingScreen>
    );
  }

  const { matchBox, state } = result;
  const live = state === "Live";

  return (
    <LoadingScreen heading={live ? "Round Live" : "Upcoming Round"} topSlot={topSlot} raised>
      <p className="font-sans text-lg text-cream-50/90">{formatTeeTime(matchBox.teeTime)}</p>
      <p className="font-sans text-base text-cream-50/80">{matchupLabel(playerSlug, matchBox)}</p>
      <div
        className={[
          "mt-4 flex h-16 w-40 items-center justify-center rounded-md border-2 border-maroon-700",
          live ? "opacity-100" : "opacity-40",
        ].join(" ")}
      >
        <span className="font-condensed text-sm font-bold uppercase tracking-wide text-maroon-700">Scorecard</span>
      </div>
      {!live && <p className="font-sans text-sm text-cream-50/80">Waiting For Round To Begin</p>}
    </LoadingScreen>
  );
}
```

- [ ] **Step 2: Create the route**

```tsx
// app/portal/scoring/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { findCurrentRoundForPlayer } from "@/lib/live/currentRoundForPlayer";
import { ScoringStatusScreen } from "@/components/portal/ScoringStatusScreen";

export default async function ScoringPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_host, player_slug, display_name")
    .eq("id", user.id)
    .single();

  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const playerSlug = profile.player_slug!;
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  const playerName = playerProfile?.fullName ?? profile.display_name;
  const result = await findCurrentRoundForPlayer(playerSlug);

  return <ScoringStatusScreen playerName={playerName} playerSlug={playerSlug} result={result} />;
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

Manual check in the dev server, signed in as a player account:
1. With no rows in `live_round_state`/`live_match_boxes` (or none matching this player): `/portal/scoring` shows "Welcome, {name}" at top, centered "Maroon Masters {year}" / "Waiting For Matchup", no box.
2. Insert a locked round (`course_locked = true`, `matchups_locked = true`) and a match box containing this player, `started = false`: screen shows the raised layout, "Upcoming Round", tee time, matchup line, and a faint Scorecard box with "Waiting For Round To Begin" underneath.
3. Set that match box's `started = true` with a `tee_time` in the past: heading changes to "Round Live", box goes full opacity, caption disappears.
4. Confirm `PlayerAreaNav`'s Scoring segment highlights correctly on this page (built in Task 2).

- [ ] **Step 4: Commit**

```bash
git add components/portal/ScoringStatusScreen.tsx app/portal/scoring/page.tsx
git commit -m "feat: add the Scoring status screen at /portal/scoring"
```
