# Mobile Home & Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the mobile (`<lg`) home screen, header, and navigation to read like a native sports-app shell — flush top/bottom bars, a horizontally scrollable leaderboard strip under the hero, a single-panel Highlights/Teams/Schedule toggle, and a personal Account menu — while leaving the desktop (`lg:` and up) layout untouched except where explicitly noted.

**Architecture:** Every change is additive/conditional along the existing `lg:` breakpoint the codebase already uses everywhere (mobile vs desktop = `lg:hidden` / `hidden lg:*`, exactly like `MobileTabBar`/desktop nav today). No new state management, no new data sources — every new mobile element reuses an existing data hook (`useLiveTournament`, `useAccountSession`) or existing component (`LeaderboardStrip`, `TeamMatchesBoard`, `QuickScheduleCard`, `Tabs`) rather than inventing new data plumbing. Two new small components (`AccountMenu`, `HomeTeamsPanel`) plus seven placeholder route pages sharing one new `ComingSoonPage` component.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, lucide-react icons.

## Global Constraints

- Use existing Tailwind design tokens, never raw hex: `maroon-700`/`maroon-900` for maroon surfaces, `gold-300`/`gold-400`/`gold-500` for accents, `cream-50`/`cream-100` for light surfaces, `ink-900`/`ink-500`/`ink-400`/`ink-200`/`ink-100` for text/borders — matching every existing component read during planning (`Header.tsx`, `HomeDashboard.tsx`, `QuickTeamsCard.tsx`, etc.).
- The existing `lg:` breakpoint is this app's mobile/desktop split everywhere already — every new mobile/desktop conditional in this plan uses the same `lg:` breakpoint, not a different one.
- No frontend test runner exists in this repo. Each task's verification step is `npx tsc --noEmit` plus `npm run lint`; the final task is a manual browser walkthrough against the running dev server (`npm run dev`, port 3001).
- This plan is frontend/layout only — no new backend, no real authentication. Sign Up/Login render as visually complete but `disabled` buttons; Log Out is fully wired since the underlying session/sign-out mechanism (`useAccountSession`, `signOutAccount`) already exists in this repo. Wiring Sign Up/Login to real accounts is a separate future plan.
- All file paths are relative to `C:\Users\Owner\Documents\GitHub\MM-Website`.
- Spec: `docs/superpowers/specs/2026-08-04-mobile-home-nav-redesign-design.md`.

---

### Task 1: `ComingSoonPage` + seven placeholder routes

**Files:**
- Create: `components/ui/ComingSoonPage.tsx`
- Create: `app/my-team/page.tsx`
- Create: `app/fantasy/page.tsx`
- Create: `app/vault/page.tsx`
- Create: `app/merchandise/page.tsx`
- Create: `app/settings/page.tsx`
- Create: `app/sponsorship/page.tsx`
- Create: `app/players/page.tsx`

**Interfaces:**
- Produces: `ComingSoonPage({ title: string })` — centered heading + "Coming soon." copy. Consumed by all seven page files below, and by Task 5's `AccountMenu` links (`/my-team`, `/fantasy`, `/vault`, `/merchandise`, `/settings`, `/sponsorship`, `/players`).

- [ ] **Step 1: Create the shared component**

`components/ui/ComingSoonPage.tsx`:
```tsx
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-7 sm:py-24">
      <h1 className="m-0 font-serif text-3xl font-bold text-ink-900 sm:text-4xl">{title}</h1>
      <p className="mt-4 font-sans text-base text-ink-500">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 2: Create the seven page files**

`app/my-team/page.tsx`:
```tsx
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";

export default function MyTeamPage() {
  return <ComingSoonPage title="My Team" />;
}
```

`app/fantasy/page.tsx`:
```tsx
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";

export default function FantasyPage() {
  return <ComingSoonPage title="Fantasy" />;
}
```

`app/vault/page.tsx`:
```tsx
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";

export default function VaultPage() {
  return <ComingSoonPage title="The MM Vault" />;
}
```

`app/merchandise/page.tsx`:
```tsx
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";

export default function MerchandisePage() {
  return <ComingSoonPage title="Merchandise" />;
}
```

`app/settings/page.tsx`:
```tsx
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";

export default function SettingsPage() {
  return <ComingSoonPage title="Settings" />;
}
```

`app/sponsorship/page.tsx`:
```tsx
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";

export default function SponsorshipPage() {
  return <ComingSoonPage title="Sponsorship Opportunities" />;
}
```

`app/players/page.tsx`:
```tsx
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";

export default function PlayersPage() {
  return <ComingSoonPage title="Learn More About the Players" />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/ui/ComingSoonPage.tsx app/my-team app/fantasy app/vault app/merchandise app/settings app/sponsorship app/players
git commit -m "feat: add ComingSoonPage and seven placeholder account-menu routes"
```

---

### Task 2: Shrink and top-align `MobileTabBar` content

**Files:**
- Modify: `components/nav/MobileTabBar.tsx` (full file)

**Interfaces:** none — no prop/signature changes, purely visual.

- [ ] **Step 1: Replace the file**

`components/nav/MobileTabBar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ListOrdered, Users, MoreHorizontal } from "lucide-react";
import { MORE_LINKS } from "./MorePanel";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/leaderboard", label: "Leaderboard", icon: ListOrdered },
  { href: "/teams", label: "Teams", icon: Users },
];

