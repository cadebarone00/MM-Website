# Navigation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Header.tsx`'s hamburger menu with a persistent 4-item nav (Home / Leaderboard / Teams / More) — a fixed bottom tab bar on mobile, the existing top position on desktop — where "More" opens a panel (full-screen on mobile, a 25%-width right-side drawer on desktop) containing Schedule and History.

**Architecture:** One new shared `MorePanel` component (a single component whose Tailwind classes change shape by breakpoint — full-screen overlay on mobile, right-edge drawer on desktop — rather than two separate components, since they're mutually exclusive by viewport anyway) plus a new `MobileTabBar` for the mobile-only fixed bottom bar. `Header.tsx` is restructured to own the shared "More open" state and drop everything hamburger-related.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS 4, lucide-react icons.

## Global Constraints

- Use existing Tailwind design tokens, never raw hex: `maroon-700`/`maroon-900` for backgrounds, `gold-400` for accents, matching `Header.tsx`'s existing `bg-gradient-maroon`/`bg-maroon-900` usage.
- The existing `lg:` breakpoint is this app's mobile/desktop split everywhere already (`Header.tsx`'s hamburger is `lg:hidden`, desktop nav is `hidden lg:flex`) — every new mobile/desktop conditional in this plan uses the same `lg:` breakpoint, not a different one.
- The ticker bar beneath the nav row (`Header.tsx`'s ": defending champions / live status" strip) and the ` <RoundCountdown>`/`<AccountBadge>`/Instagram-link cluster are unrelated to this plan and stay exactly as they are.
- No frontend test runner exists in this repo. Each task's verification step is `npx tsc --noEmit` plus `npm run lint`; the final task is a manual browser walkthrough.
- All file paths are relative to `C:\Users\Owner\Documents\GitHub\MM-Website`.

---

### Task 1: `MorePanel` component

**Files:**
- Create: `components/nav/MorePanel.tsx`

**Interfaces:**
- Produces: `MorePanel({ open: boolean, onClose: () => void })` — full-screen overlay on mobile, 25%-width right-edge drawer on desktop, containing Schedule and History links. Consumed by Tasks 2 and 3 (via `Header.tsx`, which owns the shared `open` state).

- [ ] **Step 1: Create the component**

`components/nav/MorePanel.tsx`:
```tsx
"use client";

import Link from "next/link";
import { X } from "lucide-react";

const MORE_LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/history", label: "History" },
];

/**
 * Full-screen on mobile, a 25%-width right-edge drawer on desktop — one
 * component, not two, since only one shape is ever visible at a time
 * (the `lg:` breakpoint that switches shape is the same one that switches
 * the nav itself between bottom bar and top bar).
 */
export function MorePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex flex-col bg-white shadow-xl lg:inset-y-0 lg:left-auto lg:right-0 lg:w-1/4">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <span className="font-sans text-lg font-bold text-ink-900">More</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-cream-50"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex flex-col">
          {MORE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="border-b border-ink-100 px-5 py-4 font-sans text-base font-semibold text-ink-900 hover:bg-cream-50"
            >
              {link.label}
            </Link>
          ))}
        </nav>
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
git add components/nav/MorePanel.tsx
git commit -m "feat: add MorePanel (full-screen mobile / right-drawer desktop)"
```

---

### Task 2: `MobileTabBar` component

**Files:**
- Create: `components/nav/MobileTabBar.tsx`

**Interfaces:**
- Consumes: nothing external besides `next/navigation`'s `usePathname`.
- Produces: `MobileTabBar({ onMoreClick: () => void })` — fixed bottom tab bar, mobile-only (`lg:hidden`), 4 tabs: Home, Leaderboard, Teams (links), More (button, calls `onMoreClick`). Consumed by Task 4.

- [ ] **Step 1: Create the component**

`components/nav/MobileTabBar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ListOrdered, Users, MoreHorizontal } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/leaderboard", label: "Leaderboard", icon: ListOrdered },
  { href: "/teams", label: "Teams", icon: Users },
];

export function MobileTabBar({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-[100] flex h-16 items-stretch bg-maroon-900 shadow-[0_-2px_8px_rgba(0,0,0,0.25)]">
      {TABS.map((tab) => {
        const on = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={["flex flex-1 flex-col items-center justify-center gap-1 font-condensed text-3xs font-semibold uppercase tracking-wide", on ? "text-white" : "text-white/60"].join(" ")}
          >
            <Icon size={20} />
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        className="flex flex-1 flex-col items-center justify-center gap-1 font-condensed text-3xs font-semibold uppercase tracking-wide text-white/60"
      >
        <MoreHorizontal size={20} />
        More
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/nav/MobileTabBar.tsx
git commit -m "feat: add MobileTabBar fixed bottom navigation"
```

---

### Task 3: Add bottom-bar clearance to the page body

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:** none — purely a spacing fix so the new fixed mobile bottom bar (Task 2, 64px tall) doesn't cover page content or the footer.

- [ ] **Step 1: Add bottom padding on mobile only**

In `app/layout.tsx`, change the `<body>` element's className from:
```tsx
<body className="min-h-screen bg-cream-50 font-sans text-ink-900 antialiased">
```
to:
```tsx
<body className="min-h-screen bg-cream-50 font-sans text-ink-900 antialiased pb-16 lg:pb-0">
```
(only this one line changes — everything else in the file stays the same).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "fix: reserve space for the fixed mobile bottom nav bar"
```

---

### Task 4: Restructure `Header.tsx`

**Files:**
- Modify: `components/Header.tsx` (full file)

**Interfaces:**
- Consumes: `MorePanel` (Task 1), `MobileTabBar` (Task 2).

Removes the hamburger button, the mobile dropdown panel, and the 5-item `nav` array — replaced by a 4-item desktop nav (Home/Leaderboard/Teams as links, More as a button) and the mobile `MobileTabBar`. The ticker bar, logo, `RoundCountdown`, Instagram link, and `AccountBadge` are untouched.

- [ ] **Step 1: Replace the file**

`components/Header.tsx`:
```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { RoundCountdown } from "@/components/ui/RoundCountdown";
import { AccountBadge } from "@/components/AccountBadge";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { MorePanel } from "@/components/nav/MorePanel";
import { latestCompleted, nextTournament, champion, isLiveNow, fmtPt } from "@/lib/data";

const nav = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/teams", label: "Teams" },
];

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={18} height={18} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function isSet(value: string): boolean {
  return value.trim().length > 0 && value.trim().toLowerCase() !== "tbd";
}

