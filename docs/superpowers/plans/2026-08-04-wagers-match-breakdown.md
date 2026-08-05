# Wagers — Match Breakdown + Wagers Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Match Breakdown page (Maroon-vs-White header, mock Wagers, live status/statistics) reachable by tapping any match on the leaderboard, plus a `/wagers` hub (today's matches, player props, tournament/team futures, a fake balance, and bet history) linked from the More menu — all using realistic placeholder odds and a fake local balance, per `docs/superpowers/specs/2026-08-04-wagers-match-breakdown-design.md`.

**Architecture:** A new `lib/wagers/` module holds shared types, deterministic mock-odds generation, American-odds math, and a `localStorage`-backed fake balance/wager ledger keyed per signed-in account. A new `components/wagers/` folder holds presentational pieces (odds buttons, a shared single-selection bet slip, futures/props lists, a sign-in gate) built once and reused across both surfaces. The Match Breakdown page follows the exact live/static split already used by the player-tournament-profile route (`app/leaderboard/[slug]/players/[player]/page.tsx`): a server component branches on `slug === nextTournament.slug`, either rendering static data directly or delegating to a `"use client"` component that polls the live feed. `CompactMatchRow` becomes clickable, and `MorePanel` gains a `Wagers` link.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS 4 with `@theme` design tokens (`maroon-700`, `gold-400`, `ink-900`, `cream-50`, `score-under`, `fairway-700`, etc. — see `app/globals.css`).

## Global Constraints

- Use existing Tailwind design tokens only (`maroon-700`, `maroon-200`, `maroon-50`, `gold-400`, `gold-500`, `ink-900`, `ink-700`, `ink-500`, `ink-400`, `ink-300`, `ink-100`, `cream-50`, `score-under`, `fairway-700`, `fairway-300`) — never new raw hex. The one exception already established in this codebase is `Badge.tsx`'s fairway background (`bg-[#E2EDE7]`, no token exists for it yet) — reuse that exact value where a fairway-tinted background is needed, don't invent a new one.
- No frontend test runner exists in this codebase (confirmed: no vitest/jest, no `.test.ts`/`.spec.ts` files, Playwright is installed but unconfigured). Each task's verification step is `npx tsc --noEmit` plus `npm run lint`; the final task is a manual browser walkthrough via `npm run dev` (runs on port 3001 per `package.json`).
- Player route params are the roster short name lowercased (e.g. `"cade"`), consistent everywhere already (`player.toLowerCase()`) — never `PlayerProfile.slug`.
- The Wagers hub (`/wagers`) only ever shows the live/current tournament (`useLiveTournament()`), matching the design spec's "today's matches" framing — no past-tournament browsing there. The Match Breakdown page supports both the live tournament and any past tournament, mirroring the existing player-profile route split.
- Mock odds (`lib/wagers/mockOdds.ts`) are deterministic placeholders seeded off IDs already in the data — explicitly not reactive to live match state, to be replaced wholesale by a real odds engine in a later phase. Don't try to make these "smarter."
- Balance/wager storage is plain `localStorage`, one entry per signed-in account, mirroring the existing pattern in `lib/useAccountSession.ts` (including its `CustomEvent`-based change notification). This is explicitly throwaway per the design spec — Phase 3 replaces it with real persistence.
- The sign-in gate checks `accountKey(useAccountSession()) !== null` — today that only recognizes host/player Scorekeeper logins (localStorage-based), not general fan accounts, because the general "anyone can sign up" system (`accounts-foundation`) hasn't shipped yet. This is intentional and forward-compatible: accounts-foundation's own spec says it replaces `useAccountSession`'s internals while keeping the same null/non-null contract.
- `/login` and `/signup` **do not exist yet** (confirmed in `components/nav/AccountMenu.tsx`: the Sign Up/Login buttons there are `disabled` with a "Coming soon" tooltip). `SignInGate` therefore points at `/portal` — the only sign-in that actually works today — not at `/login`/`/signup`. Update this once accounts-foundation ships.
- Explicitly out of scope (per the design spec): real money/persistence, purchasing fake credits, auto-settlement, the real odds engine, hole-by-hole match data, prop bets on player profile pages, parlays/combos.
- All file paths below are relative to `C:\Users\Owner\Documents\GitHub\MM-Website`.

---

### Task 1: Wagers shared types

**Files:**
- Create: `lib/wagers/types.ts`

**Interfaces:**
- Consumes: nothing (pure types).
- Produces: `PropMarket`, `FutureLadderEntry`, `TeamFutureOdds`, `WagerStatus`, `Wager` — consumed by Tasks 3, 4, 7, 9, 10, 11, 12, 13.

- [ ] **Step 1: Create the file**

`lib/wagers/types.ts`:
```ts
/** A single player prop market for one match — e.g. "Cade Barone, Strokes (this match), line 71.5". */
export interface PropMarket {
  id: string;
  matchId: string;
  player: string;
  statLabel: string;
  line: number;
  overOdds: number;
  underOdds: number;
}

/** One row of the Tournament Winner futures ladder. */
export interface FutureLadderEntry {
  player: string;
  odds: number;
}

/** Maroon-vs-White two-way futures odds for who wins the tournament overall. */
export interface TeamFutureOdds {
  maroon: number;
  white: number;
}

/** Only "pending" exists in this phase — there's no settlement engine yet. */
export type WagerStatus = "pending";

/** A single wager a signed-in account has placed, stored in `lib/wagers/wallet.ts`. */
export interface Wager {
  id: string;
  placedAt: string;
  selectionLabel: string;
  odds: number;
  stake: number;
  potentialPayout: number;
  status: WagerStatus;
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors (unconsumed so far, but must parse clean).

- [ ] **Step 3: Commit**

```bash
git add lib/wagers/types.ts
git commit -m "feat: add wagers shared types"
```

---

### Task 2: American odds math

**Files:**
- Create: `lib/wagers/americanOdds.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatAmericanOdds(odds: number): string`, `potentialPayout(stake: number, odds: number): number` — consumed by Tasks 7, 8, 12.

- [ ] **Step 1: Create the file**

`lib/wagers/americanOdds.ts`:
```ts
/** "+150" for a positive line, "-200" (already has its sign) for a negative one. */
export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

