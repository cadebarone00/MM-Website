# Home Quick-Glance Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3 big square action tiles + sidebar on the home page with a two-column row: a wide Highlights rail on the left, and a slim stack of 3 small "quick-glance" cards (Leaderboard, Teams, Schedule) on the right, each reading live 2027 data when available and falling back to labeled 2026 data otherwise.

**Architecture:** Three new small presentational client components (`QuickLeaderboardCard`, `QuickTeamsCard`, `QuickScheduleCard`), each independently calling the existing `useLiveTournament()` hook (already polls `/api/live-feed` every 10s and merges into a `Tournament` shape via `mergeLiveTournament`). `HomeDashboard.tsx` is restructured to lay these out in a 2-column grid next to a de-positioned `HighlightsRail`, and the now-dead old `ActionCard`/`ScheduleCard` code is removed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4. No test runner is configured in this repo (`package.json` only has `dev`/`build`/`start`/`lint`) — verification is `tsc --noEmit`, `next build`, `eslint`, and a manual/Playwright visual check against the dev server, consistent with how the rest of this codebase is verified.

## Global Constraints

- No new dependencies. No backend/API changes — `/api/live-feed` and `useLiveTournament` are used as-is.
- Follow existing design tokens only: colors like `maroon-700`, `gold-400`, `cream-50`, `ink-900`; text sizes `text-3xs`/`text-2xs` (defined in `app/globals.css`); `font-condensed`/`font-sans`/`font-score`.
- No `new Date()` / `Date.now()` / `Math.random()` evaluated during render (the whole site was just fixed for a hydration bug caused by exactly this in `RoundCountdown.tsx` — see `components/ui/RoundCountdown.tsx` for the pattern to avoid). The one date computation needed here (`nextTournament.startDate` → `"1/6/2027"`) must be pure string parsing of the static ISO date, not a `Date` object read at render time.
- Player names in rosters/leaderboards are stored as short first names (e.g. `"Cade"`); always render them through `getPlayerDisplayName` from `@/lib/data/players` for consistency with the rest of the site.
- Each new quick card is a single `Link` wrapping its whole content (per spec: no per-player links/avatars inside the Teams card).

---

## File Map

- Create: `components/home/QuickLeaderboardCard.tsx`
- Create: `components/home/QuickTeamsCard.tsx`
- Create: `components/home/QuickScheduleCard.tsx`
- Modify: `components/home/HomeDashboard.tsx` (remove `ActionCard`, `ScheduleCard`, their now-dead types/consts/imports; restructure `HomeDashboard()`; de-position `HighlightsRail`)

---

### Task 1: QuickLeaderboardCard

**Files:**
- Create: `components/home/QuickLeaderboardCard.tsx`

**Interfaces:**
- Consumes: `useLiveTournament()` from `@/lib/hooks/useLiveTournament` → `{ tournament: Tournament }`; `latestCompleted` from `@/lib/data`; `getPlayerDisplayName` from `@/lib/data/players`; `IndividualStanding` type from `@/lib/data/types`.
- Produces: `export function QuickLeaderboardCard(): JSX.Element`, used by `HomeDashboard.tsx` in Task 4.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { latestCompleted } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { IndividualStanding } from "@/lib/data/types";

function topFive(standings: IndividualStanding[]): IndividualStanding[] {
  return [...standings].sort((a, b) => a.toPar - b.toPar).slice(0, 5);
}

