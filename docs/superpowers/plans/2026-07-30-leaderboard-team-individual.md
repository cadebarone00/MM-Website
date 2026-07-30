# Leaderboard Team/Individual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/leaderboard` page's always-both-visible match grid + individual table with a compact score ticker and a Team/Individual toggle (Team = vertical head-to-head match rows grouped by round/session; Individual = a frozen-POS/PLAYER, horizontally-scrollable round-by-round table), matching the reference screenshots, at every breakpoint.

**Architecture:** New small leaderboard components (`matchUtils.ts`, `PointsRibbon.tsx`, `TeamMatchesBoard.tsx`, `IndividualLeaderboardTable.tsx`, `LeaderboardBoard.tsx`) replace `MatchPlayShowcase.tsx`. Two existing components already do most of what the Team view needs — `components/match/ResultChevron.tsx` and `components/match/MatchRow.tsx` (currently only used by the year-recap sidebar `MatchesSection.tsx`) — so they gain an optional `size` prop instead of being duplicated. `LeaderboardTable.tsx` (History page) and `LeaderboardStrip.tsx` (home page) are untouched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4. No test framework is configured in this repo (no jest/vitest, no `*.test.ts` files, no `test` script in `package.json`) — this plan follows the project's existing verification pattern instead: `npx tsc --noEmit` for type safety, `npm run lint` for style, and manual checks against the running dev server (`npm run dev`, which serves on **port 3001** per `package.json`).

## Global Constraints

- Preserve exact current visual behavior for every call site NOT explicitly changed by this plan (`MatchRow`'s default `size="md"` must render pixel-identical to today's `MatchesSection.tsx` usage; `ResultChevron`'s default `size="md"` must render pixel-identical to today's usage).
- `LeaderboardTable.tsx` (used by `components/history/HistoryPageContent.tsx`) and `LeaderboardStrip.tsx` (used by `components/home/LiveLeaderboardStripSection.tsx`) are out of scope — do not modify or delete them.
- Do not touch `/schedule`, `/teams`, `MobileTabBar`, or `MorePanel`.
- Every new/modified `.tsx` file is a Client Component (`"use client"`) if it uses `useState`/`useEffect`, matching existing conventions in this codebase.
- Follow existing color/typography tokens exactly as used elsewhere in `components/leaderboard/` and `components/match/` (`font-condensed`, `font-sans`, `font-score`, `maroon-700`, `gold-400`, `ink-900`, `cream-50`, `text-2xs`/`text-3xs` custom sizes) — do not invent new tokens.

---

## Task 1: `ResultChevron` gains a `size` prop