/** Standard American-odds payout: total returned (stake + profit) if the bet wins. */
export function potentialPayout(stake: number, odds: number): number {
  const profit = odds > 0 ? stake * (odds / 100) : stake * (100 / Math.abs(odds));
  return Math.round((stake + profit) * 100) / 100;
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/wagers/americanOdds.ts
git commit -m "feat: add American-odds formatting and payout math"
```

---

### Task 3: Mock odds generator

**Files:**
- Create: `lib/wagers/mockOdds.ts`

**Interfaces:**
- Consumes: `RealMatch`, `IndividualStanding`, `Tournament` (`@/lib/data/types`); `PropMarket`, `FutureLadderEntry`, `TeamFutureOdds` (`./types`, Task 1).
- Produces: `matchWinnerOdds(match)`, `matchPropMarkets(match)`, `tournamentWinnerLadder(standings)`, `teamWinnerOdds(tournament)` — consumed by Tasks 9, 10, 11, 13, 16.

- [ ] **Step 1: Create the file**

`lib/wagers/mockOdds.ts`:
```ts
import type { RealMatch, IndividualStanding, Tournament } from "@/lib/data/types";
import type { PropMarket, FutureLadderEntry, TeamFutureOdds } from "./types";

/**
 * Deterministic pseudo-random placeholder odds — every function here is
 * seeded off IDs already in the data, so the same match/player always
 * produces the same mock odds, but nothing here reacts to live match
 * state. This is explicitly a stand-in for a real, stats-driven odds
 * engine (a later phase); it's meant to be replaced wholesale, not
 * extended.
 */
function seededFraction(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 10000) / 10000;
}

export function matchWinnerOdds(match: RealMatch): { maroon: number; white: number } {
  const r = seededFraction(`match-winner-${match.id}`);
  const favorite = -120 - Math.round(r * 200); // -120 to -320
  const underdog = 100 + Math.round(r * 220); // +100 to +320
  return r < 0.5 ? { maroon: favorite, white: underdog } : { maroon: underdog, white: favorite };
}

const PROP_STAT_TYPES: { label: string; baseLine: number; lineSpread: number }[] = [
  { label: "Strokes (this match)", baseLine: 70, lineSpread: 6 },
  { label: "Birdies (this match)", baseLine: 2, lineSpread: 3 },
];

export function matchPropMarkets(match: RealMatch): PropMarket[] {
  const players = [...match.maroonPlayers, ...match.whitePlayers];
  return players.flatMap((player) =>
    PROP_STAT_TYPES.map((stat) => {
      const lineSeed = seededFraction(`prop-line-${match.id}-${player}-${stat.label}`);
      // Always lands on a half-line (X.5) so a market never pushes.
      const roundedLine = Math.round((stat.baseLine + lineSeed * stat.lineSpread) * 2) / 2;
      return {
        id: `prop-${match.id}-${player}-${stat.label}`,
        matchId: match.id,
        player,
        statLabel: stat.label,
        line: roundedLine + 0.5,
        overOdds: -110,
        underOdds: -110,
      };
    })
  );
}

export function tournamentWinnerLadder(standings: IndividualStanding[]): FutureLadderEntry[] {
  return standings
    .map((standing) => ({
      player: standing.player,
      odds: 300 + Math.round(seededFraction(`future-player-${standing.player}`) * 4000),
    }))
    .sort((a, b) => a.odds - b.odds);
}