export function QuickLeaderboardCard() {
  const { tournament } = useLiveTournament();
  const isLive = tournament.individualLeaderboard.length > 0;
  const rows = topFive(isLive ? tournament.individualLeaderboard : latestCompleted.individualLeaderboard);

  return (
    <Link
      href="/leaderboard"
      className="group flex flex-col gap-2 rounded-md border border-gold-400 bg-cream-50 p-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg sm:gap-3 sm:p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">
          <Trophy size={14} />
          Leaderboard
        </div>
        {!isLive && (
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-ink-400">{latestCompleted.year}</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row, i) => (
          <div key={row.player} className="flex items-center justify-between gap-2 text-xs sm:text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="font-condensed text-3xs font-bold text-ink-400 sm:text-2xs">{i + 1}</span>
              <span className="truncate font-sans font-semibold text-ink-900">{getPlayerDisplayName(row.player)}</span>
            </span>
            <ScoreBadge value={row.toPar} size="sm" />
          </div>
        ))}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `QuickLeaderboardCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/home/QuickLeaderboardCard.tsx
git commit -m "feat: add home quick-glance leaderboard card"
```

---

### Task 2: QuickTeamsCard

**Files:**
- Create: `components/home/QuickTeamsCard.tsx`

**Interfaces:**
- Consumes: `useLiveTournament()` → `{ tournament: Tournament }`; `latestCompleted`, `fmtPt` from `@/lib/data`; `getPlayerDisplayName` from `@/lib/data/players`.
- Produces: `export function QuickTeamsCard(): JSX.Element`, used by `HomeDashboard.tsx` in Task 4.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { latestCompleted, fmtPt } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";

export function QuickTeamsCard() {
  const { tournament } = useLiveTournament();
  const isLive = tournament.roster.maroon.length > 0 && tournament.roster.white.length > 0;
  const source = isLive ? tournament : latestCompleted;

  return (
    <Link
      href="/teams"
      className="group flex flex-col gap-2 rounded-md border border-gold-400 bg-cream-50 p-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg sm:gap-3 sm:p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">
          <Shield size={14} />
          Teams
        </div>
        {!isLive && (
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-ink-400">{latestCompleted.year}</span>
        )}
      </div>
      <div className="text-center font-condensed text-sm font-black tabular-nums text-ink-900 sm:text-lg">
        {fmtPt(source.maroonPts)}&ndash;{fmtPt(source.whitePts)}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-maroon-700">Maroon</span>
          {source.roster.maroon.map((player) => (
            <span key={player} className="truncate font-sans text-2xs text-ink-800 sm:text-xs">
              {getPlayerDisplayName(player)}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 border-l border-ink-100 pl-2">
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-ink-500">White</span>
          {source.roster.white.map((player) => (
            <span key={player} className="truncate font-sans text-2xs text-ink-800 sm:text-xs">
              {getPlayerDisplayName(player)}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `QuickTeamsCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/home/QuickTeamsCard.tsx
git commit -m "feat: add home quick-glance teams card"
```

---

### Task 3: QuickScheduleCard

**Files:**
- Create: `components/home/QuickScheduleCard.tsx`

**Interfaces:**
- Consumes: `useLiveTournament()` → `{ tournament: Tournament }` (uses `tournament.matches: RealMatch[]`); `nextTournament` from `@/lib/data`.
- Produces: `export function QuickScheduleCard(): JSX.Element`, used by `HomeDashboard.tsx` in Task 4.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament } from "@/lib/data";

function placeholderDateLabel(startDate: string): string {
  const [year, month, day] = startDate.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

export function QuickScheduleCard() {
  const { tournament } = useLiveTournament();
  const liveMatch = tournament.matches.find((match) => match.status === "live");

  return (
    <Link
      href="/schedule"
      className="group flex flex-col gap-2 rounded-md border border-gold-400 bg-cream-50 p-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg sm:gap-3 sm:p-3"
    >
      <div className="flex items-center gap-1.5 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">
        <CalendarDays size={14} />
        Schedule
      </div>
      {liveMatch ? (
        <div>
          <div className="font-sans text-xs font-bold text-ink-900 sm:text-sm">
            Round {liveMatch.day} &mdash; {liveMatch.session}
          </div>
          <div className="font-sans text-2xs text-ink-500 sm:text-xs">{liveMatch.format}</div>
        </div>
      ) : (
        <div>
          <div className="font-sans text-xs font-bold text-ink-900 sm:text-sm">
            Round 1 starts {placeholderDateLabel(nextTournament.startDate)}
          </div>
          <div className="font-sans text-2xs text-ink-500 sm:text-xs">{nextTournament.venue}</div>
        </div>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `QuickScheduleCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/home/QuickScheduleCard.tsx
git commit -m "feat: add home quick-glance schedule card"
```

---

### Task 4: Wire the quick cards into HomeDashboard, remove dead code

**Files:**
- Modify: `components/home/HomeDashboard.tsx`

**Interfaces:**
- Consumes: `QuickLeaderboardCard`, `QuickTeamsCard`, `QuickScheduleCard` from Tasks 1–3 (no props).
- Produces: `export function HomeDashboard(): JSX.Element` (signature unchanged — still the default export consumed by `app/page.tsx`).

- [ ] **Step 1: Remove the now-dead old tiles and their support code**

In `components/home/HomeDashboard.tsx`, delete entirely:
- The `ScheduleItem` and `SessionSetupFeedItem` types (lines 12–18 in the current file).
- The `fallbackScheduleItems` const (lines 20–29).
- The `ActionCard` function (lines 116–146).
- The `ScheduleCard` function (lines 148–203).

Remove now-unused imports that only those deleted pieces used: `ArrowRight`, `CalendarDays`, `Shield` from the `lucide-react` import, and `type { ReactNode }` (only `ActionCard`'s `children` prop used it). Leave `Play`, `X`, `Trophy` (still used by `SocialsSection`, `NewsSection`, `HighlightsRail`), and `Image`, `Link`, `useEffect`, `useState` (still used elsewhere in the file).

- [ ] **Step 2: Add the new imports**

At the top of `components/home/HomeDashboard.tsx`, add:

```tsx
import { QuickLeaderboardCard } from "@/components/home/QuickLeaderboardCard";
import { QuickTeamsCard } from "@/components/home/QuickTeamsCard";
import { QuickScheduleCard } from "@/components/home/QuickScheduleCard";
```

- [ ] **Step 3: De-position `HighlightsRail`**

Change the `HighlightsRail` function so it no longer assumes it's one cell in a 3/4-column grid (it's now the whole left column of a 2-column row). Replace:

```tsx
function HighlightsRail() {
  return (
    <aside className="col-span-3 rounded-lg border border-maroon-800 bg-maroon-900 p-3 text-white shadow-xl sm:p-5 xl:col-span-1 xl:row-span-3">
      <div className="xl:sticky xl:top-[94px]">
        <div className="mb-2 flex items-center gap-2 font-condensed text-xs font-semibold uppercase tracking-wide text-gold-300 sm:mb-3">
          <Trophy size={16} />
          Highlights
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-1 xl:max-h-[980px] xl:space-y-3 xl:gap-0 xl:overflow-y-auto xl:pr-1">
          {highlights.map((item) => (
            <article key={item.title} className="rounded-md border border-white/10 bg-white/[0.08] p-2 sm:p-4">
              <h3 className="m-0 font-sans text-xs font-extrabold text-white sm:text-base">{item.title}</h3>
              <p className="mt-1 font-sans text-[11px] leading-snug text-maroon-100 sm:mt-2 sm:text-sm sm:leading-relaxed">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}
```

with:

```tsx
function HighlightsRail() {
  return (
    <aside className="min-w-0 rounded-lg border border-maroon-800 bg-maroon-900 p-3 text-white shadow-xl sm:p-5">
      <div className="mb-2 flex items-center gap-2 font-condensed text-xs font-semibold uppercase tracking-wide text-gold-300 sm:mb-3">
        <Trophy size={16} />
        Highlights
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-1 xl:max-h-[980px] xl:space-y-3 xl:gap-0 xl:overflow-y-auto xl:pr-1">
        {highlights.map((item) => (
          <article key={item.title} className="rounded-md border border-white/10 bg-white/[0.08] p-2 sm:p-4">
            <h3 className="m-0 font-sans text-xs font-extrabold text-white sm:text-base">{item.title}</h3>
            <p className="mt-1 font-sans text-[11px] leading-snug text-maroon-100 sm:mt-2 sm:text-sm sm:leading-relaxed">{item.body}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Rewrite `HomeDashboard()`**

Replace:

```tsx
export function HomeDashboard() {
  return (
    <section className="bg-cream-100">
      <div className="mx-auto grid max-w-[1440px] grid-cols-3 gap-2 px-4 py-4 sm:gap-4 sm:px-7 sm:py-8 xl:grid-cols-4 xl:gap-7">
        <ActionCard
          href="/teams"
          icon={<Shield size={22} />}
          title="Teams"
          body="Check out the Maroon and White rosters, player profiles, photos, bios, and team identities."
        />
        <ActionCard
          href="/leaderboard"
          icon={<Trophy size={22} />}
          title="Leaderboard"
          body="When the tournament is live, follow matches and individual standings in real time."
        />
        <ScheduleCard />
        <HighlightsRail />

        <div className="col-span-3 space-y-6 sm:space-y-10 xl:col-span-3">
          <NewsSection />
          <SocialsSection />
        </div>
      </div>
    </section>
  );
}
```

with:

```tsx
export function HomeDashboard() {
  return (
    <section className="bg-cream-100">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-7 sm:py-8">
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(84px,1fr)] gap-2 sm:gap-4 xl:gap-7">
          <HighlightsRail />
          <div className="flex min-w-0 flex-col gap-2 sm:gap-3 xl:gap-4">
            <QuickLeaderboardCard />
            <QuickTeamsCard />
            <QuickScheduleCard />
          </div>
        </div>

        <div className="mt-6 space-y-6 sm:mt-10 sm:space-y-10">
          <NewsSection />
          <SocialsSection />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no unused-import warnings.

- [ ] **Step 6: Commit**

```bash
git add components/home/HomeDashboard.tsx
git commit -m "refactor: rebuild home page into highlights + quick-glance card rail"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npx next build`
Expected: build succeeds with no type or lint errors, `/` (home) listed in the route output.

- [ ] **Step 2: Visual check on the dev server**

Run: `npx next dev -p 3100` (background), then load `http://localhost:3100/` in a browser (or via a short Playwright script like the one used for the earlier hydration-bug verification in this repo's history) and confirm:
- Highlights fills the left column, the 3 quick cards are stacked in a narrower right column, side-by-side at desktop, tablet, and a narrow (~375px) mobile width — no reordering/stacking to full width at any size.
- Leaderboard card shows 5 ranked names with score badges, labeled "2026" (since `LIVE_FEED_URL` is unset in this environment, the fallback path is what's exercised).
- Teams card shows 6 Maroon names and 6 White names with the "17–16" 2026 final score on top, labeled "2026".
- Schedule card shows "Round 1 starts 1/6/2027" and "Mission Hills CC" (no live match exists in the fallback/no-feed state).
- No hydration errors in the browser console (check the same way as the earlier `RoundCountdown` fix: console messages containing "hydrat").
- News and Socials sections below are visually unchanged.

- [ ] **Step 3: Stop the dev server**

Kill the `next dev` process started in Step 2.