**Files:**
- Modify: `components/match/ResultChevron.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ResultChevron({ winner, children, size?, className? })` where `size?: "sm" | "md" | "lg"` (default `"md"`, pixel-identical to today's fixed 34px-tall badge). Every later task that renders a bigger or smaller chevron uses this prop.

- [ ] **Step 1: Rewrite the component with sized variants**

Replace the full contents of `components/match/ResultChevron.tsx` with:

```tsx
import type { ReactNode } from "react";
import type { Team } from "@/lib/data/types";

const MAROON_700 = "#500001";
const GOLD_500 = "#b8945a";

const LEFT_POINTS = "0,22 30,0 100,0 100,44 30,44";
const RIGHT_POINTS = "100,22 70,0 0,0 0,44 70,44";

export type ResultChevronSize = "sm" | "md" | "lg";

const TIE_SIZE_CLASSES: Record<ResultChevronSize, string> = {
  sm: "h-[22px] w-[40px] text-2xs",
  md: "h-[34px] w-[58px] text-sm",
  lg: "h-[48px] w-[86px] text-lg",
};

const CHEVRON_SIZE_CLASSES: Record<ResultChevronSize, string> = {
  sm: "h-[22px] w-[44px] text-2xs",
  md: "h-[34px] w-[62px] text-sm",
  lg: "h-[48px] w-[92px] text-lg",
};

export function ResultChevron({
  winner,
  children,
  size = "md",
  className,
}: {
  winner: Team | "tie";
  children: ReactNode;
  size?: ResultChevronSize;
  className?: string;
}) {
  if (winner === "tie") {
    return (
      <span
        className={[
          "inline-flex items-center justify-center border-2 border-ink-900 px-2 font-condensed font-extrabold uppercase tracking-wide text-ink-900",
          TIE_SIZE_CLASSES[size],
          className ?? "",
        ].join(" ")}
      >
        {children}
      </span>
    );
  }

  const isMaroon = winner === "maroon";

  return (
    <span
      className={[
        "relative inline-flex items-center justify-center font-condensed font-extrabold uppercase tracking-wide drop-shadow-md",
        CHEVRON_SIZE_CLASSES[size],
        isMaroon ? "text-white" : "text-maroon-700",
        className ?? "",
      ].join(" ")}
    >
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <polygon
          points={isMaroon ? LEFT_POINTS : RIGHT_POINTS}
          fill={isMaroon ? MAROON_700 : "#ffffff"}
          stroke={GOLD_500}
          strokeWidth={3}
        />
      </svg>
      <span className={["relative z-10", isMaroon ? "pl-2 pr-1" : "pl-1 pr-2"].join(" ")}>{children}</span>
    </span>
  );
}
```

Note the `md` values (`h-[34px] w-[58px]` / `h-[34px] w-[62px]`, `text-sm`) are exactly the original hardcoded dimensions — this is a pure addition, not a visual change, for every existing caller.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify no regression**

Run `npm run dev`, open `http://localhost:3001/history`, pick a past year, open its recap/matches sidebar (wherever `MatchesSection` renders — confirm via `components/recap/MatchesSection.tsx`'s usage if unsure which page). Confirm the match result chevrons look exactly as before (no size change).

- [ ] **Step 4: Commit**

```bash
git add components/match/ResultChevron.tsx
git commit -m "feat: add a size prop to ResultChevron for the redesigned Team leaderboard view"
```

---

## Task 2: `MatchRow` gains a `size` prop

**Files:**
- Modify: `components/match/MatchRow.tsx`

**Interfaces:**
- Consumes: `ResultChevron({ winner, children, size? })` from Task 1.
- Produces: `MatchRow({ match, defendingChampion?, tournamentSlug, size? })` where `size?: "md" | "lg"` (default `"md"`, pixel-identical to today). Task 5 (`TeamMatchesBoard`) renders `<MatchRow ... size="lg" />`.

- [ ] **Step 1: Add the prop and forward it**

In `components/match/MatchRow.tsx`, change the exported function signature and body (everything else in the file — `matchStatus`, `matchLeader`, `liveLabel`, `labelColor`, `TeamSide` — stays exactly as-is):

```tsx
export function MatchRow({
  match,
  defendingChampion = null,
  tournamentSlug,
  size = "md",
}: {
  match: RealMatch;
  index?: number;
  defendingChampion?: string | null;
  tournamentSlug: string;
  size?: "md" | "lg";
}) {
  const status = matchStatus(match);
  const centerLabel = status === "scheduled" ? "VS" : liveLabel(match);
  const rowPadding = size === "lg" ? "px-4 py-5 sm:px-6" : "px-4 py-4";
  const gridCols = size === "lg" ? "grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_86px_minmax(0,1fr)]";
  const pillClasses =
    size === "lg"
      ? "inline-flex min-h-[48px] min-w-[86px] items-center justify-center rounded-pill border px-4 font-condensed text-xl font-extrabold uppercase tracking-wide"
      : "inline-flex min-h-[44px] min-w-[62px] items-center justify-center rounded-pill border px-3 font-condensed text-lg font-extrabold uppercase tracking-wide";

  return (
    <div className={["border-b border-ink-100 bg-white last:border-b-0", rowPadding].join(" ")}>
      <div className={["grid min-h-[84px] items-center gap-3", gridCols].join(" ")}>
        <TeamSide players={match.maroonPlayers} team="maroon" defendingChampion={defendingChampion} tournamentSlug={tournamentSlug} />
        <div className="flex justify-center">
          {status === "final" ? (
            <ResultChevron winner={matchLeader(match)} size={size === "lg" ? "lg" : "md"}>
              {centerLabel}
            </ResultChevron>
          ) : (
            <span className={[pillClasses, labelColor(match)].join(" ")}>{centerLabel}</span>
          )}
        </div>
        <TeamSide players={match.whitePlayers} team="white" defendingChampion={defendingChampion} tournamentSlug={tournamentSlug} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify no regression**

Same manual check as Task 1 Step 3 — `MatchesSection` doesn't pass `size`, so it must render unchanged.

- [ ] **Step 4: Commit**

```bash
git add components/match/MatchRow.tsx
git commit -m "feat: add a size prop to MatchRow for the redesigned Team leaderboard view"
```

---

## Task 3: Shared match/session helpers (`matchUtils.ts`)

**Files:**
- Create: `components/leaderboard/matchUtils.ts`

**Interfaces:**
- Consumes: `RealMatch`, `Team`, `Tournament` types from `@/lib/data/types`.
- Produces: `matchStatus(match)`, `matchLeader(match)`, `matchLabel(match)`, `currentRoundDay(tournament): number`, `centralDateLabel(): string`, `LIVE_START_LABEL: string`. Tasks 4 and 5 import from this file.

- [ ] **Step 1: Write the file**

```ts
import type { RealMatch, Team, Tournament } from "@/lib/data/types";

export function matchStatus(match: RealMatch) {
  return match.status ?? "final";
}

export function matchLeader(match: RealMatch): Team | "tie" {
  if (match.leader) return match.leader;
  if (match.maroonPts > match.whitePts) return "maroon";
  if (match.whitePts > match.maroonPts) return "white";
  return "tie";
}

export function matchLabel(match: RealMatch): string {
  const leader = matchLeader(match);
  const status = matchStatus(match);
  const margin = match.margin ?? Math.abs(match.maroonPts - match.whitePts);
  const remaining = match.holesRemaining;

  if (status === "scheduled") return "VS";
  if (leader === "tie") return "AS";
  if (status === "final" && remaining != null && remaining > 0) return `${margin}&${remaining}`;
  return `${margin} Up`;
}

/** Which round (day) the Team view should default to: the day currently in progress, or the last day played if the tournament is complete. */
export function currentRoundDay(tournament: Tournament): number {
  const days = [...new Set(tournament.matches.map((m) => m.day))].sort((a, b) => a - b);
  if (days.length === 0) return 1;
  const activeDay = days.find((day) => tournament.matches.some((m) => m.day === day && matchStatus(m) !== "final"));
  return activeDay ?? days[days.length - 1];
}

export const LIVE_START_LABEL = "9:30 AM CST on January 6";

export function centralDateLabel(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 0);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";

  return `${month} ${day}${suffix} ${year}`;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this file isn't imported anywhere yet, so it just needs to compile standalone).

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/matchUtils.ts
git commit -m "feat: add shared match/session helpers for the leaderboard redesign"
```

---

## Task 4: Restyled `PointsRibbon` ticker

**Files:**
- Create: `components/leaderboard/PointsRibbon.tsx`

**Interfaces:**
- Consumes: `defendingChampion`, `fmtPt` from `@/lib/data`; `Team`, `Tournament` from `@/lib/data/types`.
- Produces: `PointsRibbon({ tournament }: { tournament: Tournament })`. Tasks 8 imports and renders this in place of the old ribbon (note: the old signature took a `live` prop that was never used in its body — the new one drops it).

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useEffect, useState } from "react";
import { defendingChampion, fmtPt } from "@/lib/data";
import type { Team, Tournament } from "@/lib/data/types";

function useHeaderOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    function measure() {
      const header = document.querySelector("header");
      setOffset(header ? header.getBoundingClientRect().height : 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return offset;
}

function flooredFill(real: number, otherReal: number, floor = 15): number {
  const a = Math.max(floor, real);
  const b = Math.max(floor, otherReal);
  if (a + b <= 100) return a;
  return (a / (a + b)) * 100;
}

type BadgeState = { kind: "undecided" } | { kind: "wins" | "retains"; team: Team };

function computeBadgeState(tournament: Tournament): BadgeState {
  const half = tournament.pointsAvailable / 2;
  const defender = defendingChampion(tournament);

  if (tournament.maroonPts >= tournament.pointsToWin) return { kind: "wins", team: "maroon" };
  if (tournament.whitePts >= tournament.pointsToWin) return { kind: "wins", team: "white" };
  if (defender === "maroon" && tournament.maroonPts >= half) return { kind: "retains", team: "maroon" };
  if (defender === "white" && tournament.whitePts >= half) return { kind: "retains", team: "white" };
  return { kind: "undecided" };
}

/** Compact two-tone score ticker, sticky under the header. Proportional fill shows each team's share of available points; the middle strip carries the "points left" or win/retain state. */
export function PointsRibbon({ tournament }: { tournament: Tournament }) {
  const headerOffset = useHeaderOffset();
  const safeAvailable = tournament.pointsAvailable || 1;
  const realMaroon = Math.min(100, (tournament.maroonPts / safeAvailable) * 100);
  const realWhite = Math.min(100, (tournament.whitePts / safeAvailable) * 100);
  const maroonFill = flooredFill(realMaroon, realWhite);
  const whiteFill = flooredFill(realWhite, realMaroon);
  const stillAvailable = Math.max(0, tournament.pointsAvailable - tournament.maroonPts - tournament.whitePts);
  const badgeState = computeBadgeState(tournament);

  return (
    <div className="sticky z-40 w-screen ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]" style={{ top: headerOffset }}>
      <div className="flex h-[38px] w-full border-y border-gold-300 sm:h-[56px] lg:h-[74px]">
        <div
          className="flex items-center justify-end pr-[10%]"
          style={{ width: `${maroonFill}%`, background: "var(--color-maroon-700)" }}
        >
          <span className="font-sans text-lg font-black text-white sm:text-2xl lg:text-4xl">{fmtPt(tournament.maroonPts)}</span>
        </div>
        <div className="flex flex-1 items-center justify-center bg-cream-200 px-2">
          {badgeState.kind === "undecided" && (
            <span className="whitespace-nowrap border border-ink-900 px-1.5 py-0.5 font-sans text-3xs font-extrabold uppercase tracking-wide text-ink-900 sm:px-2 sm:py-1 sm:text-2xs">
              {fmtPt(stillAvailable)} Left
            </span>
          )}
        </div>
        <div
          className="flex items-center justify-start pl-[10%]"
          style={{ width: `${whiteFill}%`, background: "#fdfdfb" }}
        >
          <span className="font-sans text-lg font-black text-maroon-700 sm:text-2xl lg:text-4xl">{fmtPt(tournament.whitePts)}</span>
        </div>
      </div>
      <div className="flex min-h-[22px] items-center justify-between border-2 border-t-0 border-gold-400 bg-cream-100 px-2 sm:min-h-[32px] sm:px-4 lg:min-h-[40px] lg:px-6">
        <span className="font-sans text-2xs font-black text-maroon-700 sm:text-sm lg:text-xl">MAROON</span>
        {badgeState.kind !== "undecided" && (
          <span
            className={[
              "rounded-pill px-2 py-0.5 font-condensed text-3xs font-extrabold uppercase tracking-wide sm:px-3 sm:py-1 sm:text-2xs",
              badgeState.team === "maroon" ? "bg-maroon-700 text-white" : "border border-maroon-700 bg-white text-maroon-700",
            ].join(" ")}
          >
            {badgeState.team === "maroon" ? "Maroon" : "White"} {badgeState.kind === "wins" ? "Wins" : "Retains"}
          </span>
        )}
        <span className="font-sans text-2xs font-black text-ink-900 sm:text-sm lg:text-xl">WHITE</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/PointsRibbon.tsx
git commit -m "feat: add restyled compact PointsRibbon ticker"
```

(Not wired into any page yet — Task 8 does that. `MatchPlayShowcase.tsx` still exports its own old `PointsRibbon`, so nothing breaks in between.)

---

## Task 5: `TeamMatchesBoard` (screenshot-1 style Team view)

**Files:**
- Create: `components/leaderboard/TeamMatchesBoard.tsx`

**Interfaces:**
- Consumes: `matchStatus`, `matchLeader`, `matchLabel`, `currentRoundDay`, `centralDateLabel`, `LIVE_START_LABEL` from `./matchUtils` (Task 3); `ResultChevron` (Task 1) and `MatchRow` (Task 2) from `@/components/match/*`; `defendingIndividualChampion` from `@/lib/data`.
- Produces: `TeamMatchesBoard({ tournament, live }: { tournament: Tournament; live: boolean })`. Task 7 (`LeaderboardBoard`) renders this for the "Team" tab.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import { ResultChevron } from "@/components/match/ResultChevron";
import { MatchRow } from "@/components/match/MatchRow";
import { defendingIndividualChampion } from "@/lib/data";
import { centralDateLabel, currentRoundDay, matchLabel, matchLeader, matchStatus, LIVE_START_LABEL } from "./matchUtils";
import type { RealMatch, Tournament } from "@/lib/data/types";

type SessionGroup = { session: string; format: string; matches: RealMatch[] };

function groupBySession(matches: RealMatch[]): SessionGroup[] {
  const order: string[] = [];
  const bySession = new Map<string, RealMatch[]>();
  matches.forEach((m) => {
    if (!bySession.has(m.session)) {
      order.push(m.session);
      bySession.set(m.session, []);
    }
    bySession.get(m.session)!.push(m);
  });
  return order.map((session) => {
    const sessionMatches = bySession.get(session)!;
    return { session, format: sessionMatches[0].format, matches: sessionMatches };
  });
}

/** Live-only rule: if Morning has started and Afternoon's matches haven't, show "Upcoming" instead of "Afternoon". */
function sessionHeaderLabel(group: SessionGroup, dayMatches: RealMatch[], live: boolean): string {
  if (live && group.session === "Afternoon") {
    const afternoonStarted = group.matches.some((m) => matchStatus(m) !== "scheduled");
    const morningInProgress = dayMatches.some((m) => m.session === "Morning" && matchStatus(m) !== "scheduled");
    if (!afternoonStarted && morningInProgress) return "Upcoming";
  }
  return group.session;
}

function RecapStrip({ matches }: { matches: RealMatch[] }) {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-gold-200 bg-cream-50 py-2">
      {matches.map((match) => (
        <ResultChevron key={match.id} winner={matchLeader(match)} size="sm">
          {matchLabel(match)}
        </ResultChevron>
      ))}
    </div>
  );
}

function PlaceholderPanel() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gold-300 bg-cream-50 p-5 text-center shadow-xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-maroon-700 via-gold-400 to-ink-900" />
      <span className="mx-auto mb-2 inline-flex items-center gap-2 rounded-pill bg-white px-3 py-1 font-condensed text-[11px] font-bold uppercase tracking-wide text-maroon-700 shadow-sm">
        <Radio size={13} />
        Live
      </span>
      <h3 className="m-0 font-sans text-lg font-black text-ink-900">Round 1 hasn&rsquo;t started</h3>
      <p className="mt-2 font-sans text-sm text-ink-500">
        Waiting until {LIVE_START_LABEL} ({centralDateLabel()}) for the first tee times. Matches will appear here once they&rsquo;re posted.
      </p>
    </div>
  );
}