export function teamWinnerOdds(tournament: Tournament): TeamFutureOdds {
  const r = seededFraction(`future-team-${tournament.slug}`);
  const maroonFavored = r < 0.5;
  const favorite = -130 - Math.round(r * 100);
  const underdog = 110 + Math.round(r * 100);
  return maroonFavored ? { maroon: favorite, white: underdog } : { maroon: underdog, white: favorite };
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/wagers/mockOdds.ts
git commit -m "feat: add deterministic mock odds generator"
```

---

### Task 4: Wallet/ledger module

**Files:**
- Create: `lib/wagers/wallet.ts`

**Interfaces:**
- Consumes: `AccountSession` (`@/lib/useAccountSession`); `Wager` (`./types`, Task 1).
- Produces: `STARTING_BALANCE`, `accountKey(session)`, `getBalance(key)`, `getWagers(key)`, `placeWager(key, wager): boolean`, `onWagersChanged(handler): () => void` — consumed by Tasks 6, 7, 12, 16. All functions read/write `localStorage` and must only be called from client code (inside `"use client"` components, in effects or event handlers) — same constraint `lib/useAccountSession.ts` already operates under.

- [ ] **Step 1: Create the file**

`lib/wagers/wallet.ts`:
```ts
import type { AccountSession } from "@/lib/useAccountSession";
import type { Wager } from "./types";

export const STARTING_BALANCE = 1000;
const CHANGE_EVENT = "mm:wagers-changed";

/**
 * A stable per-account storage key. Returns null for a signed-out
 * visitor — callers use that to know there's nowhere to read/write a
 * balance, and to gate Wagers content on "is this null."
 */
export function accountKey(session: AccountSession): string | null {
  if (!session) return null;
  return session.kind === "host" ? `host:${session.username.toLowerCase()}` : `player:${session.playerFirst.toLowerCase()}`;
}

function balanceStorageKey(key: string): string {
  return `mm-wagers-balance:${key}`;
}

function historyStorageKey(key: string): string {
  return `mm-wagers-history:${key}`;
}

/** Reads the fake balance for `key`, seeding it to STARTING_BALANCE on first read. */
export function getBalance(key: string): number {
  const raw = localStorage.getItem(balanceStorageKey(key));
  if (raw == null) {
    localStorage.setItem(balanceStorageKey(key), String(STARTING_BALANCE));
    return STARTING_BALANCE;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : STARTING_BALANCE;
}

/** Every wager `key` has placed, newest first. */
export function getWagers(key: string): Wager[] {
  const raw = localStorage.getItem(historyStorageKey(key));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Deducts `wager.stake` from the balance and records `wager`. Returns
 * false (nothing changed) if the stake is invalid or exceeds the
 * current balance.
 */
export function placeWager(key: string, wager: Wager): boolean {
  const balance = getBalance(key);
  if (wager.stake <= 0 || wager.stake > balance) return false;

  localStorage.setItem(balanceStorageKey(key), String(balance - wager.stake));
  localStorage.setItem(historyStorageKey(key), JSON.stringify([wager, ...getWagers(key)]));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  return true;
}

/** Subscribes to balance/history changes made by `placeWager`; returns an unsubscribe function. */
export function onWagersChanged(handler: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/wagers/wallet.ts
git commit -m "feat: add localStorage-backed fake balance and wager ledger"
```

---

### Task 5: `SignInGate` component

**Files:**
- Create: `components/wagers/SignInGate.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/Button`); `useRouter` (`next/navigation`).
- Produces: `SignInGate()` — no props. Consumed by Tasks 7 (embedded in the bet slip) and 16 (the full `/wagers` page gate).

- [ ] **Step 1: Create the component**

`components/wagers/SignInGate.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Shown in place of Wagers content for a signed-out visitor — both the
 * full /wagers page gate and the bet slip's signed-out state. Points at
 * /portal, the only sign-in that works today (`/login`/`/signup` don't
 * exist until accounts-foundation ships — update this link once they do).
 * Uses a Button + router.push rather than wrapping Button in a Link:
 * Button renders a <button>, and nesting a <button> inside the <a> a Link
 * renders is invalid HTML (same nested-interactive-content problem Task 15
 * fixes on CompactMatchRow).
 */
export function SignInGate() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-[420px] px-4 py-12 text-center">
      <h2 className="m-0 font-serif text-2xl font-bold text-ink-900">Sign in to see Wagers</h2>
      <p className="mt-2 font-sans text-sm text-ink-500">
        Wagers use your own account so your balance and bet history follow you.
      </p>
      <Button className="mt-5" onClick={() => router.push("/portal")}>
        Sign In
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/SignInGate.tsx
git commit -m "feat: add Wagers SignInGate component"
```

---

### Task 6: `BalancePill` component

**Files:**
- Create: `components/wagers/BalancePill.tsx`

**Interfaces:**
- Consumes: `useAccountSession` (`@/lib/useAccountSession`); `accountKey`, `getBalance`, `onWagersChanged` (`@/lib/wagers/wallet`, Task 4).
- Produces: `BalancePill()` — no props. Consumed by Task 16.

- [ ] **Step 1: Create the component**

`components/wagers/BalancePill.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey, getBalance, onWagersChanged } from "@/lib/wagers/wallet";

/** The signed-in account's fake balance. Renders nothing if there's no session. */
export function BalancePill() {
  const session = useAccountSession();
  const key = accountKey(session);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!key) {
      setBalance(null);
      return;
    }
    setBalance(getBalance(key));
    return onWagersChanged(() => setBalance(getBalance(key)));
  }, [key]);

  if (key == null || balance == null) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-pill border border-gold-400 bg-cream-50 px-4 py-2">
      <span className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-500">Balance</span>
      <span className="font-sans text-lg font-black text-maroon-700 tabular-nums">{balance.toLocaleString()} pts</span>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/BalancePill.tsx
git commit -m "feat: add Wagers BalancePill component"
```

---

### Task 7: `BetSlipSheet` component

**Files:**
- Create: `components/wagers/BetSlipSheet.tsx`

**Interfaces:**
- Consumes: `useAccountSession` (`@/lib/useAccountSession`); `accountKey`, `getBalance`, `placeWager` (`@/lib/wagers/wallet`, Task 4); `formatAmericanOdds`, `potentialPayout` (`@/lib/wagers/americanOdds`, Task 2); `Button` (`@/components/ui/Button`); `Input` (`@/components/ui/Input`); `SignInGate` (`./SignInGate`, Task 5).
- Produces: `BetSlipSheet({ label, odds, open, onClose })` — consumed by Task 8.

- [ ] **Step 1: Create the component**

`components/wagers/BetSlipSheet.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey, getBalance, placeWager } from "@/lib/wagers/wallet";
import { formatAmericanOdds, potentialPayout } from "@/lib/wagers/americanOdds";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SignInGate } from "./SignInGate";