export function MobileTabBar({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();
  const moreOn = MORE_LINKS.some((l) => pathname.startsWith(l.href));

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-[100] flex h-16 items-stretch bg-maroon-900 shadow-[0_-2px_8px_rgba(0,0,0,0.25)] pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const on = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={["flex flex-1 flex-col items-center justify-start gap-1 pt-2.5 font-condensed text-3xs font-semibold uppercase tracking-wide", on ? "text-white" : "text-white/60"].join(" ")}
          >
            <Icon size={18} />
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        className={["flex flex-1 flex-col items-center justify-start gap-1 pt-2.5 font-condensed text-3xs font-semibold uppercase tracking-wide", moreOn ? "text-white" : "text-white/60"].join(" ")}
      >
        <MoreHorizontal size={18} />
        More
      </button>
    </nav>
  );
}
```

(The only changes from today's file: `items-center justify-center` → `items-center justify-start pt-2.5` on each tab, and icon `size={20}` → `size={18}`. The bar itself keeps `fixed inset-x-0 bottom-0`, `h-16`, and `pb-[env(safe-area-inset-bottom)]` — still flush to the bottom edge, just with its content top-aligned and slightly smaller so it doesn't hug the very bottom.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/nav/MobileTabBar.tsx
git commit -m "style: top-align and shrink MobileTabBar content, keep bar flush to bottom"
```

---

### Task 3: Conditional "Portal" link in `MorePanel`

**Files:**
- Modify: `components/nav/MorePanel.tsx` (full file)