export function TeamMatchesBoard({ tournament, live }: { tournament: Tournament; live: boolean }) {
  const days = [...new Set(tournament.matches.map((m) => m.day))].sort((a, b) => a - b);
  const [day, setDay] = useState<number>(() => currentRoundDay(tournament));
  const champion = defendingIndividualChampion(tournament);

  if (days.length === 0) {
    return <PlaceholderPanel />;
  }

  const activeDay = days.includes(day) ? day : days[days.length - 1];
  const dayMatches = tournament.matches.filter((m) => m.day === activeDay);
  const sessionGroups = groupBySession(dayMatches);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5 sm:mb-6 sm:gap-2">
        {days.map((d) => {
          const on = d === activeDay;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={[
                "rounded-pill border px-3 py-1.5 font-condensed text-xs font-black uppercase tracking-wide transition-colors sm:px-4 sm:py-2 sm:text-sm",
                on ? "border-gold-400 bg-maroon-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-gold-400",
              ].join(" ")}
            >
              R{d}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-gold-300 bg-white shadow-lg">
        {sessionGroups.map((group, index) => (
          <div key={group.session}>
            <div className="border-b border-gold-200 bg-cream-50 px-4 py-2 font-condensed text-xs font-black uppercase tracking-wide text-gold-700">
              {sessionHeaderLabel(group, dayMatches, live)} · {group.format}
            </div>
            {group.matches.map((match) => (
              <MatchRow key={match.id} match={match} defendingChampion={champion} tournamentSlug={tournament.slug} size="lg" />
            ))}
            {group.matches.length > 1 && <RecapStrip matches={group.matches} />}
            {index < sessionGroups.length - 1 && <div className="h-px bg-ink-100" />}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/TeamMatchesBoard.tsx
git commit -m "feat: add TeamMatchesBoard (round pills + session groups + match rows)"
```

(Not wired into any page yet — Task 7/8 do that.)

---

## Task 6: `IndividualLeaderboardTable` (screenshot-2 style Individual view)

**Files:**
- Create: `components/leaderboard/IndividualLeaderboardTable.tsx`

**Interfaces:**
- Consumes: `getPlayerScorecard` from `@/lib/data`; `getPlayerAvatar`, `getPlayerDisplayName` from `@/lib/data/players`; `Avatar`, `ScoreBadge` from `@/components/ui/*`.
- Produces: `IndividualLeaderboardTable({ tournament }: { tournament: Tournament })`. Task 7 (`LeaderboardBoard`) renders this for the "Individual" tab.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { getPlayerScorecard } from "@/lib/data";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { RoundScorecard, Team, Tournament } from "@/lib/data/types";

type Filter = "all" | Team;

const filters: [Filter, string][] = [
  ["all", "All Players"],
  ["maroon", "Team Maroon"],
  ["white", "Team White"],
];

const POS_W = 40;
const PLAYER_W = 168;

function thruLabel(round: RoundScorecard | undefined): string {
  if (!round) return "—";
  const played = round.holes.filter((h) => h.score > 0).length;
  return played >= round.holes.length ? "F" : String(played);
}

/** Every "prior completed round" column number that appears for any player, so the table's columns stay consistent across rows even when scorecards are incomplete. */
function priorRoundNumbers(tournament: Tournament): number[] {
  const rounds = new Set<number>();
  tournament.scorecards?.forEach((sc) => {
    const sorted = [...sc.rounds].sort((a, b) => a.round - b.round);
    sorted.slice(0, -1).forEach((r) => rounds.add(r.round));
  });
  return [...rounds].sort((a, b) => a - b);
}

export function IndividualLeaderboardTable({ tournament }: { tournament: Tournament }) {
  const [filter, setFilter] = useState<Filter>("all");

  if (tournament.individualLeaderboard.length === 0) {
    return (
      <div className="rounded-md border border-ink-100 bg-cream-50 px-5 py-10 text-center">
        <p className="m-0 font-sans text-sm text-ink-500">No individual scores have posted yet. Check back once play begins.</p>
      </div>
    );
  }

  const sorted = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const ranked = sorted.map((p, i) => ({ ...p, pos: i + 1 }));
  const rows = ranked.filter((p) => filter === "all" || p.team === filter);
  const priorRounds = priorRoundNumbers(tournament);

  return (
    <div>
      <div className="mb-3 flex gap-1.5 sm:mb-5 sm:gap-2">
        {filters.map(([v, l]) => {
          const on = filter === v;
          return (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={[
                "cursor-pointer rounded-pill border-[1.5px] px-3 py-1 font-sans text-[11px] font-semibold transition-all duration-150 sm:px-[18px] sm:py-[7px] sm:text-[13px]",
                on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 bg-white text-ink-700",
              ].join(" ")}
            >
              {l}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gold-400 shadow-lg">
        <table className="w-full min-w-max border-collapse bg-cream-50">
          <thead>
            <tr className="border-b border-gold-200">
              <th
                style={{ position: "sticky", left: 0, width: POS_W, minWidth: POS_W }}
                className="z-10 bg-cream-50 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400"
              >
                Pos
              </th>
              <th
                style={{ position: "sticky", left: POS_W, width: PLAYER_W, minWidth: PLAYER_W }}
                className="z-10 bg-cream-50 py-2 pl-3 text-left font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400"
              >
                Player
              </th>
              <th className="px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">Tot</th>
              <th className="px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">Today</th>
              <th className="px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">Thru</th>
              {priorRounds.map((round) => (
                <th key={round} className="px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">
                  R{round}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const scorecard = getPlayerScorecard(tournament, p.player);
              const roundsSorted = scorecard ? [...scorecard.rounds].sort((a, b) => a.round - b.round) : [];
              const lastRound = roundsSorted[roundsSorted.length - 1];
              const priorForPlayer = roundsSorted.slice(0, -1);
              const isMaroon = p.team === "maroon";
              const rowBg = p.pos === 1 ? "bg-gold-100" : "bg-cream-50";

              return (
                <tr key={p.player} className={["border-b border-ink-100 last:border-b-0", rowBg].join(" ")}>
                  <td
                    style={{ position: "sticky", left: 0, width: POS_W, minWidth: POS_W }}
                    className={["py-2 text-center font-condensed text-sm font-bold tabular-nums text-ink-900", rowBg].join(" ")}
                  >
                    {p.pos}
                  </td>
                  <td
                    style={{ position: "sticky", left: POS_W, width: PLAYER_W, minWidth: PLAYER_W }}
                    className={["py-2 pl-3", rowBg].join(" ")}
                  >
                    <Link
                      href={`/leaderboard/${tournament.slug}/players/${p.player.toLowerCase()}`}
                      className="flex items-center gap-2 transition-opacity hover:opacity-80"
                    >
                      <Avatar name={getPlayerDisplayName(p.player)} src={getPlayerAvatar(p.player)} size="xs" team={p.team} />
                      <span
                        className={["truncate font-sans text-xs font-semibold sm:text-sm", isMaroon ? "text-maroon-700" : "text-ink-900"].join(" ")}
                      >
                        {getPlayerDisplayName(p.player)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ScoreBadge value={p.toPar} size="sm" chip />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {lastRound ? <ScoreBadge value={lastRound.toPar} size="sm" /> : <span className="text-ink-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center font-sans text-xs font-semibold text-ink-500">{thruLabel(lastRound)}</td>
                  {priorRounds.map((roundNum) => {
                    const round = priorForPlayer.find((r) => r.round === roundNum);
                    return (
                      <td key={roundNum} className="px-3 py-2 text-center">
                        {round ? <ScoreBadge value={round.toPar} size="sm" /> : <span className="text-ink-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 font-sans text-xs text-ink-400">
        Tap a player to open their scorecard for the current or most recent round — earlier rounds are one tap away from there too.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/IndividualLeaderboardTable.tsx
git commit -m "feat: add IndividualLeaderboardTable (frozen POS/PLAYER, scrollable round history)"
```

(Not wired into any page yet — Task 7/8 do that.)

---

## Task 7: `LeaderboardBoard` (Team/Individual toggle)

**Files:**
- Create: `components/leaderboard/LeaderboardBoard.tsx`

**Interfaces:**
- Consumes: `TeamMatchesBoard` (Task 5), `IndividualLeaderboardTable` (Task 6).
- Produces: `LeaderboardBoard({ tournament, live }: { tournament: Tournament; live: boolean })`. Task 8 renders this (below `PointsRibbon`, below `YearTabs` where applicable) in both `YearLeaderboardContent.tsx` and `LiveLeaderboardContent.tsx`.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import { TeamMatchesBoard } from "./TeamMatchesBoard";
import { IndividualLeaderboardTable } from "./IndividualLeaderboardTable";
import type { Tournament } from "@/lib/data/types";

type View = "team" | "individual";

const VIEWS: { id: View; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "individual", label: "Individual" },
];

export function LeaderboardBoard({ tournament, live }: { tournament: Tournament; live: boolean }) {
  const [view, setView] = useState<View>("team");

  return (
    <div>
      <div className="mb-4 inline-flex gap-[2px] rounded-md border border-ink-100 bg-cream-100 p-1 sm:mb-6">
        {VIEWS.map(({ id, label }) => {
          const on = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={[
                "inline-flex items-center rounded-sm px-4 py-1.5 font-condensed text-xs font-semibold uppercase tracking-wide transition-colors duration-200 sm:px-6 sm:py-2 sm:text-sm",
                on ? "bg-maroon-700 text-cream-50" : "bg-transparent text-ink-500 hover:text-maroon-700",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      {view === "team" ? <TeamMatchesBoard tournament={tournament} live={live} /> : <IndividualLeaderboardTable tournament={tournament} />}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/LeaderboardBoard.tsx
git commit -m "feat: add LeaderboardBoard Team/Individual toggle"
```

---

## Task 8: Wire it all in, delete `MatchPlayShowcase.tsx`, clean up dead CSS

**Files:**
- Modify: `components/leaderboard/YearLeaderboardContent.tsx`
- Modify: `components/leaderboard/LiveLeaderboardContent.tsx`
- Delete: `components/leaderboard/MatchPlayShowcase.tsx`
- Modify: `app/globals.css` (remove now-unused shimmer/gold-num/team-fill CSS)

**Interfaces:**
- Consumes: `PointsRibbon` (Task 4), `LeaderboardBoard` (Task 7).
- Produces: nothing new — this is the integration point where `/leaderboard/[slug]` and the live `/leaderboard` route actually render the new components.

- [ ] **Step 1: Rewrite `YearLeaderboardContent.tsx`**

```tsx
"use client";

import { PointsRibbon } from "@/components/leaderboard/PointsRibbon";
import { LeaderboardBoard } from "@/components/leaderboard/LeaderboardBoard";
import { YearTabs } from "@/components/YearTabs";
import type { Tournament } from "@/lib/data/types";

export function YearLeaderboardContent({ tournament, activeSlug }: { tournament: Tournament; activeSlug: string }) {
  return (
    <div>
      <PointsRibbon tournament={tournament} />

      <div className="pt-4 sm:pt-8">
        <YearTabs basePath="/leaderboard" activeSlug={activeSlug} />
        <LeaderboardBoard tournament={tournament} live={false} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `LiveLeaderboardContent.tsx`**

```tsx
"use client";

import { Badge } from "@/components/ui/Badge";
import { PointsRibbon } from "./PointsRibbon";
import { LeaderboardBoard } from "./LeaderboardBoard";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export function LiveLeaderboardContent() {
  const { tournament, payload, error, loading } = useLiveTournament();

  return (
    <div>
      <PointsRibbon tournament={tournament} />

      <div className="pt-8">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Badge live>Live</Badge>
          {payload?.updatedAt && <span className="font-sans text-[11px] text-ink-400">Updated {timeAgo(payload.updatedAt)}</span>}
          {error && <span className="font-sans text-[11px] text-score-under">{error}</span>}
        </div>

        {loading && !payload ? (
          <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>
        ) : (
          <LeaderboardBoard tournament={tournament} live={true} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete the old showcase component**

```bash
git rm components/leaderboard/MatchPlayShowcase.tsx
```

- [ ] **Step 4: Remove the now-unused shimmer/gold-num/team-fill CSS from `app/globals.css`**

In `app/globals.css`:

1. Delete the two keyframe blocks (originally lines 174–190):
```css
@keyframes mm-shimmer-left {
  0% {
    transform: translateX(-120%) skewX(-12deg);
  }
  100% {
    transform: translateX(220%) skewX(-12deg);
  }
}

@keyframes mm-shimmer-right {
  0% {
    transform: translateX(220%) skewX(-12deg);
  }
  100% {
    transform: translateX(-120%) skewX(-12deg);
  }
}
```
(Leave `@keyframes mm-edge-glow` alone — it's used by `.mm-edge-glow`, which `components/ui/WinnerBadge.tsx` and `components/ui/Badge.tsx` still use.)

2. Delete the `.mm-shimmer-left` and `.mm-shimmer-right` class rules (originally lines 204–220).

3. Delete `.mm-gold-num`, `.mm-gold-num-white`, and their two `@media` font-size overrides (originally lines 231–261).

4. Delete `.mm-team-fill-maroon` and `.mm-team-fill-white` (originally lines 263–273).

5. In the `@media (prefers-reduced-motion: reduce)` block near the bottom, remove the now-dead `.mm-shimmer-left,` and `.mm-shimmer-right,` lines, keeping `.mm-live-dot`, `.mm-fade`, `.mm-edge-glow`, `.mm-winner-pulse`:
```css
@media (prefers-reduced-motion: reduce) {
  .mm-live-dot,
  .mm-fade,
  .mm-edge-glow,
  .mm-winner-pulse {
    animation: none;
  }
}
```

Leave `.mm-champion-name` and everything else in the file untouched.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors (confirms nothing else imported `MatchPlayShowcase`).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev` and check, at `http://localhost:3001`:
- `/leaderboard/2026-palm-springs` — ticker renders restyled (flat two-tone blocks, no shimmer), Team/Individual toggle appears below the year tabs, Team tab defaults to R4 (the last day played) showing Morning/Afternoon session groups with head-to-head match rows and recap strips, Individual tab shows the frozen POS/PLAYER + scrollable TOT/TODAY/THRU/R1-R3 table, tapping a player row navigates to their scorecard page.
- `/leaderboard/2024-pinehurst` and `/leaderboard/2025-danzante` — same structure renders without errors for those years' data.
- `/leaderboard` (redirects to the live 2027 route) — ticker + toggle render against empty/live data without crashing (Team tab shows the "Round 1 hasn't started" placeholder since there are no matches yet; Individual tab shows the "No individual scores" empty state).
- `/history` — still renders correctly (uses the untouched `LeaderboardTable`).
- `/` (home page) — the leaderboard strip section still renders correctly (uses the untouched `LeaderboardStrip`).
- No hydration errors or console errors on any of the above (check the browser console and the terminal running `next dev`).

- [ ] **Step 7: Commit**

```bash
git add components/leaderboard/YearLeaderboardContent.tsx components/leaderboard/LiveLeaderboardContent.tsx app/globals.css
git commit -m "feat: wire the new Team/Individual leaderboard board into both leaderboard pages"
```

(The `git rm` from Step 3 stages the deletion; include it in this commit if it isn't already staged from a separate commit — `git status` first to confirm.)

---

## Task 9: Default the player scorecard page to the most recent round

**Files:**
- Modify: `components/scorecard/PlayerScorecardView.tsx`

**Interfaces:**
- Consumes: `PlayerScorecard` type (unchanged).
- Produces: same `PlayerScorecardView({ scorecard, tournamentSlug })` signature — only the initial `round` state changes.

- [ ] **Step 1: Change the default round**

In `components/scorecard/PlayerScorecardView.tsx`, change:

```tsx
const [round, setRound] = useState(String(scorecard.rounds[0].round));
```

to:

```tsx
const [round, setRound] = useState(String(scorecard.rounds[scorecard.rounds.length - 1].round));
```

No other change in the file — the existing `<select>` dropdown already lists every round and lets the viewer pick an earlier one.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

In the running dev server, from `/leaderboard/2026-palm-springs`, switch to the Individual tab and tap any player's name. Confirm the scorecard page opens showing **Round 4** (the last round) by default, not Round 1, and that the round dropdown still lets you switch back to Round 1–3.

- [ ] **Step 4: Commit**

```bash
git add components/scorecard/PlayerScorecardView.tsx
git commit -m "fix: default the player scorecard view to the most recent round"
```

---

## Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds, no type errors, no missing-import errors (this also confirms `MatchPlayShowcase.tsx`'s deletion didn't leave a dangling import anywhere, since `next build` type-checks the whole project).

- [ ] **Step 4: Full click-through on the dev server**

Run `npm run dev` and, at mobile width (use browser dev tools' device toolbar, ~390px wide):
- Visit `/leaderboard/2026-palm-springs`, `/leaderboard/2025-danzante`, `/leaderboard/2024-pinehurst`, and `/leaderboard` (live) — toggle Team/Individual on each, and for Team, click through every round pill and confirm session groups + recap strips render correctly.
- On the Individual tab, scroll the table horizontally and confirm POS/PLAYER stay pinned while TOT/TODAY/THRU/R1... scroll.
- Tap a player row, confirm it lands on their most recent round, confirm the round dropdown still works, confirm the "back to leaderboard" link still works.
- Visit `/`, `/history`, `/teams`, `/schedule` and confirm nothing else regressed (these use components untouched by this plan, but the bottom mobile tab bar and header nav are shared, so a broken import anywhere would show up as a build/runtime error on every page).

- [ ] **Step 5: Report results**

If every check above passes, the feature is done. If any step fails, fix the specific issue in the relevant task's file and re-run that task's checks before continuing.