/**
 * Single-selection bet slip. No parlays/combos in this phase — one
 * market, one stake, one confirmation.
 */
export function BetSlipSheet({
  label,
  odds,
  open,
  onClose,
}: {
  label: string;
  odds: number;
  open: boolean;
  onClose: () => void;
}) {
  const session = useAccountSession();
  const key = accountKey(session);
  const [stake, setStake] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  if (!open) return null;

  const stakeNumber = Number(stake);
  const balance = key ? getBalance(key) : 0;

  function confirm() {
    if (!key) return;
    if (!Number.isFinite(stakeNumber) || stakeNumber <= 0) {
      setError("Enter a stake greater than zero.");
      return;
    }
    if (stakeNumber > balance) {
      setError("That's more than your current balance.");
      return;
    }
    const ok = placeWager(key, {
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      placedAt: new Date().toISOString(),
      selectionLabel: label,
      odds,
      stake: stakeNumber,
      potentialPayout: potentialPayout(stakeNumber, odds),
      status: "pending",
    });
    if (!ok) {
      setError("Couldn't place that wager — check your balance.");
      return;
    }
    setError(null);
    setPlaced(true);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-[420px] rounded-t-lg bg-white p-5 shadow-xl lg:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-condensed text-xs font-bold uppercase tracking-eyebrow text-ink-500">Wager Slip</span>
          <button type="button" onClick={onClose} className="font-sans text-sm text-ink-400">
            Close
          </button>
        </div>

        {!key ? (
          <SignInGate />
        ) : placed ? (
          <div className="py-4 text-center">
            <p className="font-sans text-sm font-semibold text-fairway-700">Wager placed — Pending</p>
            <Button className="mt-4" fullWidth onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <p className="font-sans text-base font-semibold text-ink-900">{label}</p>
            <p className="mt-1 font-condensed text-sm font-bold text-ink-500">{formatAmericanOdds(odds)}</p>
            <Input
              label="Stake"
              type="number"
              min={1}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              wrapClassName="mt-4"
            />
            <p className="mt-2 font-sans text-2xs text-ink-400">
              Balance: {balance.toLocaleString()} pts &middot; Potential payout:{" "}
              {Number.isFinite(stakeNumber) && stakeNumber > 0 ? potentialPayout(stakeNumber, odds).toLocaleString() : "—"} pts
            </p>
            {error && <p className="mt-2 font-sans text-2xs text-score-under">{error}</p>}
            <Button className="mt-4" fullWidth onClick={confirm}>
              Confirm Wager
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/BetSlipSheet.tsx
git commit -m "feat: add Wagers BetSlipSheet component"
```

---

### Task 8: `OddsButton` component

**Files:**
- Create: `components/wagers/OddsButton.tsx`

**Interfaces:**
- Consumes: `formatAmericanOdds` (`@/lib/wagers/americanOdds`, Task 2); `BetSlipSheet` (`./BetSlipSheet`, Task 7).
- Produces: `OddsButton({ label, odds }: { label: string; odds: number })` — consumed by Tasks 9, 10, 11.

- [ ] **Step 1: Create the component**

`components/wagers/OddsButton.tsx`:
```tsx
"use client";

import { useState } from "react";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import { BetSlipSheet } from "./BetSlipSheet";

/** A single tappable odds pill — a Match Winner side, a prop's Over/Under, or a futures-ladder row. Opens the shared bet slip for this one selection. */
export function OddsButton({ label, odds }: { label: string; odds: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "min-w-[64px] rounded-sm border px-3 py-2 text-center font-condensed text-sm font-bold tabular-nums transition-colors",
          odds > 0
            ? "border-fairway-300 text-fairway-700 hover:bg-[#E2EDE7]"
            : "border-maroon-200 text-score-under hover:bg-maroon-50",
        ].join(" ")}
      >
        {formatAmericanOdds(odds)}
      </button>
      <BetSlipSheet label={label} odds={odds} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/OddsButton.tsx
git commit -m "feat: add Wagers OddsButton component"
```

---

### Task 9: `MatchWinnerCard` component

**Files:**
- Create: `components/wagers/MatchWinnerCard.tsx`

**Interfaces:**
- Consumes: `getPlayerDisplayName` (`@/lib/data/players`); `matchWinnerOdds` (`@/lib/wagers/mockOdds`, Task 3); `OddsButton` (`./OddsButton`, Task 8); `RealMatch` (`@/lib/data/types`).
- Produces: `MatchWinnerCard({ match }: { match: RealMatch })` — consumed by Task 13.

- [ ] **Step 1: Create the component**

`components/wagers/MatchWinnerCard.tsx`:
```tsx
import { getPlayerDisplayName } from "@/lib/data/players";
import { matchWinnerOdds } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import type { RealMatch } from "@/lib/data/types";

function sideLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

export function MatchWinnerCard({ match }: { match: RealMatch }) {
  const odds = matchWinnerOdds(match);
  const maroonLabel = sideLabel(match.maroonPlayers);
  const whiteLabel = sideLabel(match.whitePlayers);

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Match Winner</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="flex flex-col items-start gap-2">
          <span className="font-sans text-sm font-semibold text-maroon-700">{maroonLabel}</span>
          <OddsButton label={`${maroonLabel} wins the match`} odds={odds.maroon} />
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="font-sans text-sm font-semibold text-ink-900">{whiteLabel}</span>
          <OddsButton label={`${whiteLabel} wins the match`} odds={odds.white} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/MatchWinnerCard.tsx
git commit -m "feat: add Wagers MatchWinnerCard component"
```

---

### Task 10: `PropBetRow` component

**Files:**
- Create: `components/wagers/PropBetRow.tsx`

**Interfaces:**
- Consumes: `getPlayerDisplayName` (`@/lib/data/players`); `OddsButton` (`./OddsButton`, Task 8); `PropMarket` (`@/lib/wagers/types`, Task 1).
- Produces: `PropBetRow({ market }: { market: PropMarket })` — consumed by Tasks 13, 16.

- [ ] **Step 1: Create the component**

`components/wagers/PropBetRow.tsx`:
```tsx
import { getPlayerDisplayName } from "@/lib/data/players";
import { OddsButton } from "./OddsButton";
import type { PropMarket } from "@/lib/wagers/types";

export function PropBetRow({ market }: { market: PropMarket }) {
  const name = getPlayerDisplayName(market.player).split(" ").pop();

  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 py-3 last:border-b-0">
      <div>
        <p className="m-0 font-sans text-sm font-semibold text-ink-900">{name}</p>
        <p className="m-0 font-sans text-2xs text-ink-400">
          {market.statLabel} — line {market.line}
        </p>
      </div>
      <div className="flex gap-2">
        <OddsButton label={`${name} over ${market.line} ${market.statLabel.toLowerCase()}`} odds={market.overOdds} />
        <OddsButton label={`${name} under ${market.line} ${market.statLabel.toLowerCase()}`} odds={market.underOdds} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/PropBetRow.tsx
git commit -m "feat: add Wagers PropBetRow component"
```

---

### Task 11: Futures components (`FuturesLadder` + `TeamFuturesCard`)

**Files:**
- Create: `components/wagers/FuturesLadder.tsx`
- Create: `components/wagers/TeamFuturesCard.tsx`

**Interfaces:**
- Consumes: `getPlayerDisplayName` (`@/lib/data/players`); `tournamentWinnerLadder`, `teamWinnerOdds` (`@/lib/wagers/mockOdds`, Task 3); `OddsButton` (`./OddsButton`, Task 8); `IndividualStanding`, `Tournament` (`@/lib/data/types`).
- Produces: `FuturesLadder({ standings }: { standings: IndividualStanding[] })`, `TeamFuturesCard({ tournament }: { tournament: Tournament })` — consumed by Task 16.

- [ ] **Step 1: Create `FuturesLadder`**

`components/wagers/FuturesLadder.tsx`:
```tsx
import { getPlayerDisplayName } from "@/lib/data/players";
import { tournamentWinnerLadder } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import type { IndividualStanding } from "@/lib/data/types";

export function FuturesLadder({ standings }: { standings: IndividualStanding[] }) {
  const ladder = tournamentWinnerLadder(standings);

  if (ladder.length === 0) {
    return <p className="font-sans text-sm text-ink-400">Tournament Winner odds post once the individual leaderboard has entries.</p>;
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white">
      {ladder.map((entry, i) => {
        const name = getPlayerDisplayName(entry.player);
        return (
          <div
            key={entry.player}
            className={["flex items-center justify-between gap-3 px-4 py-3", i > 0 ? "border-t border-ink-100" : ""].join(" ")}
          >
            <span className="font-sans text-sm font-semibold text-ink-900">{name}</span>
            <OddsButton label={`${name} wins the tournament`} odds={entry.odds} />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `TeamFuturesCard`**

`components/wagers/TeamFuturesCard.tsx`:
```tsx
import { teamWinnerOdds } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import type { Tournament } from "@/lib/data/types";

export function TeamFuturesCard({ tournament }: { tournament: Tournament }) {
  const odds = teamWinnerOdds(tournament);

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Team Winner</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="flex flex-col items-start gap-2">
          <span className="font-sans text-sm font-semibold text-maroon-700">Maroon</span>
          <OddsButton label="Maroon wins the tournament" odds={odds.maroon} />
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="font-sans text-sm font-semibold text-ink-900">White</span>
          <OddsButton label="White wins the tournament" odds={odds.white} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/wagers/FuturesLadder.tsx components/wagers/TeamFuturesCard.tsx
git commit -m "feat: add Wagers futures components"
```

---

### Task 12: `MyWagersList` component

**Files:**
- Create: `components/wagers/MyWagersList.tsx`

**Interfaces:**
- Consumes: `useAccountSession` (`@/lib/useAccountSession`); `accountKey`, `getWagers`, `onWagersChanged` (`@/lib/wagers/wallet`, Task 4); `formatAmericanOdds` (`@/lib/wagers/americanOdds`, Task 2); `Badge` (`@/components/ui/Badge`); `Wager` (`@/lib/wagers/types`, Task 1).
- Produces: `MyWagersList()` — no props. Consumed by Task 16.

- [ ] **Step 1: Create the component**

`components/wagers/MyWagersList.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey, getWagers, onWagersChanged } from "@/lib/wagers/wallet";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import { Badge } from "@/components/ui/Badge";
import type { Wager } from "@/lib/wagers/types";

/** Every wager the signed-in account has placed. Everything shows Pending — there's no settlement engine yet. */
export function MyWagersList() {
  const session = useAccountSession();
  const key = accountKey(session);
  const [wagers, setWagers] = useState<Wager[]>([]);

  useEffect(() => {
    if (!key) {
      setWagers([]);
      return;
    }
    setWagers(getWagers(key));
    return onWagersChanged(() => setWagers(getWagers(key)));
  }, [key]);

  if (!key) return null;

  if (wagers.length === 0) {
    return <p className="font-sans text-sm text-ink-400">No wagers placed yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {wagers.map((wager) => (
        <div key={wager.id} className="flex items-center justify-between gap-3 rounded-md border border-ink-100 bg-white px-4 py-3">
          <div>
            <p className="m-0 font-sans text-sm font-semibold text-ink-900">{wager.selectionLabel}</p>
            <p className="m-0 font-sans text-2xs text-ink-400">
              {formatAmericanOdds(wager.odds)} &middot; Staked {wager.stake.toLocaleString()} pts &middot; Pays{" "}
              {wager.potentialPayout.toLocaleString()} pts
            </p>
          </div>
          <Badge variant="gold">Pending</Badge>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/MyWagersList.tsx
git commit -m "feat: add Wagers MyWagersList component"
```

---

### Task 13: `MatchBreakdownView` component

**Files:**
- Create: `components/wagers/MatchBreakdownView.tsx`

**Interfaces:**
- Consumes: `ResultChevron` (`@/components/match/ResultChevron`); `matchStatus`, `matchLeader`, `matchLabel` (`@/components/leaderboard/matchUtils`); `getPlayerDisplayName` (`@/lib/data/players`); `matchPropMarkets` (`@/lib/wagers/mockOdds`, Task 3); `MatchWinnerCard` (`./MatchWinnerCard`, Task 9); `PropBetRow` (`./PropBetRow`, Task 10); `RealMatch` (`@/lib/data/types`).
- Produces: `MatchBreakdownView({ tournamentSlug, editionLabel, match })` — the shared header + Wagers + Statistics view, consumed by both branches of Task 14's route.

- [ ] **Step 1: Create the component**

`components/wagers/MatchBreakdownView.tsx`:
```tsx
import Link from "next/link";
import { ResultChevron } from "@/components/match/ResultChevron";
import { matchStatus, matchLeader, matchLabel } from "@/components/leaderboard/matchUtils";
import { getPlayerDisplayName } from "@/lib/data/players";
import { matchPropMarkets } from "@/lib/wagers/mockOdds";
import { MatchWinnerCard } from "./MatchWinnerCard";
import { PropBetRow } from "./PropBetRow";
import type { RealMatch } from "@/lib/data/types";

function TeamNames({
  players,
  tournamentSlug,
  align,
}: {
  players: string[];
  tournamentSlug: string;
  align: "left" | "right";
}) {
  return (
    <div className={["flex flex-1 flex-col gap-1", align === "right" ? "items-end text-right" : "items-start text-left"].join(" ")}>
      {players.map((player) => (
        <Link
          key={player}
          href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}`}
          className="font-sans text-base font-semibold text-ink-900 hover:opacity-70"
        >
          {getPlayerDisplayName(player)}
        </Link>
      ))}
    </div>
  );
}

/**
 * Shared between the static-year and live Match Breakdown routes — same
 * split pattern as `PlayerProfileHeader`/`PlayerScorecardView` for the
 * player tournament profile page: one view, fed either static or live data.
 */
export function MatchBreakdownView({
  tournamentSlug,
  editionLabel,
  match,
}: {
  tournamentSlug: string;
  editionLabel: string;
  match: RealMatch;
}) {
  const status = matchStatus(match);
  const leader = matchLeader(match);
  const label = matchLabel(match);
  const propMarkets = matchPropMarkets(match);

  return (
    <div>
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">
        {editionLabel} &middot; Day {match.day} &middot; {match.session} &middot; {match.format}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <TeamNames players={match.maroonPlayers} tournamentSlug={tournamentSlug} align="left" />
        {status === "final" ? (
          <ResultChevron winner={leader} size="md">
            {label}
          </ResultChevron>
        ) : (
          <span className="inline-flex min-h-[34px] min-w-[58px] items-center justify-center rounded-pill border border-ink-300 bg-cream-50 px-2 font-condensed text-sm font-extrabold uppercase tracking-wide text-ink-900">
            {status === "scheduled" ? match.teeTimeCst ?? "VS" : label}
          </span>
        )}
        <TeamNames players={match.whitePlayers} tournamentSlug={tournamentSlug} align="right" />
      </div>

      <section className="mt-8">
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Wagers</h2>
        <div className="mt-3 flex flex-col gap-4">
          <MatchWinnerCard match={match} />
          <div className="rounded-md border border-ink-100 bg-white p-4">
            <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Player Props</p>
            <div className="mt-1">
              {propMarkets.map((market) => (
                <PropBetRow key={market.id} market={market} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Statistics</h2>
        <div className="mt-3 rounded-md border border-ink-100 bg-cream-50 p-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Format</dt>
              <dd className="m-0 font-sans text-sm font-semibold text-ink-900">{match.format}</dd>
            </div>
            <div>
              <dt className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Session</dt>
              <dd className="m-0 font-sans text-sm font-semibold text-ink-900">{match.session}</dd>
            </div>
            <div>
              <dt className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Status</dt>
              <dd className="m-0 font-sans text-sm font-semibold capitalize text-ink-900">{status}</dd>
            </div>
            <div>
              <dt className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Thru</dt>
              <dd className="m-0 font-sans text-sm font-semibold text-ink-900">{match.thru ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/MatchBreakdownView.tsx
git commit -m "feat: add MatchBreakdownView component"
```

---

### Task 14: Match Breakdown route

**Files:**
- Create: `app/leaderboard/[slug]/matches/[matchId]/page.tsx`
- Create: `components/wagers/LiveMatchBreakdown.tsx`

**Interfaces:**
- Consumes: `MatchBreakdownView` (`@/components/wagers/MatchBreakdownView`, Task 13); `useLiveTournament`, `DETAIL_POLL_MS` (`@/lib/hooks/useLiveTournament`); `pastTournaments`, `nextTournament`, `getTournament` (`@/lib/data`).
- Produces: the live route `/leaderboard/[slug]/matches/[matchId]`, consumed by Task 15 (`CompactMatchRow`'s new link target) and Task 16 (linked from the Wagers hub via `CompactMatchRow`).

- [ ] **Step 1: Create `LiveMatchBreakdown`**

`components/wagers/LiveMatchBreakdown.tsx`:
```tsx
"use client";

import { MatchBreakdownView } from "./MatchBreakdownView";
import { DETAIL_POLL_MS, useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament } from "@/lib/data";

export function LiveMatchBreakdown({ tournamentSlug, matchId }: { tournamentSlug: string; matchId: string }) {
  const { tournament, loading, payload } = useLiveTournament(DETAIL_POLL_MS);

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>;
  }

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) {
    return (
      <p className="font-sans text-sm text-ink-400 py-10 text-center">
        This match hasn&rsquo;t posted yet — check back once it&rsquo;s live.
      </p>
    );
  }

  return <MatchBreakdownView tournamentSlug={tournamentSlug} editionLabel={nextTournament.editionLabel} match={match} />;
}
```

- [ ] **Step 2: Create the route**

`app/leaderboard/[slug]/matches/[matchId]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { MatchBreakdownView } from "@/components/wagers/MatchBreakdownView";
import { LiveMatchBreakdown } from "@/components/wagers/LiveMatchBreakdown";
import { pastTournaments, nextTournament, getTournament } from "@/lib/data";

export function generateStaticParams() {
  return pastTournaments.flatMap((t) => t.matches.map((m) => ({ slug: t.slug, matchId: m.id })));
}

export default async function MatchBreakdownPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  const { slug, matchId } = await params;

  if (slug === nextTournament.slug) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pb-16 pt-8 sm:px-7">
        <LiveMatchBreakdown tournamentSlug={slug} matchId={matchId} />
      </div>
    );
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) notFound();

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-16 pt-8 sm:px-7">
      <MatchBreakdownView tournamentSlug={slug} editionLabel={tournament.editionLabel} match={match} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/leaderboard components/wagers/LiveMatchBreakdown.tsx
git commit -m "feat: add Match Breakdown route (live + static)"
```

---

### Task 15: Make `CompactMatchRow` tappable

**Files:**
- Modify: `components/leaderboard/CompactMatchRow.tsx`

**Interfaces:**
- Consumes: `useRouter` (`next/navigation`); no change to existing consumers/props — `CompactMatchRow({ match, tournamentSlug })` keeps the same signature.
- Produces: tapping anywhere on the row navigates to `/leaderboard/${tournamentSlug}/matches/${match.id}` (Task 14's route); player-name links inside the row still navigate to their own player profile instead of triggering the row's navigation.

- [ ] **Step 1: Add `"use client"` and the router import**

In `components/leaderboard/CompactMatchRow.tsx`, add `"use client";` as the first line and add the router import, so the top of the file reads:

```tsx
"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ResultChevron } from "@/components/match/ResultChevron";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { RealMatch, Team } from "@/lib/data/types";
```

- [ ] **Step 2: Stop player-name clicks from bubbling into the row's click handler**

In `TeamSide`, add `onClick={(e) => e.stopPropagation()}` to the existing `<Link>`:

```tsx
        <Link
          key={player}
          href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}`}
          onClick={(e) => e.stopPropagation()}
          className={[
```

(the rest of that `<Link>` — `className`, closing tag, content — is unchanged.)

- [ ] **Step 3: Make the row itself clickable**

Replace the `CompactMatchRow` function body's opening (`const status = ...` through the returned `<div className="grid ...">`) with:

```tsx
export function CompactMatchRow({
  match,
  tournamentSlug,
}: {
  match: RealMatch;
  tournamentSlug: string;
}) {
  const router = useRouter();
  const status = matchStatus(match);
  const centerLabel = status === "scheduled" ? "VS" : liveLabel(match);
  const breakdownHref = `/leaderboard/${tournamentSlug}/matches/${match.id}`;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(breakdownHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push(breakdownHref);
      }}
      className="grid cursor-pointer grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-2 border-b border-ink-100 px-2 py-1 last:border-b-0 hover:bg-cream-50"
    >
```

(everything after that opening `<div>` tag — the two `<TeamSide>` calls and the center label span — is unchanged; only the outer `<div>`'s attributes changed.)

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/leaderboard/CompactMatchRow.tsx
git commit -m "feat: make match rows tap through to the Match Breakdown page"
```

---

### Task 16: Wagers hub route

**Files:**
- Create: `components/wagers/WagersHubContent.tsx`
- Create: `app/wagers/page.tsx`

**Interfaces:**
- Consumes: `useAccountSession` (`@/lib/useAccountSession`); `accountKey` (`@/lib/wagers/wallet`, Task 4); `useLiveTournament` (`@/lib/hooks/useLiveTournament`); `getNextTournamentStatus` (`@/lib/data`); `SignInGate` (Task 5); `BalancePill` (Task 6); `CompactMatchRow` (`@/components/leaderboard/CompactMatchRow`, Task 15); `PropBetRow` (Task 10); `TeamFuturesCard`, `FuturesLadder` (Task 11); `MyWagersList` (Task 12); `matchPropMarkets` (`@/lib/wagers/mockOdds`, Task 3).
- Produces: the `/wagers` page, consumed by Task 17 (`MorePanel` link).

- [ ] **Step 1: Create `WagersHubContent`**

`components/wagers/WagersHubContent.tsx`:
```tsx
"use client";

import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey } from "@/lib/wagers/wallet";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus } from "@/lib/data";
import { matchPropMarkets } from "@/lib/wagers/mockOdds";
import { SignInGate } from "./SignInGate";
import { BalancePill } from "./BalancePill";
import { CompactMatchRow } from "@/components/leaderboard/CompactMatchRow";
import { PropBetRow } from "./PropBetRow";
import { TeamFuturesCard } from "./TeamFuturesCard";
import { FuturesLadder } from "./FuturesLadder";
import { MyWagersList } from "./MyWagersList";

export function WagersHubContent() {
  const session = useAccountSession();
  const { tournament, loading, payload } = useLiveTournament();
  const isLive = getNextTournamentStatus() === "live";

  if (accountKey(session) == null) {
    return <SignInGate />;
  }

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>;
  }

  const allPropMarkets = tournament.matches.flatMap((match) => matchPropMarkets(match));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Wagers</h1>
        <BalancePill />
      </div>

      {!isLive && (
        <p className="font-sans text-sm text-ink-500">
          There&rsquo;s no live tournament right now — futures are still open, and matches will appear here once play starts.
        </p>
      )}

      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Today&rsquo;s Matches</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-ink-100 bg-white">
          {tournament.matches.length === 0 ? (
            <p className="p-4 font-sans text-sm text-ink-400">No matches posted yet.</p>
          ) : (
            tournament.matches.map((match) => <CompactMatchRow key={match.id} match={match} tournamentSlug={tournament.slug} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Player Props</h2>
        <div className="mt-3 rounded-md border border-ink-100 bg-white p-4">
          {allPropMarkets.length === 0 ? (
            <p className="font-sans text-sm text-ink-400">No player props posted yet.</p>
          ) : (
            allPropMarkets.map((market) => <PropBetRow key={market.id} market={market} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Futures</h2>
        <div className="mt-3 flex flex-col gap-4">
          <TeamFuturesCard tournament={tournament} />
          <FuturesLadder standings={tournament.individualLeaderboard} />
        </div>
      </section>

      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">My Wagers</h2>
        <div className="mt-3">
          <MyWagersList />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create the route**

`app/wagers/page.tsx`:
```tsx
import { WagersHubContent } from "@/components/wagers/WagersHubContent";

export default function WagersPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-16 pt-8 sm:px-7">
      <WagersHubContent />
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/wagers/WagersHubContent.tsx app/wagers/page.tsx
git commit -m "feat: add Wagers hub route"
```

---

### Task 17: Add "Wagers" to the More menu

**Files:**
- Modify: `components/nav/MorePanel.tsx:7-10`

**Interfaces:**
- Consumes: nothing new.
- Produces: `/wagers` appears in both the mobile full-screen More panel and the desktop drawer (same `MORE_LINKS` array powers both, per `MorePanel`'s existing doc comment).

- [ ] **Step 1: Add the link**

In `components/nav/MorePanel.tsx`, change:

```tsx
export const MORE_LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/history", label: "History" },
];
```

to:

```tsx
export const MORE_LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/history", label: "History" },
  { href: "/wagers", label: "Wagers" },
];
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/nav/MorePanel.tsx
git commit -m "feat: add Wagers to the More menu"
```

---

### Task 18: Manual browser walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts on `http://localhost:3001` with no build errors.

- [ ] **Step 2: Signed-out state**

Visit `http://localhost:3001/wagers` without a Scorekeeper session active.
Expected: only the "Sign in to see Wagers" gate renders, with a working "Sign In" button pointing at `/portal`. No odds, balance, or match data is visible.

- [ ] **Step 3: Match row tap-through**

Visit `http://localhost:3001/leaderboard/2026-palm-springs` (or whichever `pastTournaments` slug has matches), open the Team Match Play view, and tap anywhere on a match row.
Expected: navigates to `/leaderboard/2026-palm-springs/matches/<matchId>`, showing the Maroon-vs-White header, Wagers section (Match Winner + Player Props), and Statistics section. Tapping a player's name inside the row (before navigating away) still goes to that player's own profile instead of the match breakdown.

- [ ] **Step 4: Signed-in state**

Log in via `/portal` with a test player or host session, then revisit `/wagers`.
Expected: the balance pill shows `1,000 pts` on first visit, Today's Matches/Player Props/Futures render with mock odds, and My Wagers shows "No wagers placed yet."

- [ ] **Step 5: Place a wager**

Tap any odds button (on `/wagers` or a Match Breakdown page), enter a stake, and confirm.
Expected: the bet slip shows "Wager placed — Pending," the balance pill decreases by the stake amount, and the new wager appears at the top of My Wagers with a "Pending" badge. Reload the page — the balance and wager both persist (localStorage).

- [ ] **Step 6: Insufficient balance**

Open the bet slip again and enter a stake larger than the current balance.
Expected: an inline error ("That's more than your current balance.") and no balance change.

- [ ] **Step 7: Desktop and mobile nav**

At both a mobile viewport width and a desktop width, open the More menu.
Expected: "Wagers" appears in the link list in both the mobile full-screen panel and the desktop right-edge drawer, and navigates to `/wagers`.

- [ ] **Step 8: Report results**

Summarize what was checked and any deviations found — do not report the plan as complete if any expected result above didn't hold.
