"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserRound, ArrowLeft } from "lucide-react";
import { RoundCountdown } from "@/components/ui/RoundCountdown";
import { Avatar } from "@/components/ui/Avatar";
import { TigerAvatar } from "@/components/ui/TigerAvatar";
import { AccountBadge } from "@/components/AccountBadge";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { MorePanel, MORE_LINKS, onOpenMoreMenuRequested } from "@/components/nav/MorePanel";
import { AccountMenu } from "@/components/nav/AccountMenu";
import { useAccountSession } from "@/lib/useAccountSession";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import { latestCompleted, nextTournament, champion, isLiveNow, fmtPt } from "@/lib/data";
import type { NextTournamentOverride } from "@/lib/data/types";

const nav = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/watch-live", label: "Watch Live" },
  { href: "/teams", label: "Teams" },
];

function InstagramGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function isSet(value: string): boolean {
  return value.trim().length > 0 && value.trim().toLowerCase() !== "tbd";
}

// The "home" page of each section of the app — Website, Player Portal,
// Scoring, and the Tiger Center. The mobile header's top-left Instagram
// icon only shows on these; every other page (anything you had to click
// into) shows a real back arrow there instead, matching the "the whole
// site should be uniform about this" requirement. Exact match only — a
// sub-page under one of these (e.g. /leaderboard/2027) still gets a back
// arrow, only the bare hub itself is exempt.
const HOME_PAGES = new Set(["/", "/leaderboard", "/watch-live", "/teams", "/portal", "/portal/scoring", "/portal/admin"]);

function isHomePage(pathname: string): boolean {
  return HOME_PAGES.has(pathname);
}

export function Header({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  const router = useRouter();
  const live = isLiveNow();
  const champ = champion(latestCompleted);
  const nextVenueKnown = isSet(nextTournamentOverride.venue);
  const session = useAccountSession();
  const showBack = !isHomePage(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  useEffect(() => onOpenMoreMenuRequested(() => setMoreOpen(true)), []);
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
      <div className="bg-gradient-maroon">
        {/* Mobile header row — white background to blend with the phone's status bar, 3 zones: Instagram + countdown/live (left), wordmark (center, bottom-aligned), account icon (right, always visible). */}
        <div className="lg:hidden grid grid-cols-3 items-end gap-2 bg-white px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem+2vh)]">
          <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
            {showBack ? (
              <button
                type="button"
                onClick={() => router.back()}
                aria-label="Back"
                title="Back"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-maroon-700"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <a
                href="https://www.instagram.com/themaroonmasters/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="The Maroon Masters Instagram"
                title="The Maroon Masters Instagram"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-maroon-700"
              >
                <InstagramGlyph size={16} />
              </a>
            )}
            {showBack ? null : live ? (
              <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-maroon-700">Live Now</span>
            ) : (
              <RoundCountdown className="text-maroon-700" compact />
            )}
          </div>

          <Link href="/" className="justify-self-center">
            <Image src="/assets/wordmark-header.svg" alt="The Maroon Masters" width={520} height={92} className="h-5 w-auto" priority />
          </Link>

          <button
            type="button"
            onClick={() => setAccountMenuOpen(true)}
            aria-label="Your account"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center justify-self-end rounded-full"
          >
            {session?.kind === "host" ? (
              <TigerAvatar size="xs" />
            ) : session?.kind === "player" ? (
              <Avatar name={getPlayerDisplayName(session.playerSlug)} src={getPlayerAvatar(session.playerSlug)} size="xs" team={session.team} />
            ) : session?.kind === "fan" ? (
              <Avatar name={session.displayName} size="xs" />
            ) : (
              <UserRound size={16} className="text-maroon-700" />
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
            {nextTournament.editionLabel} &middot; {nextTournamentOverride.venue} &middot; Underway now
          </span>
        ) : (
          <>
            <span className="font-condensed text-[10px] font-semibold tracking-eyebrow uppercase text-gold-300 text-center">
              Defending Champions: Team {champ === "maroon" ? "Maroon" : "White"} &middot; {latestCompleted.year}
            </span>
            <span className="block w-px h-[14px] bg-white/15" />
            <span className="font-sans text-[11px] text-white/55 text-center">
              {fmtPt(latestCompleted.maroonPts)}&ndash;{fmtPt(latestCompleted.whitePts)} at {latestCompleted.venue} &middot; Next up{" "}
              {nextVenueKnown ? `${nextTournamentOverride.venue} - ${nextTournamentOverride.dateLabel}` : nextTournamentOverride.dateLabel}
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
