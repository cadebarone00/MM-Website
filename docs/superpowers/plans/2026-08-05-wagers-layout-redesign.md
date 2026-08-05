# Wagers Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Wagers section's chrome and page structure (nav bar, back-button stack, 5 category pages, My Portfolio page, entry splash, MM Coins/Real Wagers toggle) to look and navigate like the Kalshi app screenshots, with zero changes to odds math, wallet behavior, or wager placement logic.

**Architecture:** A new `app/wagers/layout.tsx` owns the sign-in gate, the one-time entry splash, a `WagersModeProvider` context, and a pathname-driven `WagersNavBar` shared by every `/wagers/*` route. Five new category pages and a new portfolio page replace today's single-page `WagersHubContent`; existing market components (`TeamFuturesCard`, `FuturesLadder`) get restyled in place since they're Wagers-only, while `MatchWinnerCard`/`PropBetRow` (shared with the unrelated Match Breakdown page) are left untouched and given new Wagers-only siblings instead.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, lucide-react icons. Tests: `node:test` via `npm test` (`tsx --test lib/**/*.test.ts`) for pure logic; component/page work is verified with `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual click-through via `npm run dev` (this repo has no component-level test harness — that's the established pattern for `components/`/`app/` work here).

## Global Constraints

- Visual/routing only. Do not change `lib/wagers/wallet.ts`, `lib/wagers/americanOdds.ts`, `lib/wagers/mockOdds.ts`, `lib/wagers/types.ts`, or `BetSlipSheet.tsx`'s/`OddsButton.tsx`'s behavior.
- The mode toggle's two labels are exactly **"MM Coins"** and **"Real Wagers"** — matching `docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md`, not "MM Wagers" or "MM Cash".
- Back links always name the parent screen in one word and are real navigation (a `<Link>`), so the OS swipe-back gesture works — except the hub's `< More`, which opens the existing `MorePanel` drawer instead of navigating anywhere.
- Fourballs ships as an empty-state placeholder only — no real fourball data exists yet.
- The entry splash shows once per arrival at `/wagers/*` from outside the section (not on navigation between hub/category/portfolio), fixed ~1.2s, not tied to any data fetch. Ships with a placeholder background; the real image asset is a follow-up once the user provides it.
- Never modify `components/wagers/MatchWinnerCard.tsx` or `components/wagers/PropBetRow.tsx` — both are shared with `components/wagers/MatchBreakdownView.tsx` (`/leaderboard/[slug]/matches/[matchId]`), which is out of scope for this round.
- `npx tsc --noEmit`, `npm run lint`, and `npm run build` must stay clean after every task.

---

### Task 1: Nav bar content — pure pathname → nav bar mapping

**Files:**
- Create: `lib/wagers/navBarContent.ts`
- Test: `lib/wagers/navBarContent.test.ts`

**Interfaces:**
- Produces: `wagersNavBarContent(pathname: string): WagersNavBarContent` and `interface WagersNavBarContent { backLabel: string; backHref: string | null; title: string; showPortfolioLink: boolean }`, both exported from `lib/wagers/navBarContent.ts`. `backHref: null` means "open the More menu" rather than navigate.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/wagers/navBarContent.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { wagersNavBarContent } from "./navBarContent";

test("hub route opens the More menu and shows the portfolio link", () => {
  assert.deepEqual(wagersNavBarContent("/wagers"), {
    backLabel: "More",
    backHref: null,
    title: "Wagers",
    showPortfolioLink: true,
  });
});

test("portfolio route backs to the hub and hides its own link", () => {
  assert.deepEqual(wagersNavBarContent("/wagers/portfolio"), {
    backLabel: "Wagers",
    backHref: "/wagers",
    title: "My Portfolio",
    showPortfolioLink: false,
  });
});

test("a known category route backs to the hub with its display title", () => {
  assert.deepEqual(wagersNavBarContent("/wagers/matches"), {
    backLabel: "Wagers",
    backHref: "/wagers",
    title: "Matches",
    showPortfolioLink: true,
  });
});

test("every category slug maps to a display title", () => {
  assert.equal(wagersNavBarContent("/wagers/team-futures").title, "Team Futures");
  assert.equal(wagersNavBarContent("/wagers/player-futures").title, "Player Futures");
  assert.equal(wagersNavBarContent("/wagers/fourballs").title, "Fourballs");
  assert.equal(wagersNavBarContent("/wagers/props").title, "Props");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './navBarContent'` (or similar; the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// lib/wagers/navBarContent.ts

/**
 * The Wagers nav bar's back label/link, screen title, and whether to show
 * the My Portfolio link — derived purely from the current /wagers/*
 * pathname so app/wagers/layout.tsx can render one nav bar for every route
 * in the section without each page configuring it individually.
 */
