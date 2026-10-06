"use client";
import { useSeasonCatalog } from "@/components/SeasonCatalogProvider";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { useAreaBack } from "@/components/nav/AreaNavigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { UserRound, ArrowLeft } from "lucide-react";
import { RoundCountdown } from "@/components/ui/RoundCountdown";
import { Avatar } from "@/components/ui/Avatar";
import { AdminAvatar } from "@/components/ui/AdminAvatar";
import { AccountBadge } from "@/components/AccountBadge";
import { SponsorRotator } from "@/components/nav/SponsorRotator";
import { MorePanel, MORE_LINKS, onOpenMoreMenuRequested } from "@/components/nav/MorePanel";
import { AccountMenu } from "@/components/nav/AccountMenu";
import { useAccountSession } from "@/lib/useAccountSession";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import { champion, fmtPt } from "@/lib/data";
import type { NextTournamentOverride } from "@/lib/data/types";

const nav = [
  { href: "/website", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/watch-live", label: "Watch Live" },
  { href: "/teams", label: "Teams" },
];

function isSet(value: string): boolean {
  return value.trim().length > 0 && value.trim().toLowerCase() !== "tbd";
}

// The "home" page of each section of the app — Website, Player Portal,
// Scoring, and the Admin Center. The mobile header's top-left sponsor
// logo only shows on these; every other page (anything you had to click
// into) shows a real back arrow there instead, matching the "the whole
// site should be uniform about this" requirement. Exact match only — a
// sub-page under one of these (e.g. /leaderboard/2027) still gets a back
// arrow, only the bare hub itself is exempt.
const HOME_PAGES = new Set(["/website", "/leaderboard", "/watch-live", "/teams", "/portal", "/portal/scoring", "/portal/admin"]);

function isHomePage(pathname: string): boolean {
  return HOME_PAGES.has(pathname);
}

export function Header({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  const { latestCompleted, nextTournament, isLiveNow } = useSeasonCatalog();
  const pathname = usePathname();
  const back = useAreaBack();
  const live = isLiveNow();
  const champ = champion(latestCompleted);
  const nextVenueKnown = isSet(nextTournamentOverride.venue);
  const session = useAccountSession();
  const showBack = !isHomePage(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  useEffect(() => onOpenMoreMenuRequested(() => setMoreOpen(true)), []);
  const moreOn = pathname.startsWith("/the-maroon") || MORE_LINKS.some((l) => pathname.startsWith(l.href));

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
    <header className="sticky top-0 z-[300] relative shadow-lg">
      <div className="bg-gradient-maroon">
        {/* Mobile header row — white background to blend with the phone's status bar, 3 zones: sponsor / back arrow (left), wordmark (center, bottom-aligned), account icon (right, always visible). */}
        <div className="lg:hidden grid grid-cols-3 items-end gap-2 bg-white px-4 pb-2 pt-[calc(0px+0.5rem+2vh)]">
          <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
            {showBack ? (
              <Link
                href={back.href}
                onNavigate={back.onNavigate}
                aria-label="Back"
                title="Back"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-maroon-700"
              >
                <ArrowLeft size={16} />
              </Link>
            ) : (
              <SponsorRotator variant="mobile" />
            )}
          </div>

          <Link href="/website" className="justify-self-center">
            <Wordmark className="text-2xl text-maroon-700" />
          </Link>

          <button
            type="button"
            onClick={() => setAccountMenuOpen(true)}
            aria-label="Your account"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center justify-self-end rounded-full"
          >
            {session?.kind === "host" ? (
              <AdminAvatar size="xs" />
            ) : session?.kind === "player" ? (
              <Avatar name={getPlayerDisplayName(session.playerSlug)} src={getPlayerAvatar(session.playerSlug)} size="xs" team={session.team} />
            ) : session?.kind === "fan" ? (
              <Avatar name={session.displayName} size="xs" />
            ) : (
              <UserRound size={16} className="text-maroon-700" />
            )}
          </button>
        </div>

        {/* Desktop header row — sponsor (left), wordmark + nav (center), countdown/account/emblem (right). */}
        <div className="hidden lg:grid lg:grid-cols-[auto_1fr_auto] min-[1400px]:grid-cols-[1fr_auto_1fr] items-center gap-6 px-7 h-[64px]">
          <div className="flex min-w-0 items-center">
            <SponsorRotator variant="desktop" />
          </div>

          <nav className="flex items-center gap-0 justify-self-center">
            <Link href="/website" className="mr-3 shrink-0 xl:mr-5">
              <Wordmark className="text-3xl text-white" />
            </Link>
            {nav.map((n) => {
              const on = n.href === "/website" ? pathname === "/website" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={[
                    "px-2.5 xl:px-4 h-[64px] flex items-center font-sans text-[15px] whitespace-nowrap border-b-2 transition-colors duration-150",
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
                "px-2.5 xl:px-4 h-[64px] flex items-center font-sans text-[15px] whitespace-nowrap border-b-2 transition-colors duration-150",
                moreOn ? "font-bold text-white border-b-gold-400" : "font-medium text-white/65 border-b-transparent hover:text-white/90",
              ].join(" ")}
            >
              More
            </button>
          </nav>

          <div className="flex items-center justify-end gap-3">
            <RoundCountdown className="text-white" />
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

      <MorePanel open={moreOpen} onClose={() => setMoreOpen(false)} />
      <AccountMenu open={accountMenuOpen} onClose={() => setAccountMenuOpen(false)} />
    </header>
  );
}