**Interfaces:**
- Consumes: `useAccountSession` from `@/lib/useAccountSession` (existing).
- Produces: unchanged public signature `MorePanel({ open, onClose })`; `MORE_LINKS` export unchanged (still just Schedule/History — this is what `MobileTabBar.tsx` and `Header.tsx` use for the "More" tab's active-state highlight, so it must keep meaning "the always-present items," not include the conditional Portal link).

- [ ] **Step 1: Replace the file**

`components/nav/MorePanel.tsx`:
```tsx
"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useAccountSession } from "@/lib/useAccountSession";

export const MORE_LINKS = [
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
  const session = useAccountSession();
  if (!open) return null;

  const links = session?.kind === "player" ? [...MORE_LINKS, { href: "/portal", label: "Portal" }] : MORE_LINKS;

  return (
    // z-[110] only orders this above MobileTabBar within <header>'s own stacking context (header itself is z-[100]) — not a page-wide guarantee.
    <div className="fixed inset-0 z-[110]">
      {/* Hidden below lg on purpose: the panel is full-screen there, so there's no visible backdrop to click — closing on mobile is via the X button only. */}
      <div className="hidden lg:block absolute inset-0 bg-black/50" onClick={onClose} />
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
          {links.map((link) => (
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
git commit -m "feat: show a Portal link in the More menu for signed-in players"
```

---

### Task 4: `AccountMenu` component

**Files:**
- Create: `components/nav/AccountMenu.tsx`

**Interfaces:**
- Consumes: `useAccountSession`, `signOutAccount`, `AccountSession` (type) from `@/lib/useAccountSession`; `getPlayerDisplayName` from `@/lib/data/players` (all existing).
- Produces: `AccountMenu({ open: boolean, onClose: () => void })` — full-screen, mobile-only (`lg:hidden`) overlay. Consumed by Task 5 (`Header.tsx`).

- [ ] **Step 1: Create the component**

`components/nav/AccountMenu.tsx`:
```tsx
"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useAccountSession, signOutAccount } from "@/lib/useAccountSession";
import type { AccountSession } from "@/lib/useAccountSession";
import { getPlayerDisplayName } from "@/lib/data/players";

const PERSONAL_LINKS = [
  { href: "/my-team", label: "My Team" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/vault", label: "The MM Vault" },
  { href: "/merchandise", label: "Merchandise" },
  { href: "/settings", label: "Settings" },
];

const INFO_LINKS = [
  { href: "/sponsorship", label: "Sponsorship Opportunities" },
  { href: "/players", label: "Learn More About the Players" },
];

function welcomeLabel(session: AccountSession): string {
  if (!session) return "Welcome";
  const firstName = session.kind === "host" ? session.username : getPlayerDisplayName(session.playerFirst).split(" ")[0];
  return `Welcome, ${firstName}`;
}

/** Personal-to-the-account-holder menu, opened from the header's account icon. Separate from MorePanel (site-wide pages) — this holds only things tied to the signed-in account. */
export function AccountMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useAccountSession();
  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[110] flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
        <span className="font-sans text-lg font-bold text-ink-900">{welcomeLabel(session)}</span>
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-cream-50"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        {PERSONAL_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className="border-b border-ink-100 px-5 py-4 font-sans text-base font-semibold text-ink-900 hover:bg-cream-50"
          >
            {link.label}
          </Link>
        ))}
        <div className="h-2 bg-cream-50" />
        {INFO_LINKS.map((link) => (
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

      <div className="border-t border-ink-100 p-5">
        {session ? (
          <button
            type="button"
            onClick={() => {
              signOutAccount(session);
              onClose();
            }}
            className="w-full rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50"
          >
            Log Out
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex-1 rounded-sm border border-ink-300 px-5 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-400"
            >
              Sign Up
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex-1 rounded-sm border border-ink-300 px-5 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-400"
            >
              Login
            </button>
          </div>
        )}
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
git add components/nav/AccountMenu.tsx
git commit -m "feat: add AccountMenu (full-screen personal menu, mobile only)"
```

---

### Task 5: Restructure `Header.tsx` for the mobile top row

**Files:**
- Modify: `components/Header.tsx` (full file)

**Interfaces:**
- Consumes: `AccountMenu` (Task 4), `useAccountSession` from `@/lib/useAccountSession`, `Avatar` from `@/components/ui/Avatar`, `TigerAvatar` from `@/components/ui/TigerAvatar`, `getPlayerAvatar`/`getPlayerDisplayName` from `@/lib/data/players`, `UserRound` from `lucide-react` (all existing except `AccountMenu`).
- Produces: unchanged — `Header()` still takes no props.

Splits the single shared top row into two: a new mobile-only 3-zone row (Instagram+countdown/live left, wordmark center, account icon right), and the existing desktop row unchanged but now `hidden lg:flex`. The "Defending Champions"/live ticker bar becomes `hidden lg:flex` (desktop only). `MobileTabBar`, `MorePanel`, and the new `AccountMenu` are all rendered at the bottom of the header, same as today's pattern.

- [ ] **Step 1: Replace the file**

`components/Header.tsx`:
```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import { RoundCountdown } from "@/components/ui/RoundCountdown";
import { Avatar } from "@/components/ui/Avatar";
import { TigerAvatar } from "@/components/ui/TigerAvatar";
import { AccountBadge } from "@/components/AccountBadge";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { MorePanel, MORE_LINKS } from "@/components/nav/MorePanel";
import { AccountMenu } from "@/components/nav/AccountMenu";
import { useAccountSession } from "@/lib/useAccountSession";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
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
  const session = useAccountSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const moreOn = MORE_LINKS.some((l) => pathname.startsWith(l.href));

  // Close both panels on route change (e.g. Back/Forward navigation).
  // Adjusted during render rather than in a useEffect, since Header never
  // unmounts across navigations (it lives outside {children} in the root
  // layout) — this is React's recommended pattern for resetting state when
  // a value changes, and avoids a synchronous setState-in-effect.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMoreOpen(false);
    setAccountMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-[100] shadow-lg relative">
      <div className="h-px bg-white/15" />

      <div className="bg-gradient-maroon">
        {/* Mobile header row — flush to top, 3 zones: Instagram + countdown/live (left), wordmark (center, bottom-aligned), account icon (right, always visible). */}
        <div className="lg:hidden grid grid-cols-3 items-end gap-2 px-4 pb-2 pt-2">
          <div className="flex min-w-0 items-center gap-2 justify-self-start">
            <a
              href="https://www.instagram.com/themaroonmasters/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="The Maroon Masters Instagram"
              title="The Maroon Masters Instagram"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white"
            >
              <InstagramGlyph />
            </a>
            {live ? (
              <span className="font-condensed text-[10px] font-semibold uppercase tracking-wide text-gold-300">Live Now</span>
            ) : (
              <RoundCountdown className="text-gold-100" />
            )}
          </div>

          <Link href="/" className="justify-self-center">
            <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-5 w-auto" priority />
          </Link>

          <button
            type="button"
            onClick={() => setAccountMenuOpen(true)}
            aria-label="Your account"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center justify-self-end rounded-full"
          >
            {session?.kind === "host" ? (
              <TigerAvatar size="xs" />
            ) : session?.kind === "player" ? (
              <Avatar name={getPlayerDisplayName(session.playerFirst)} src={getPlayerAvatar(session.playerFirst)} size="xs" team={session.team} />
            ) : (
              <UserRound size={22} className="text-white" />
            )}
          </button>
        </div>

        {/* Desktop header row — unchanged from before this plan. */}
        <div className="hidden lg:flex items-center justify-between px-7 h-[64px]">
          <div className="flex items-center gap-9">
            <Link href="/" className="shrink-0">
              <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-7 w-auto" priority />
            </Link>
            <nav className="flex gap-0">
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
                className={[
                  "px-4 h-[64px] flex items-center font-sans text-[15px] whitespace-nowrap border-b-2 transition-colors duration-150",
                  moreOn ? "font-bold text-white border-b-gold-400" : "font-medium text-white/65 border-b-transparent hover:text-white/90",
                ].join(" ")}
              >
                More
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <RoundCountdown className="text-gold-100" />
            <a
              href="https://www.instagram.com/themaroonmasters/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="The Maroon Masters Instagram"
              title="The Maroon Masters Instagram"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <InstagramGlyph />
            </a>
            <AccountBadge position="header" />
            <Image src="/assets/emblem.svg" alt="" width={240} height={240} className="h-9 w-auto" />
          </div>
        </div>
      </div>

      <div className="hidden lg:flex items-center justify-center gap-[18px] px-7 py-[7px] flex-wrap shadow-[inset_0_1px_0_rgba(0,0,0,0.25)] bg-maroon-900">
        {live ? (
          <span className="font-condensed text-[10px] font-semibold tracking-eyebrow uppercase text-gold-300 text-center">
            {nextTournament.editionLabel} &middot; {nextTournament.venue} &middot; Underway now
          </span>
        ) : (
          <>
            <span className="font-condensed text-[10px] font-semibold tracking-eyebrow uppercase text-gold-300 text-center">
              Defending Champions: Team {champ === "maroon" ? "Maroon" : "White"} &middot; {latestCompleted.year}
            </span>
            <span className="block w-px h-[14px] bg-white/15" />
            <span className="font-sans text-[11px] text-white/55 text-center">
              {fmtPt(latestCompleted.maroonPts)}&ndash;{fmtPt(latestCompleted.whitePts)} at {latestCompleted.venue} &middot; Next up{" "}
              {nextVenueKnown ? `${nextTournament.venue} - ${nextTournament.dateLabel}` : nextTournament.dateLabel}
            </span>
          </>
        )}
      </div>

      <div className="h-[2px] bg-gold-500" />

      <MobileTabBar onMoreClick={() => setMoreOpen(true)} />
      <MorePanel open={moreOpen} onClose={() => setMoreOpen(false)} />
      <AccountMenu open={accountMenuOpen} onClose={() => setAccountMenuOpen(false)} />
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx
git commit -m "feat: mobile-only 3-zone header row + account menu wiring, desktop unchanged"
```

---

### Task 6: Mobile hero image, desktop hero video unchanged

**Files:**
- Modify: `components/home/VideoHero.tsx` (full file)

**Interfaces:** none — `VideoHero()` still takes no props.

- [ ] **Step 1: Replace the file**

`components/home/VideoHero.tsx`:
```tsx
import Image from "next/image";
import { Radio } from "lucide-react";
import Link from "next/link";
import { latestCompleted, nextTournament, champion, isLiveNow, fmtPt } from "@/lib/data";

function isSet(value: string): boolean {
  return value.trim().length > 0 && value.trim().toLowerCase() !== "tbd";
}

export function VideoHero() {
  const live = isLiveNow();
  const champ = champion(latestCompleted);
  const nextVenueKnown = isSet(nextTournament.venue);

  return (
    <section className="relative w-full h-[280px] overflow-hidden bg-maroon-900 sm:h-[420px] lg:h-[640px]">
      {/* Mobile: static placeholder image instead of video. */}
      <div className="absolute inset-0 lg:hidden">
        <Image src="/teams/maroon/collage/02-swing-pose.jpg" alt="" fill sizes="100vw" className="scale-110 object-cover" priority />
      </div>
      {/* Desktop: video, unchanged from before this plan. */}
      <video className="absolute inset-0 hidden h-full w-full scale-110 object-cover lg:block" src="/videos/home-hero.mp4" autoPlay muted loop playsInline />
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(36,0,1,0.92)] via-[rgba(36,0,1,0.45)] to-[rgba(36,0,1,0.25)]" />

      <div className="relative z-10 h-full max-w-[1200px] mx-auto px-4 flex flex-col items-start justify-end pb-4 sm:px-7 sm:pb-10 lg:pb-16">
        <div className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-gold-300 mb-1 sm:text-[13px] sm:mb-4">
          {live ? `${nextTournament.editionLabel} · Underway` : `${latestCompleted.editionLabel} · Final`}
        </div>

        {live ? (
          <>
            <h1 className="font-serif text-xl font-bold leading-[1.1] tracking-tighter text-cream-50 mb-1 sm:text-4xl sm:mb-3 lg:text-[58px] lg:mb-[18px]">It&rsquo;s Underway.</h1>
            <p className="font-sans text-[11px] leading-snug text-maroon-100 mb-2 max-w-[280px] sm:text-base sm:leading-relaxed sm:mb-5 sm:max-w-[420px] lg:text-lg lg:mb-7 lg:max-w-[480px]">
              {nextTournament.editionLabel} is live at {nextTournament.venue}, {nextTournament.dateLabel}. Results will be posted here as the trip
              wraps up.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-xl font-bold leading-[1.1] tracking-tighter text-cream-50 mb-1 sm:text-4xl sm:mb-3 lg:text-[58px] lg:mb-[18px]">
              Team {champ === "maroon" ? "Maroon" : "White"} Defends the Cup.
            </h1>
            <p className="font-sans text-[11px] leading-snug text-maroon-100 mb-2 max-w-[280px] sm:text-base sm:leading-relaxed sm:mb-5 sm:max-w-[420px] lg:text-lg lg:mb-7 lg:max-w-[480px]">
              {latestCompleted.editionLabel} wrapped at {latestCompleted.venue} with Team {champ === "maroon" ? "Maroon" : "White"} winning{" "}
              {fmtPt(Math.max(latestCompleted.maroonPts, latestCompleted.whitePts))}–{fmtPt(Math.min(latestCompleted.maroonPts, latestCompleted.whitePts))}.
              Next up: {nextTournament.editionLabel}
              {nextVenueKnown ? ` at ${nextTournament.venue}` : ""}, {nextTournament.dateLabel}.
            </p>
          </>
        )}

        <div className="flex gap-1.5 sm:gap-3">
          {live && (
            <div className="inline-flex items-center gap-1 bg-transparent text-cream-50 border border-cream-50/70 rounded-sm px-3 py-2 font-condensed text-[10px] font-semibold tracking-wide uppercase sm:gap-2 sm:px-6 sm:py-3 sm:text-sm lg:px-8 lg:py-4 lg:text-md">
              <Radio width={12} height={12} className="shrink-0 sm:hidden" />
              <Radio width={18} height={18} className="hidden shrink-0 sm:block" />
              Live Now
            </div>
          )}
          <Link
            href="/leaderboard"
            className="inline-flex items-center bg-transparent text-cream-50 border border-cream-50/70 hover:bg-white/10 rounded-sm px-3 py-2 font-condensed text-[10px] font-semibold tracking-wide uppercase transition-colors sm:px-6 sm:py-3 sm:text-sm lg:px-8 lg:py-4 lg:text-md"
          >
            View Leaderboard
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center bg-transparent text-cream-50 border border-cream-50/70 hover:bg-white/10 rounded-sm px-3 py-2 font-condensed text-[10px] font-semibold tracking-wide uppercase transition-colors sm:px-6 sm:py-3 sm:text-sm lg:px-8 lg:py-4 lg:text-md"
          >
            History
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/home/VideoHero.tsx
git commit -m "feat: swap hero video for a static placeholder image on mobile only"
```

---

### Task 7: Always-visible mobile leaderboard strip, 2026 fallback

**Files:**
- Modify: `components/home/LiveLeaderboardStripSection.tsx` (full file)

**Interfaces:**
- Consumes: `LeaderboardStrip` (existing, unchanged), `latestCompleted`, `getNextTournamentStatus` from `@/lib/data` (existing).
- Produces: unchanged signature `LiveLeaderboardStripSection()` — still rendered from `app/page.tsx` with no props, no changes needed there.

- [ ] **Step 1: Replace the file**

`components/home/LiveLeaderboardStripSection.tsx`:
```tsx
"use client";

import { LeaderboardStrip } from "@/components/leaderboard/LeaderboardStrip";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { latestCompleted, getNextTournamentStatus } from "@/lib/data";

/**
 * Mobile: always visible under the hero — live 2027 data once the feed has
 * entries, otherwise falls back to the latest completed tournament (2026)
 * so the strip is never empty between tournaments.
 * Desktop: unchanged from before this plan — hidden entirely outside the
 * live tournament window.
 */
export function LiveLeaderboardStripSection() {
  const { tournament } = useLiveTournament();
  const isLive = tournament.individualLeaderboard.length > 0;
  const mobileSource = isLive ? tournament : latestCompleted;
  const desktopLive = getNextTournamentStatus() === "live";

  return (
    <>
      <div className="lg:hidden">
        {!isLive && (
          <div className="px-4 pt-3 sm:px-7">
            <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-ink-400">{latestCompleted.year} Final</span>
          </div>
        )}
        <LeaderboardStrip tournament={mobileSource} />
      </div>
      {desktopLive && (
        <div className="hidden lg:block">
          <LeaderboardStrip tournament={tournament} />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/home/LiveLeaderboardStripSection.tsx
git commit -m "feat: always show the mobile leaderboard strip, falling back to 2026"
```

---

### Task 8: `HomeTeamsPanel` component

**Files:**
- Create: `components/home/HomeTeamsPanel.tsx`

**Interfaces:**
- Consumes: `useLiveTournament` from `@/lib/hooks/useLiveTournament`; `latestCompleted`, `fmtPt`, `getNextTournamentStatus` from `@/lib/data`; `TeamMatchesBoard` from `@/components/leaderboard/TeamMatchesBoard` (all existing).
- Produces: `HomeTeamsPanel()` — no props, self-contained. Consumed by Task 9 (`HomeDashboard.tsx`'s mobile toggle).

- [ ] **Step 1: Create the component**

`components/home/HomeTeamsPanel.tsx`:
```tsx
"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { latestCompleted, fmtPt, getNextTournamentStatus } from "@/lib/data";
import { TeamMatchesBoard } from "@/components/leaderboard/TeamMatchesBoard";

/** Condensed Teams view for the mobile home toggle: score line + the same TeamMatchesBoard shown on the Teams tab of /leaderboard, just embedded in a smaller panel. */
export function HomeTeamsPanel() {
  const { tournament } = useLiveTournament();
  const hasLiveRoster = tournament.roster.maroon.length > 0 && tournament.roster.white.length > 0;
  const source = hasLiveRoster ? tournament : latestCompleted;
  const live = getNextTournamentStatus() === "live";

  return (
    <div className="rounded-lg border border-maroon-800 bg-maroon-900 p-3 text-white shadow-xl sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        {!hasLiveRoster && (
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-white/50">{latestCompleted.year}</span>
        )}
        <span className="ml-auto font-condensed text-2xl font-black tabular-nums text-white">
          {fmtPt(source.maroonPts)}&ndash;{fmtPt(source.whitePts)}
        </span>
      </div>
      <div className="rounded-md bg-white p-2 sm:p-3">
        <TeamMatchesBoard tournament={source} live={live} />
      </div>
    </div>
  );
}
```

(`TeamMatchesBoard` is designed for a light background, so it's nested in a white card inside the panel's dark maroon shell — matching the visual language of the Highlights tab's `HighlightsRail` container without fighting `TeamMatchesBoard`'s own light-mode styling.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/home/HomeTeamsPanel.tsx
git commit -m "feat: add HomeTeamsPanel (condensed team score + matches for mobile home)"
```

---

### Task 9: `HomeDashboard.tsx` — mobile toggle section + media redirect confirms

**Files:**
- Modify: `components/home/HomeDashboard.tsx` (full file)

**Interfaces:**
- Consumes: `Tabs`, `TabItem` from `@/components/ui/Tabs`; `HomeTeamsPanel` from `@/components/home/HomeTeamsPanel` (Task 8). Everything else (`HighlightsRail`, `QuickScheduleCard`, `NewsSection`, `SocialsSection`, the `highlights`/`news` data, etc.) is unchanged from today.
- Produces: unchanged — `HomeDashboard()` still takes no props.

Replaces the mobile rendering of the top block (today: a 2-column grid at every width) with a 3-way `Highlights`/`Teams`/`Schedule` toggle, full-width, defaulting to Highlights. The existing 2-column grid becomes desktop-only (`hidden lg:grid`). Adds a `window.confirm()` gate before navigating away on reel/video clicks in `SocialsSection`.

- [ ] **Step 1: Replace the file**

`components/home/HomeDashboard.tsx`:
```tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft, Play, Trophy, X } from "lucide-react";
import { SectionHead } from "@/components/home/SectionHead";
import { QuickLeaderboardCard } from "@/components/home/QuickLeaderboardCard";
import { QuickTeamsCard } from "@/components/home/QuickTeamsCard";
import { QuickScheduleCard } from "@/components/home/QuickScheduleCard";
import { HomeTeamsPanel } from "@/components/home/HomeTeamsPanel";
import { Tabs } from "@/components/ui/Tabs";
import type { TabItem } from "@/components/ui/Tabs";
import { latestCompleted, fmtPt } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";

const highlights = [
  {
    title: "2027 board is staged",
    body: "Live highlights will stack here as scores, streaks, and match swings are entered.",
  },
  {
    title: `Team White ${fmtPt(latestCompleted.whitePts)}, Team Maroon ${fmtPt(latestCompleted.maroonPts)}`,
    body: `${latestCompleted.editionLabel} is loaded as the current placeholder while the 2027 event waits for play.`,
  },
  {
    title: `${getPlayerDisplayName(latestCompleted.individualChampion ?? "cam")} owns the latest title`,
    body: "Individual leaderboard notes will rotate into this rail once tournament scoring begins.",
  },
  {
    title: "Round 1 starts at 9:30 CST",
    body: "January 6, 2027 is the live flip point for the tournament experience.",
  },
  {
    title: "Course walkthrough coming soon",
    body: "A hole-by-hole preview of Mission Hills CC is queued for this rail once it's ready.",
  },
  {
    title: "Rosters lock soon",
    body: "The final 6-and-6 rosters for 2027 will post here the moment the sheet is confirmed.",
  },
  {
    title: "Media day on the calendar",
    body: "Team photos and player intros are planned ahead of the opening tee time.",
  },
];

const news = [
  {
    title: "Opening presser sets 2027 tone",
    kicker: "Press Room",
    image: "/champions/2026.jpg",
    body: [
      "The Maroon Masters home base is being staged for the 2027 tournament with live scoring, rosters, matches, highlights, and media all moving into one cleaner view.",
      "Once the tournament begins, this space can carry presser notes, daily recaps, player quotes, and official updates without sending fans away from the home screen.",
      "The goal is simple: make the site feel alive before, during, and after every session.",
    ],
  },
  {
    title: "Rosters take center stage",
    kicker: "Teams",
    image: "/teams/maroon/collage/01-hero-team.jpg",
    body: [
      "The Teams page now has player-forward roster pages, profile photos, favoriting, and direct links into individual bios.",
      "Fans can follow Maroon and White as separate identities while still jumping quickly into standings and tournament history.",
    ],
  },
  {
    title: "Mission Hills schedule shell ready",
    kicker: "Schedule",
    image: "/champions/2025.jpg",
    body: [
      "The schedule module is ready to carry courses, formats, and sessions for 2027.",
      "As tee sheets are finalized, the quick schedule card can be updated with exact course assignments and match formats.",
    ],
  },
];

type SocialReel = {
  id: string;
  caption: string;
  thumbnailUrl: string;
  permalink: string;
  timestamp?: string;
};

const fallbackReels: SocialReel[] = [
  {
    id: "opening-week",
    caption: "Opening Week",
    thumbnailUrl: "/champions/2026.jpg",
    permalink: "https://www.instagram.com/themaroonmasters/",
  },
  {
    id: "practice-rounds",
    caption: "Practice Rounds",
    thumbnailUrl: "/teams/maroon/collage/02-swing-pose.jpg",
    permalink: "https://www.instagram.com/themaroonmasters/",
  },
];

type HypeVideoSlot = {
  id: string;
  caption: string;
  thumbnailUrl: string;
};

// TODO: swap these placeholders for real hype video thumbnails/links once uploaded.
const hypeVideoSlots: HypeVideoSlot[] = [
  { id: "hype-slot-1", caption: "Hype Video", thumbnailUrl: "/champions/2026.jpg" },
  { id: "hype-slot-2", caption: "Hype Video", thumbnailUrl: "/champions/2025.jpg" },
];

// TODO: point this at the real "all videos" destination once it exists.
const ALL_VIDEOS_HREF = "#";

const HIGHLIGHTS_PREVIEW_COUNT = 6;

function HighlightsRail() {
  const [showAll, setShowAll] = useState(false);
  const preview = highlights.slice(0, HIGHLIGHTS_PREVIEW_COUNT);
  const hasMore = highlights.length > HIGHLIGHTS_PREVIEW_COUNT;

  return (
    <>
      <aside className="flex h-full min-w-0 flex-col rounded-lg border border-maroon-800 bg-maroon-900 p-3 text-white shadow-xl sm:p-5">
        <div className="mb-2 flex items-center gap-2 font-condensed text-xs font-semibold uppercase tracking-wide text-gold-300 sm:mb-3">
          <Trophy size={16} />
          Highlights
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sm:space-y-3">
          {preview.map((item) => (
            <article key={item.title} className="rounded-md border border-white/10 bg-white/[0.08] p-2 sm:p-4">
              <h3 className="m-0 font-sans text-xs font-extrabold text-white sm:text-base">{item.title}</h3>
              <p className="mt-1 font-sans text-[11px] leading-snug text-maroon-100 sm:mt-2 sm:text-sm sm:leading-relaxed">{item.body}</p>
            </article>
          ))}
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-2 self-start font-sans text-[11px] font-semibold text-gold-300 underline underline-offset-2 hover:text-gold-200 sm:mt-3 sm:text-sm"
          >
            More Highlights
          </button>
        )}
      </aside>

      {showAll && (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-maroon-900">
          <button
            type="button"
            aria-label="Back"
            onClick={() => setShowAll(false)}
            className="fixed left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-sans text-sm font-semibold text-white shadow-md hover:bg-white/20"
          >
            <ArrowLeft size={18} />
            Back
          </button>
          <div className="mx-auto max-w-[720px] px-5 pb-10 pt-20 sm:px-8">
            <h2 className="m-0 mb-6 font-sans text-2xl font-extrabold text-white">All Highlights</h2>
            <div className="space-y-3">
              {highlights.map((item) => (
                <article key={item.title} className="rounded-md border border-white/10 bg-white/[0.08] p-4">
                  <h3 className="m-0 font-sans text-base font-extrabold text-white">{item.title}</h3>
                  <p className="mt-2 font-sans text-sm leading-relaxed text-maroon-100">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type ToggleTab = "highlights" | "teams" | "schedule";

const TOGGLE_TABS: TabItem[] = [
  { value: "highlights", label: "Highlights" },
  { value: "teams", label: "Teams" },
  { value: "schedule", label: "Schedule" },
];

/** Mobile-only replacement for the 2-column Highlights/quick-cards block: one full-width panel, switched by a 3-way toggle, defaulting to Highlights. */
function MobileHighlightsToggle() {
  const [tab, setTab] = useState<ToggleTab>("highlights");

  return (
    <div className="lg:hidden">
      <Tabs items={TOGGLE_TABS} value={tab} onChange={(v) => setTab(v as ToggleTab)} variant="pill" />
      <div className="mt-3">
        {tab === "highlights" && <HighlightsRail />}
        {tab === "teams" && <HomeTeamsPanel />}
        {tab === "schedule" && <QuickScheduleCard />}
      </div>
    </div>
  );
}

function NewsSection() {
  const [active, setActive] = useState<(typeof news)[number] | null>(null);

  return (
    <section>
      <SectionHead title="News" />
      <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-3">
        {news.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => setActive(item)}
            className="overflow-hidden rounded-md border border-ink-200 bg-white text-left shadow-sm transition-transform hover:-translate-y-1 hover:shadow-lg sm:rounded-lg sm:shadow-md"
          >
            <div className="relative aspect-[16/9] bg-ink-100">
              <Image src={item.image} alt="" fill sizes="(max-width: 640px) 50vw, 360px" className="object-cover" />
            </div>
            <div className="p-2 sm:p-3">
              <div className="font-condensed text-[9px] font-semibold uppercase tracking-wide text-maroon-600 sm:text-xs">{item.kicker}</div>
              <h3 className="m-0 mt-1 font-sans text-[11px] font-extrabold text-ink-900 sm:text-base">{item.title}</h3>
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-5 py-8">
          <article className="relative max-h-[86vh] w-full max-w-[760px] overflow-y-auto rounded-lg bg-white shadow-2xl">
            <button
              type="button"
              aria-label="Close story"
              onClick={() => setActive(null)}
              className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow-md"
            >
              <X size={22} />
            </button>
            <div className="relative h-[280px] bg-ink-100">
              <Image src={active.image} alt="" fill sizes="760px" className="object-cover" />
            </div>
            <div className="p-8">
              <div className="font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-600">{active.kicker}</div>
              <h2 className="m-0 mt-2 font-sans text-4xl font-extrabold text-ink-900">{active.title}</h2>
              <div className="mt-6 space-y-4">
                {active.body.map((paragraph) => (
                  <p key={paragraph} className="m-0 font-sans text-base leading-relaxed text-ink-600">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function confirmLeave(message: string): boolean {
  return window.confirm(message);
}

function SocialsSection() {
  const [reels, setReels] = useState<SocialReel[]>(fallbackReels);

  useEffect(() => {
    let cancelled = false;

    async function loadReels() {
      try {
        const res = await fetch("/api/instagram-reels", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { reels?: SocialReel[] };
        const liveReels = Array.isArray(data.reels) ? data.reels.filter((item) => item.permalink) : [];
        if (!cancelled && liveReels.length > 0) {
          setReels([...liveReels, ...fallbackReels].slice(0, 4));
        }
      } catch {
        if (!cancelled) setReels(fallbackReels);
      }
    }

    loadReels();
    return () => {
      cancelled = true;
    };
  }, []);

  const shownReels = reels.slice(0, 2);

  return (
    <section>
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <div className="min-w-0">
          <SectionHead title="Our Insta" />
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {shownReels.map((reel, index) => (
              <a
                key={`${reel.id}-${index}`}
                href={reel.permalink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!confirmLeave("You're leaving The Maroon Masters to open Instagram. Continue?")) e.preventDefault();
                }}
                className="group relative flex aspect-[9/16] min-h-[140px] flex-col justify-between overflow-hidden rounded-md border border-gold-400 bg-gradient-to-b from-maroon-800 to-ink-900 p-2 text-white shadow-sm sm:min-h-[300px] sm:rounded-lg sm:p-4 sm:shadow-lg"
              >
                {reel.thumbnailUrl && (
                  // Instagram thumbnails are remote URLs, so use a normal image rather than Next Image domain config.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reel.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-maroon-950/90" />
                <div className="relative flex items-center justify-between">
                  <div className="font-condensed text-[9px] font-semibold uppercase tracking-wide text-gold-300 sm:text-xs">Reel</div>
                  <Play size={12} fill="currentColor" className="sm:hidden" />
                  <Play size={16} fill="currentColor" className="hidden sm:block" />
                </div>
                <div className="relative">
                  <h3 className="m-0 line-clamp-2 font-sans text-[10px] font-extrabold sm:text-base">{reel.caption || "Maroon Masters Reel"}</h3>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <SectionHead title="Our Videos" action="Other Videos" actionHref={ALL_VIDEOS_HREF} />
          <div className="flex flex-col gap-2 sm:gap-4">
            {hypeVideoSlots.map((video) => (
              <a
                key={video.id}
                href={ALL_VIDEOS_HREF}
                onClick={(e) => {
                  if (!confirmLeave("You're leaving The Maroon Masters to view all videos. Continue?")) e.preventDefault();
                }}
                className="group relative flex aspect-[16/9] w-full flex-col justify-between overflow-hidden rounded-md border border-gold-400 bg-gradient-to-b from-maroon-800 to-ink-900 p-2 text-white shadow-sm sm:rounded-lg sm:p-4 sm:shadow-lg"
              >
                {video.thumbnailUrl && (
                  <Image src={video.thumbnailUrl} alt="" fill sizes="(max-width: 640px) 50vw, 360px" className="object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-maroon-950/90" />
                <div className="relative flex items-center justify-between">
                  <div className="font-condensed text-[9px] font-semibold uppercase tracking-wide text-gold-300 sm:text-xs">Video</div>
                  <Play size={12} fill="currentColor" className="sm:hidden" />
                  <Play size={16} fill="currentColor" className="hidden sm:block" />
                </div>
                <div className="relative">
                  <h3 className="m-0 line-clamp-2 font-sans text-[10px] font-extrabold sm:text-base">{video.caption}</h3>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeDashboard() {
  return (
    <section className="bg-cream-100">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-7 sm:py-8">
        <MobileHighlightsToggle />

        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(180px,320px)] gap-4 xl:gap-7">
          <HighlightsRail />
          <div className="flex min-w-0 flex-col gap-2 sm:gap-3 xl:gap-4">
            <QuickScheduleCard />
            <QuickTeamsCard />
            <QuickLeaderboardCard />
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

(`video.thumbnailUrl` is still rendered with `<Image fill>` inside an `<a>` now instead of a `<div>` — the `<a>` keeps the same `relative` positioning class the `<div>` had, so `fill` still resolves correctly.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (confirm no unused-import warnings — `QuickLeaderboardCard`/`QuickTeamsCard` are still used in the desktop-only grid).

- [ ] **Step 4: Commit**

```bash
git add components/home/HomeDashboard.tsx
git commit -m "feat: mobile Highlights/Teams/Schedule toggle, desktop grid unchanged, confirm-gated media links"
```

---

### Task 10: Hide `Footer` on mobile

**Files:**
- Modify: `components/Footer.tsx`

**Interfaces:** none — `Footer()` still takes no props.

- [ ] **Step 1: Add the mobile-hidden class**

In `components/Footer.tsx`, change:
```tsx
    <footer className="bg-maroon-900 text-maroon-200">
```
to:
```tsx
    <footer className="hidden bg-maroon-900 text-maroon-200 lg:block">
```
(only this one line changes — everything else in the file stays the same).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/Footer.tsx
git commit -m "fix: hide the Footer on mobile — the bottom nav is the mobile footer"
```

---

### Task 11: Full manual walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (port 3001). If it fails with `EADDRINUSE`, a previous dev server is still running on port 3001 — find and stop it first (e.g. on Windows: find the PID with `Get-NetTCPConnection -LocalPort 3001`, then `Stop-Process -Id <pid> -Force`), then retry.

- [ ] **Step 2: Production build sanity check**

Run: `npm run build`. Expected: succeeds with no type/lint errors.

- [ ] **Step 3: Walk it on mobile viewport (devtools responsive mode, < lg / 1024px width)**

- Header: flush to the top, no gap above it. Left zone shows the Instagram icon + countdown (or "Live Now" if `isLiveNow()` is forced true for testing). Wordmark is centered and bottom-aligned. Account icon sits top-right and is always visible/tappable, even signed out.
- Tap the account icon: confirm a full-screen white menu opens with "Welcome" at top, My Team/Fantasy/The MM Vault/Merchandise/Settings, a thin divider, Sponsorship Opportunities/Learn More About the Players, and Sign Up/Login (both visibly disabled) at the bottom. Confirm each link navigates to its stub page ("Coming soon") and closes the menu. Confirm the X button closes it.
- Bottom nav: confirm it's still flush to the very bottom edge, but the icons/labels now sit closer to the top of the bar instead of hugging the bottom, and are slightly smaller.
- Tap "More": confirm Schedule/History still open in the maroon full-screen panel as before (no Portal item, since no one is signed in).
- Confirm the hero shows a static photo (not a video) on mobile.
- Confirm a horizontally-scrollable leaderboard strip renders directly under the hero, showing 2026 data (avatar + score badge, "T5 Barone"-style labels), even outside the live tournament window.
- Confirm a 3-way Highlights/Teams/Schedule toggle renders full-width below the strip, defaulting to Highlights; confirm Teams shows the 2026 score line + a condensed match board, and Schedule shows the round/venue placeholder card. Confirm no 2-column grid or quick cards are visible.
- Confirm News is unchanged. In "Our Insta"/"Our Videos", tap a reel and a video tile: confirm a browser confirm dialog appears before navigating, and Cancel keeps you on the page.
- Confirm no `<footer>` renders at the bottom of any page (only the bottom nav bar).

- [ ] **Step 4: Walk it on desktop viewport (≥ lg / 1024px width)**

- Confirm the header, hero (video), and home page's 2-column Highlights + quick-cards layout all look exactly as they did before this plan.
- Confirm the Footer renders at the bottom of the page as before.
- Confirm `AccountBadge`'s small dropdown (not the new full-screen `AccountMenu`) is what opens from the header's account icon on desktop.

- [ ] **Step 5: Final commit (only if Step 3/4 turned up fixes)**

If the walkthrough required any fixes, stage and commit them individually. If nothing needed fixing, this task ends at Step 4 with no commit.