export interface WagersNavBarContent {
  backLabel: string;
  /** null means "open the More menu" instead of navigating anywhere. */
  backHref: string | null;
  title: string;
  showPortfolioLink: boolean;
}

const CATEGORY_TITLES: Record<string, string> = {
  "team-futures": "Team Futures",
  "player-futures": "Player Futures",
  matches: "Matches",
  fourballs: "Fourballs",
  props: "Props",
};

export function wagersNavBarContent(pathname: string): WagersNavBarContent {
  if (pathname === "/wagers") {
    return { backLabel: "More", backHref: null, title: "Wagers", showPortfolioLink: true };
  }
  if (pathname === "/wagers/portfolio") {
    return { backLabel: "Wagers", backHref: "/wagers", title: "My Portfolio", showPortfolioLink: false };
  }
  const segment = pathname.replace(/^\/wagers\//, "");
  return {
    backLabel: "Wagers",
    backHref: "/wagers",
    title: CATEGORY_TITLES[segment] ?? "Wagers",
    showPortfolioLink: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/wagers/navBarContent.ts lib/wagers/navBarContent.test.ts
git commit -m "feat(wagers): add pathname-driven nav bar content mapping"
```

---

### Task 2: Coins/Real Wagers mode state — context, provider, toggle

**Files:**
- Create: `components/wagers/WagersModeContext.tsx`
- Create: `components/wagers/MMToggle.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `WagersModeProvider({ children }): JSX.Element`, `useWagersMode(): { mode: "coins" | "real"; setMode: (mode: "coins" | "real") => void }`, and `type WagersMode = "coins" | "real"` — all exported from `components/wagers/WagersModeContext.tsx`. `MMToggle(): JSX.Element` exported from `components/wagers/MMToggle.tsx`, consumes `useWagersMode`.

- [ ] **Step 1: Write the context/provider/hook**

```tsx
// components/wagers/WagersModeContext.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type WagersMode = "coins" | "real";

const WagersModeContext = createContext<{ mode: WagersMode; setMode: (mode: WagersMode) => void } | null>(null);

/**
 * Holds which of MM Coins / Real Wagers is selected for the whole Wagers
 * section. Lives in app/wagers/layout.tsx so the nav bar's toggle and every
 * category page underneath it share one value without prop-drilling
 * through Next.js's opaque `children` route slot. Not persisted anywhere —
 * resets to "coins" on every fresh entry into the section.
 */
export function WagersModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WagersMode>("coins");
  return <WagersModeContext.Provider value={{ mode, setMode }}>{children}</WagersModeContext.Provider>;
}

export function useWagersMode(): { mode: WagersMode; setMode: (mode: WagersMode) => void } {
  const ctx = useContext(WagersModeContext);
  if (!ctx) throw new Error("useWagersMode must be used within WagersModeProvider");
  return ctx;
}
```

- [ ] **Step 2: Write the toggle UI**

```tsx
// components/wagers/MMToggle.tsx
"use client";

import { useWagersMode } from "./WagersModeContext";

/**
 * Segmented MM Coins / Real Wagers switch shown in the Wagers nav bar.
 * Real Wagers has no working markets yet — that system is being built
 * separately (see
 * docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md) —
 * so selecting it only flips shared UI state; CategoryPageShell reads that
 * state to show a "Coming soon" placeholder instead of a category's normal
 * boxes.
 */
export function MMToggle() {
  const { mode, setMode } = useWagersMode();

  return (
    <div className="inline-flex rounded-pill border border-gold-400 bg-cream-50 p-[3px]">
      <button
        type="button"
        onClick={() => setMode("coins")}
        aria-pressed={mode === "coins"}
        className={[
          "rounded-pill px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide transition-colors",
          mode === "coins" ? "bg-maroon-700 text-cream-50" : "text-ink-500",
        ].join(" ")}
      >
        MM Coins
      </button>
      <button
        type="button"
        onClick={() => setMode("real")}
        aria-pressed={mode === "real"}
        className={[
          "rounded-pill px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide transition-colors",
          mode === "real" ? "bg-maroon-700 text-cream-50" : "text-ink-500",
        ].join(" ")}
      >
        Real Wagers
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean. (No manual UI check yet — nothing renders `MMToggle` until Task 4.)

- [ ] **Step 4: Commit**

```bash
git add components/wagers/WagersModeContext.tsx components/wagers/MMToggle.tsx
git commit -m "feat(wagers): add MM Coins/Real Wagers mode state and toggle"
```

---

### Task 3: Let the Wagers nav bar open the existing More drawer

**Files:**
- Modify: `components/nav/MorePanel.tsx`
- Modify: `components/Header.tsx`

**Interfaces:**
- Produces: `openMoreMenu(): void` and `onOpenMoreMenuRequested(handler: () => void): () => void`, both exported from `components/nav/MorePanel.tsx`. Task 4's `WagersNavBar` calls `openMoreMenu()`.

**Why:** `MorePanel`'s open/close state lives in `Header.tsx`, which sits outside `app/wagers/`. Rather than lifting that state globally, this adds a tiny event bridge — the same pattern `lib/wagers/wallet.ts` already uses for its `mm:wagers-changed` event — so the Wagers nav bar's `< More` button can ask Header to open the drawer without any prop-drilling.

- [ ] **Step 1: Add the event helpers to MorePanel.tsx**

Add near the top of `components/nav/MorePanel.tsx`, after the imports and before `export const MORE_LINKS`:

```tsx
const OPEN_EVENT = "mm:open-more-menu";

/**
 * Requests that the More drawer open, from anywhere in the tree that
 * doesn't own its open/close state — e.g. the Wagers nav bar's "< More"
 * back button. Header.tsx owns the actual `moreOpen` state and listens
 * for this event.
 */
export function openMoreMenu(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Subscribes to openMoreMenu() calls; returns an unsubscribe function. */
export function onOpenMoreMenuRequested(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
```

- [ ] **Step 2: Subscribe in Header.tsx**

In `components/Header.tsx`, change the react import (currently line 5) from:

```tsx
import { useState } from "react";
```

to:

```tsx
import { useEffect, useState } from "react";
```

Change the MorePanel import (currently line 13) from:

```tsx
import { MorePanel, MORE_LINKS } from "@/components/nav/MorePanel";
```

to:

```tsx
import { MorePanel, MORE_LINKS, onOpenMoreMenuRequested } from "@/components/nav/MorePanel";
```

Add this effect right after the existing `useState` declarations (after the `const [lastPathname, setLastPathname] = useState(pathname);` line, before the `const moreOn = ...` line):

```tsx
  useEffect(() => onOpenMoreMenuRequested(() => setMoreOpen(true)), []);
```

- [ ] **Step 3: Verify it builds and the existing More button still works**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

Run: `npm run dev`, open the site, tap the bottom tab bar's **More** button (or the desktop header's **More** link) — the drawer should still open exactly as before. This confirms the refactor didn't break the existing trigger.

- [ ] **Step 4: Commit**

```bash
git add components/nav/MorePanel.tsx components/Header.tsx
git commit -m "feat(nav): let code outside Header open the More drawer via an event"
```

---

### Task 4: Wagers nav bar and entry splash

**Files:**
- Create: `components/wagers/WagersNavBar.tsx`
- Create: `components/wagers/WagersEntrySplash.tsx`

**Interfaces:**
- Consumes: `wagersNavBarContent` (Task 1), `openMoreMenu` (Task 3), `MMToggle` (Task 2).
- Produces: `WagersNavBar(): JSX.Element` and `WagersEntrySplash({ children }: { children: ReactNode }): JSX.Element`, both exported for Task 5's layout to render.

- [ ] **Step 1: Write the nav bar**

```tsx
// components/wagers/WagersNavBar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { wagersNavBarContent } from "@/lib/wagers/navBarContent";
import { openMoreMenu } from "@/components/nav/MorePanel";
import { MMToggle } from "./MMToggle";

/**
 * The nav bar shown on every /wagers/* screen — back link/button, screen
 * title, an optional My Portfolio link, and the persistent MM Coins /
 * Real Wagers toggle. Content is derived from the current pathname, so
 * app/wagers/layout.tsx can render one instance for the whole section.
 */
export function WagersNavBar() {
  const pathname = usePathname();
  const { backLabel, backHref, title, showPortfolioLink } = wagersNavBarContent(pathname);

  return (
    <div className="flex flex-col gap-3 border-b border-ink-100 bg-white px-4 py-3 sm:px-7">
      <div className="grid grid-cols-3 items-center">
        <div className="justify-self-start">
          {backHref ? (
            <Link href={backHref} className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-maroon-700">
              <ChevronLeft size={18} />
              {backLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={openMoreMenu}
              className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-maroon-700"
            >
              <ChevronLeft size={18} />
              {backLabel}
            </button>
          )}
        </div>
        <h1 className="m-0 justify-self-center font-serif text-lg font-bold text-ink-900">{title}</h1>
        <div className="justify-self-end">
          {showPortfolioLink && (
            <Link href="/wagers/portfolio" className="font-sans text-sm font-semibold text-maroon-700">
              My Portfolio
            </Link>
          )}
        </div>
      </div>
      <div className="flex justify-center">
        <MMToggle />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the entry splash**

```tsx
// components/wagers/WagersEntrySplash.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";

const SPLASH_MS = 1200;

/**
 * Shown once per mount — i.e. once per entry into the Wagers section from
 * outside it, since app/wagers/layout.tsx (the only place this is used)
 * persists across navigation between /wagers/* routes and only remounts
 * when arriving at the section fresh. A timed visual gate only, not tied
 * to any data fetch.
 *
 * The background is a placeholder solid color until a real image asset is
 * provided — swap in a full-bleed <Image> behind the pulsating text once
 * one exists.
 */
export function WagersEntrySplash({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-maroon-900">
        <span className="animate-pulse font-serif text-4xl font-bold uppercase tracking-eyebrow text-white">Wagers</span>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Verify it type-checks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean. (Manual check follows in Task 5, once these are actually mounted.)

- [ ] **Step 4: Commit**

```bash
git add components/wagers/WagersNavBar.tsx components/wagers/WagersEntrySplash.tsx
git commit -m "feat(wagers): add Wagers nav bar and entry splash components"
```

---

### Task 5: Wagers section layout — gate, splash, nav bar wiring

**Files:**
- Create: `app/wagers/layout.tsx`

**Interfaces:**
- Consumes: `SignInGate` (existing), `WagersModeProvider` (Task 2), `WagersEntrySplash`, `WagersNavBar` (Task 4).
- Produces: the default layout export Next.js requires for every route under `app/wagers/`.

**Note:** `app/wagers/page.tsx` still renders the old `WagersHubContent` at the end of this task (it isn't rewritten until Task 9), so you'll see its sign-in gate and container nested inside this new layout's gate/container. That's expected and harmless — Task 9 removes the duplication.

- [ ] **Step 1: Write the layout**

```tsx
// app/wagers/layout.tsx
"use client";

import type { ReactNode } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey } from "@/lib/wagers/wallet";
import { SignInGate } from "@/components/wagers/SignInGate";
import { WagersModeProvider } from "@/components/wagers/WagersModeContext";
import { WagersEntrySplash } from "@/components/wagers/WagersEntrySplash";
import { WagersNavBar } from "@/components/wagers/WagersNavBar";

export default function WagersLayout({ children }: { children: ReactNode }) {
  const session = useAccountSession();

  if (accountKey(session) == null) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pb-16 pt-8 sm:px-7">
        <SignInGate />
      </div>
    );
  }

  return (
    <WagersModeProvider>
      <WagersEntrySplash>
        <WagersNavBar />
        <div className="mx-auto max-w-[900px] pb-16">{children}</div>
      </WagersEntrySplash>
    </WagersModeProvider>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Manually verify the splash and nav bar**

Run: `npm run dev`, sign in, navigate to `/wagers` from the More menu. Confirm:
- The pulsating "WAGERS" splash shows briefly, then reveals the page.
- The nav bar reads `< More — Wagers — My Portfolio` with the MM Coins/Real Wagers toggle beneath it.
- Tapping `< More` opens the More drawer.
- Tapping `My Portfolio` 404s for now — that's expected, its page doesn't exist until Task 12.
- Navigate away and back to `/wagers` — the splash plays again (fresh entry).

- [ ] **Step 4: Commit**

```bash
git add app/wagers/layout.tsx
git commit -m "feat(wagers): add section layout with sign-in gate, splash, and nav bar"
```

---

### Task 6: Shared box shell and category page shell

**Files:**
- Create: `components/wagers/WagerBox.tsx`
- Create: `components/wagers/CategoryPageShell.tsx`

**Interfaces:**
- Consumes: `useWagersMode` (Task 2).
- Produces: `WagerBox({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }): JSX.Element` and `CategoryPageShell({ rulesText, searchPlaceholder, children }: { rulesText: string; searchPlaceholder: string; children: (search: string) => ReactNode }): JSX.Element`, both exported for Tasks 7–10's category pages.

- [ ] **Step 1: Write WagerBox**

```tsx
// components/wagers/WagerBox.tsx
import type { ReactNode } from "react";

/**
 * Shared "market card" shell used across every Wagers category page — icon
 * badge + eyebrow title + whatever outcome rows the caller renders inside.
 * Gives every category the same Kalshi-style card look instead of each
 * market component defining its own border/padding.
 */
export function WagerBox({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-100 border-l-4 border-l-gold-400 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-maroon-50 text-maroon-700">
          {icon}
        </span>
        <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">{title}</p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Write CategoryPageShell**

```tsx
// components/wagers/CategoryPageShell.tsx
"use client";

import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { useWagersMode } from "./WagersModeContext";

/**
 * The layout every Wagers category page shares: a rules blurb, a search
 * box that filters the boxes below by name, and whatever the caller
 * renders for the current search text. When Real Wagers is selected, shows
 * a "Coming soon" placeholder instead — that system isn't built yet, see
 * docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md.
 * Each category page owns its own data/filtering; this only owns the
 * search input's state and the mode gate.
 */
export function CategoryPageShell({
  rulesText,
  searchPlaceholder,
  children,
}: {
  rulesText: string;
  searchPlaceholder: string;
  children: (search: string) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const { mode } = useWagersMode();

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 sm:px-7">
      <p className="m-0 font-sans text-sm text-ink-500">{rulesText}</p>
      {mode === "real" ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-cream-50 p-6 text-center">
          <p className="m-0 font-sans text-sm font-semibold text-ink-500">Real Wagers is coming soon.</p>
          <p className="mt-1 font-sans text-2xs text-ink-400">Switch back to MM Coins to see today&rsquo;s markets.</p>
        </div>
      ) : (
        <>
          <Input
            iconLeft={<Search size={16} />}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-col gap-4">{children(search)}</div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add components/wagers/WagerBox.tsx components/wagers/CategoryPageShell.tsx
git commit -m "feat(wagers): add shared WagerBox card and CategoryPageShell"
```

---

### Task 7: Restyle Team Futures and Player Futures cards as boxes

**Files:**
- Modify: `components/wagers/TeamFuturesCard.tsx`
- Modify: `components/wagers/FuturesLadder.tsx`

**Interfaces:**
- Consumes: `WagerBox` (Task 6).
- Produces: `FuturesLadder({ standings, search }: { standings: IndividualStanding[]; search?: string })` — adds the optional `search` prop Task 8's Player Futures page needs; `TeamFuturesCard`'s props are unchanged.

**Why these two and not `MatchWinnerCard`/`PropBetRow`:** both are only ever rendered from the old `WagersHubContent` (being removed in Task 11), so restyling them in place is safe. `MatchWinnerCard` and `PropBetRow` are also rendered by `MatchBreakdownView.tsx` (`/leaderboard/[slug]/matches/[matchId]`), which is out of scope — see Task 9 for their Wagers-only replacement.

- [ ] **Step 1: Restyle TeamFuturesCard**

```tsx
// components/wagers/TeamFuturesCard.tsx
import { Trophy } from "lucide-react";
import { teamWinnerOdds } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import { WagerBox } from "./WagerBox";
import type { Tournament } from "@/lib/data/types";

export function TeamFuturesCard({ tournament }: { tournament: Tournament }) {
  const odds = teamWinnerOdds(tournament);

  return (
    <WagerBox icon={<Trophy size={16} />} title="Team Winner">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-start gap-2">
          <span className="font-sans text-sm font-semibold text-maroon-700">Maroon</span>
          <OddsButton label="Maroon wins the tournament" odds={odds.maroon} />
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="font-sans text-sm font-semibold text-ink-900">White</span>
          <OddsButton label="White wins the tournament" odds={odds.white} />
        </div>
      </div>
    </WagerBox>
  );
}
```

- [ ] **Step 2: Restyle FuturesLadder and add search filtering**

```tsx
// components/wagers/FuturesLadder.tsx
import { User } from "lucide-react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { tournamentWinnerLadder } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import { WagerBox } from "./WagerBox";
import type { IndividualStanding } from "@/lib/data/types";

export function FuturesLadder({ standings, search = "" }: { standings: IndividualStanding[]; search?: string }) {
  if (standings.length === 0) {
    return <p className="font-sans text-sm text-ink-400">Tournament Winner odds post once the individual leaderboard has entries.</p>;
  }

  const term = search.trim().toLowerCase();
  const ladder = tournamentWinnerLadder(standings).filter((entry) =>
    getPlayerDisplayName(entry.player).toLowerCase().includes(term)
  );

  if (ladder.length === 0) {
    return <p className="font-sans text-sm text-ink-400">No players match &ldquo;{search}&rdquo;.</p>;
  }

  return (
    <WagerBox icon={<User size={16} />} title="Tournament Winner">
      <div className="flex flex-col divide-y divide-ink-100">
        {ladder.map((entry) => {
          const name = getPlayerDisplayName(entry.player);
          return (
            <div key={entry.player} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="font-sans text-sm font-semibold text-ink-900">{name}</span>
              <OddsButton label={`${name} wins the tournament`} odds={entry.odds} />
            </div>
          );
        })}
      </div>
    </WagerBox>
  );
}
```

- [ ] **Step 3: Verify it type-checks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add components/wagers/TeamFuturesCard.tsx components/wagers/FuturesLadder.tsx
git commit -m "feat(wagers): restyle Team/Player Futures cards as WagerBoxes"
```

---

### Task 8: Wagers-only Matches box (leaves MatchWinnerCard untouched)

**Files:**
- Create: `components/wagers/MatchWagerBox.tsx`

**Interfaces:**
- Consumes: `WagerBox` (Task 6), `matchWinnerOdds` (existing, `lib/wagers/mockOdds.ts`).
- Produces: `MatchWagerBox({ match }: { match: RealMatch }): JSX.Element`, used by Task 9's Matches page.

- [ ] **Step 1: Write the component**

```tsx
// components/wagers/MatchWagerBox.tsx
import { Flag } from "lucide-react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { matchWinnerOdds } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import { WagerBox } from "./WagerBox";
import type { RealMatch } from "@/lib/data/types";

function sideLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

/**
 * The Matches category page's per-match box — same odds as
 * MatchWinnerCard (used on the unrelated Match Breakdown page) but in the
 * Wagers section's WagerBox shell. Kept as its own component rather than
 * reusing MatchWinnerCard so restyling Wagers never touches Match
 * Breakdown's look.
 */
export function MatchWagerBox({ match }: { match: RealMatch }) {
  const odds = matchWinnerOdds(match);
  const maroonLabel = sideLabel(match.maroonPlayers);
  const whiteLabel = sideLabel(match.whitePlayers);

  return (
    <WagerBox icon={<Flag size={16} />} title={`${maroonLabel} vs ${whiteLabel}`}>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-start gap-2">
          <span className="font-sans text-sm font-semibold text-maroon-700">{maroonLabel}</span>
          <OddsButton label={`${maroonLabel} wins the match`} odds={odds.maroon} />
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="font-sans text-sm font-semibold text-ink-900">{whiteLabel}</span>
          <OddsButton label={`${whiteLabel} wins the match`} odds={odds.white} />
        </div>
      </div>
    </WagerBox>
  );
}
```

- [ ] **Step 2: Verify it type-checks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add components/wagers/MatchWagerBox.tsx
git commit -m "feat(wagers): add Wagers-only MatchWagerBox"
```

---

### Task 9: Category pages — Team Futures, Player Futures, Matches, Props, Fourballs

**Files:**
- Create: `app/wagers/team-futures/page.tsx`
- Create: `app/wagers/player-futures/page.tsx`
- Create: `app/wagers/matches/page.tsx`
- Create: `app/wagers/props/page.tsx`
- Create: `app/wagers/fourballs/page.tsx`

**Interfaces:**
- Consumes: `CategoryPageShell`, `WagerBox` (Task 6), `TeamFuturesCard`, `FuturesLadder` (Task 7), `MatchWagerBox` (Task 8), `PropBetRow` (existing, untouched), `useLiveTournament` (existing), `currentRoundDay` (existing), `getPlayerDisplayName` (existing), `matchPropMarkets` (existing).
- Produces: the 5 route pages Task 10's `CategoryTabs` links to.

- [ ] **Step 1: Team Futures page**

```tsx
// app/wagers/team-futures/page.tsx
"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";
import { TeamFuturesCard } from "@/components/wagers/TeamFuturesCard";

export default function TeamFuturesPage() {
  const { tournament, loading, payload } = useLiveTournament();

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  return (
    <CategoryPageShell
      rulesText="Pick which team wins the tournament overall. A wager locks in the odds shown at the moment you place it; payouts use standard American odds."
      searchPlaceholder="Search Maroon or White..."
    >
      {(search) => {
        const term = search.trim().toLowerCase();
        const visible = term === "" || "maroon".includes(term) || "white".includes(term) || "team winner".includes(term);
        return visible ? <TeamFuturesCard tournament={tournament} /> : <p className="font-sans text-sm text-ink-400">No markets match &ldquo;{search}&rdquo;.</p>;
      }}
    </CategoryPageShell>
  );
}
```

- [ ] **Step 2: Player Futures page**

```tsx
// app/wagers/player-futures/page.tsx
"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";
import { FuturesLadder } from "@/components/wagers/FuturesLadder";

export default function PlayerFuturesPage() {
  const { tournament, loading, payload } = useLiveTournament();

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  return (
    <CategoryPageShell
      rulesText="Pick who wins the tournament outright. A wager locks in the odds shown at the moment you place it; payouts use standard American odds."
      searchPlaceholder="Search a player..."
    >
      {(search) => <FuturesLadder standings={tournament.individualLeaderboard} search={search} />}
    </CategoryPageShell>
  );
}
```

- [ ] **Step 3: Matches page**

```tsx
// app/wagers/matches/page.tsx
"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { currentRoundDay } from "@/components/leaderboard/matchUtils";
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";
import { MatchWagerBox } from "@/components/wagers/MatchWagerBox";

export default function MatchesPage() {
  const { tournament, loading, payload } = useLiveTournament();

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  const todaysMatches = tournament.matches.filter((match) => match.day === currentRoundDay(tournament));

  return (
    <CategoryPageShell
      rulesText="Pick the winning side of today's match. Odds update as play continues, but a wager locks in the odds shown at the moment you place it."
      searchPlaceholder="Search a player..."
    >
      {(search) => {
        const term = search.trim().toLowerCase();
        const filtered = todaysMatches.filter(
          (match) =>
            term === "" ||
            [...match.maroonPlayers, ...match.whitePlayers].some((player) => getPlayerDisplayName(player).toLowerCase().includes(term))
        );
        if (filtered.length === 0) {
          return (
            <p className="font-sans text-sm text-ink-400">
              {todaysMatches.length === 0 ? "No matches posted yet." : `No matches match “${search}”.`}
            </p>
          );
        }
        return filtered.map((match) => <MatchWagerBox key={match.id} match={match} />);
      }}
    </CategoryPageShell>
  );
}
```

- [ ] **Step 4: Props page**

```tsx
// app/wagers/props/page.tsx
"use client";

import { ListOrdered } from "lucide-react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerDisplayName } from "@/lib/data/players";
import { currentRoundDay } from "@/components/leaderboard/matchUtils";
import { matchPropMarkets } from "@/lib/wagers/mockOdds";
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";
import { WagerBox } from "@/components/wagers/WagerBox";
import { PropBetRow } from "@/components/wagers/PropBetRow";

function matchLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

export default function PropsPage() {
  const { tournament, loading, payload } = useLiveTournament();

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  const todaysMatches = tournament.matches.filter((match) => match.day === currentRoundDay(tournament));

  return (
    <CategoryPageShell
      rulesText="Pick over/under on a specific player's stat for one match. A wager locks in the line and odds shown at the moment you place it."
      searchPlaceholder="Search a player..."
    >
      {(search) => {
        const term = search.trim().toLowerCase();
        const boxes = todaysMatches
          .map((match) => ({
            match,
            markets: matchPropMarkets(match).filter(
              (market) => term === "" || getPlayerDisplayName(market.player).toLowerCase().includes(term)
            ),
          }))
          .filter((entry) => entry.markets.length > 0);

        if (boxes.length === 0) {
          return (
            <p className="font-sans text-sm text-ink-400">
              {todaysMatches.length === 0 ? "No player props posted yet." : `No props match “${search}”.`}
            </p>
          );
        }

        return boxes.map(({ match, markets }) => (
          <WagerBox key={match.id} icon={<ListOrdered size={16} />} title={matchLabel([...match.maroonPlayers, ...match.whitePlayers])}>
            <div className="flex flex-col">
              {markets.map((market) => (
                <PropBetRow key={market.id} market={market} />
              ))}
            </div>
          </WagerBox>
        ));
      }}
    </CategoryPageShell>
  );
}
```

- [ ] **Step 5: Fourballs page**

```tsx
// app/wagers/fourballs/page.tsx
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";

export default function FourballsPage() {
  return (
    <CategoryPageShell
      rulesText="Fourball markets will post here once fourball matchups are scheduled."
      searchPlaceholder="Search a fourball market..."
    >
      {() => <p className="font-sans text-sm text-ink-400">No fourball markets posted yet.</p>}
    </CategoryPageShell>
  );
}
```

- [ ] **Step 6: Verify it builds**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 7: Manually verify each page**

Run: `npm run dev`, navigate directly to `/wagers/team-futures`, `/wagers/player-futures`, `/wagers/matches`, `/wagers/props`, `/wagers/fourballs`. Confirm:
- Each shows its rules blurb, search box, and boxes (or the Fourballs empty state).
- Typing in search filters the boxes on Player Futures/Matches/Props.
- Tapping an odds button still opens the existing bet slip and places a wager as before.
- Toggling to Real Wagers on any of the 5 shows the "Coming soon" panel; toggling back restores the markets.
- Nav bar reads `< Wagers — {Category} — My Portfolio` on each.

- [ ] **Step 8: Commit**

```bash
git add app/wagers/team-futures app/wagers/player-futures app/wagers/matches app/wagers/props app/wagers/fourballs
git commit -m "feat(wagers): add the 5 category pages"
```

---

### Task 10: Hub becomes category tabs only

**Files:**
- Create: `components/wagers/CategoryTabs.tsx`
- Modify: `app/wagers/page.tsx`

**Interfaces:**
- Produces: `CategoryTabs(): JSX.Element`, rendered by the rewritten hub page.

- [ ] **Step 1: Write CategoryTabs**

```tsx
// components/wagers/CategoryTabs.tsx
import Link from "next/link";

const CATEGORIES = [
  { href: "/wagers/team-futures", label: "Team Futures" },
  { href: "/wagers/player-futures", label: "Player Futures" },
  { href: "/wagers/matches", label: "Matches" },
  { href: "/wagers/fourballs", label: "Fourballs" },
  { href: "/wagers/props", label: "Props" },
];

/**
 * The Wagers hub's 5-way category row — Team Futures, Player Futures,
 * Matches, Fourballs, Props. Tapping one navigates straight to that
 * category's own page; the hub itself renders no wager content.
 */
export function CategoryTabs() {
  return (
    <nav className="grid grid-cols-5 gap-1 px-2 pt-4 sm:px-7">
      {CATEGORIES.map((category) => (
        <Link
          key={category.href}
          href={category.href}
          className="flex flex-col items-center gap-1 rounded-md border border-ink-100 bg-white px-1 py-3 text-center font-condensed text-3xs font-bold uppercase tracking-wide text-maroon-700 hover:bg-maroon-50"
        >
          {category.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite the hub page**

```tsx
// app/wagers/page.tsx
import { CategoryTabs } from "@/components/wagers/CategoryTabs";

export default function WagersPage() {
  return <CategoryTabs />;
}
```

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Manually verify the hub**

Run: `npm run dev`, navigate to `/wagers`. Confirm all 5 category tabs are visible without scrolling on a phone-width viewport, and each navigates to its page.

- [ ] **Step 5: Commit**

```bash
git add components/wagers/CategoryTabs.tsx app/wagers/page.tsx
git commit -m "feat(wagers): rewrite hub as category tabs only"
```

---

### Task 11: My Portfolio page

**Files:**
- Create: `app/wagers/portfolio/page.tsx`

**Interfaces:**
- Consumes: `MyWagersList` (existing, unchanged).

- [ ] **Step 1: Write the page**

```tsx
// app/wagers/portfolio/page.tsx
import { MyWagersList } from "@/components/wagers/MyWagersList";

export default function PortfolioPage() {
  return (
    <div className="px-4 pt-5 sm:px-7">
      <MyWagersList />
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, place a test wager from any category page, then tap **My Portfolio** in the nav bar. Confirm it lists the wager and the back link reads `< Wagers`.

- [ ] **Step 4: Commit**

```bash
git add app/wagers/portfolio
git commit -m "feat(wagers): add My Portfolio page"
```

---

### Task 12: Remove the old hub content component and do a full verification pass

**Files:**
- Delete: `components/wagers/WagersHubContent.tsx`

**Interfaces:** none — this is cleanup, nothing else references this file after Task 10.

- [ ] **Step 1: Confirm nothing still imports it**

Run: `grep -rn "WagersHubContent" app components lib --include=*.tsx --include=*.ts`
Expected: no results (Task 10 already stopped `app/wagers/page.tsx` from importing it).

- [ ] **Step 2: Delete the file**

```bash
git rm components/wagers/WagersHubContent.tsx
```

- [ ] **Step 3: Full verification pass**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all four clean.

- [ ] **Step 4: Full manual click-through**

Run: `npm run dev`. Walk the whole section end to end:
1. From the bottom tab bar, tap **More** → **Wagers**. Splash plays, then the hub with 5 category tabs appears.
2. Tap each of the 5 tabs in turn; confirm the nav bar's back label reads `< Wagers` and the title matches the category, and `< Wagers` returns to the hub.
3. On the hub, tap `< More` — confirm the More drawer opens.
4. On a category page, place a test wager via the existing bet slip; confirm it deducts from the balance as before.
5. Tap **My Portfolio**; confirm the wager appears and `< Wagers` returns to the hub.
6. Toggle **Real Wagers** on a category page; confirm the "Coming soon" panel appears and the toggle stays in sync across pages (it should reset to MM Coins only on a fresh section entry, not when moving between category pages).
7. Navigate to `/leaderboard/<a live or historical slug>/matches/<a match id>` and confirm the Match Breakdown page's Wagers section (`MatchWinnerCard`/`PropBetRow`) looks exactly as it did before this round — untouched.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(wagers): remove superseded WagersHubContent"
```

---

## Self-Review Notes

- **Spec coverage:** entry splash (Task 4/5), nav bar + back-button stack (Tasks 1/4/5), category tabs (Task 10), 5 category pages with rules/search/boxes (Task 9), My Portfolio (Task 11), MM Coins/Real Wagers toggle with "Coming soon" (Tasks 2/6), Fourballs placeholder (Task 9 Step 5), `MatchWinnerCard`/`PropBetRow` left untouched (Task 8 rationale, Task 12 Step 4.7 verifies it) — all covered.
- **Placeholder scan:** no TODO/TBD left in code; the splash's placeholder background and the rules copy are explicitly flagged in the spec as intentional stand-ins, not omissions.
- **Type consistency:** `WagersNavBarContent`, `WagersMode`, `FuturesLadder`'s `search` prop, and `WagerBox`/`CategoryPageShell`'s prop names are used identically everywhere they're consumed across tasks.