export function Header() {
  const pathname = usePathname();
  const live = isLiveNow();
  const champ = champion(latestCompleted);
  const nextVenueKnown = isSet(nextTournament.venue);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[100] shadow-lg relative">
      <div className="h-px bg-white/15" />

      <div className="bg-gradient-maroon">
        <div className="flex items-center justify-between px-4 h-14 sm:px-7 sm:h-[64px]">
          <div className="flex items-center gap-3 sm:gap-9">
            <Link href="/" className="shrink-0">
              <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-5 w-auto sm:h-7" priority />
            </Link>
            {/* Desktop nav — hidden below lg (covers phones in both orientations) */}
            <nav className="hidden lg:flex gap-0">
              {nav.map((n) => {
                const on = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={[
                      "px-4 h-[64px] flex items-center font-sans text-[15px] whitespace-nowrap border-b-2 transition-colors duration-150",
                      on ? "font-bold text-white border-b-gold-400" : "font-medium text-white/65 border-b-transparent hover:text-white/90",
                    ].join(" ")}
                  >
                    {n.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="px-4 h-[64px] flex items-center font-sans text-[15px] whitespace-nowrap border-b-2 border-b-transparent font-medium text-white/65 transition-colors duration-150 hover:text-white/90"
              >
                More
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <RoundCountdown className="text-gold-100" />
            <a
              href="https://www.instagram.com/themaroonmasters/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="The Maroon Masters Instagram"
              title="The Maroon Masters Instagram"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 sm:h-9 sm:w-9"
            >
              <InstagramGlyph />
            </a>
            <AccountBadge position="header" />
            <Image src="/assets/emblem.svg" alt="" width={240} height={240} className="hidden lg:block h-9 w-auto" />
          </div>
        </div>
      </div>

      <div className="bg-maroon-900 flex items-center justify-center gap-x-2 gap-y-0 px-4 py-[3px] flex-wrap shadow-[inset_0_1px_0_rgba(0,0,0,0.25)] sm:gap-[18px] sm:px-7 sm:py-[7px]">
        {live ? (
          <span className="font-condensed text-[8px] font-semibold tracking-eyebrow uppercase text-gold-300 text-center sm:text-[10px]">
            {nextTournament.editionLabel} &middot; {nextTournament.venue} &middot; Underway now
          </span>
        ) : (
          <>
            <span className="font-condensed text-[8px] font-semibold tracking-eyebrow uppercase text-gold-300 text-center sm:text-[10px]">
              Defending Champions: Team {champ === "maroon" ? "Maroon" : "White"} &middot; {latestCompleted.year}
            </span>
            <span className="hidden sm:block w-px h-[14px] bg-white/15" />
            <span className="font-sans text-[9px] text-white/55 text-center sm:text-[11px]">
              {fmtPt(latestCompleted.maroonPts)}&ndash;{fmtPt(latestCompleted.whitePts)} at {latestCompleted.venue} &middot; Next up{" "}
              {nextVenueKnown ? `${nextTournament.venue} - ${nextTournament.dateLabel}` : nextTournament.dateLabel}
            </span>
          </>
        )}
      </div>

      <div className="h-[2px] bg-gold-500" />

      <MobileTabBar onMoreClick={() => setMoreOpen(true)} />
      <MorePanel open={moreOpen} onClose={() => setMoreOpen(false)} />
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (`Menu`/`X` from the old hamburger are gone; confirm no unused-import warnings for them).

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx
git commit -m "feat: replace the hamburger menu with a bottom tab bar (mobile) and simplified top nav + More drawer (desktop)"
```

---

### Task 5: Full manual walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (port 3001).

- [ ] **Step 2: Production build sanity check**

Run: `npm run build`. Expected: succeeds with no type/lint errors.

- [ ] **Step 3: Walk it on mobile viewport (devtools responsive mode, < lg breakpoint)**

- Confirm the hamburger button and its old dropdown are gone.
- Confirm a fixed maroon bar with white Home/Leaderboard/Teams/More icons+labels sits at the bottom of every page, and page content (including the footer) isn't hidden behind it.
- Tap each of Home/Leaderboard/Teams and confirm navigation + the active-tab highlight updates.
- Tap More: confirm a full-screen sheet opens with Schedule and History; confirm both links navigate and close the sheet; confirm the X button and tapping the dark backdrop both close it without navigating.

- [ ] **Step 4: Walk it on desktop viewport (≥ lg breakpoint)**

- Confirm the top nav now shows only Home / Leaderboard / Teams / More (no Schedule/History as direct top-level links).
- Confirm the bottom tab bar is not present at this width.
- Click More: confirm a panel slides in from the right edge at roughly 25% of the viewport width, full height, containing Schedule and History; confirm it closes via its X button and via clicking the backdrop.
- Confirm the ticker bar (defending champions / live status), `RoundCountdown`, Instagram link, and `AccountBadge` all still render and work exactly as before.

- [ ] **Step 5: Final commit (only if Step 3/4 turned up fixes)**

If the walkthrough required any fixes, stage and commit them individually. If nothing needed fixing, this task ends at Step 4 with no commit.
