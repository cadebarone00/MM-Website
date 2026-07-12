"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { RoundCountdown } from "@/components/ui/RoundCountdown";
import { latestCompleted, nextTournament, champion, isLiveNow, fmtPt } from "@/lib/data";

const nav = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/teams", label: "Teams" },
  { href: "/schedule", label: "Schedule" },
  { href: "/history", label: "History" },
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[100] shadow-lg relative">
      <div className="h-px bg-white/15" />

      <div className="bg-gradient-maroon">
        <div className="flex items-center justify-between px-4 h-14 sm:px-7 sm:h-[64px]">
          <div className="flex items-center gap-3 sm:gap-9">
            {/* Hamburger — hidden only at true desktop widths */}
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((o) => !o)}
              className="lg:hidden inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 sm:h-9 sm:w-9"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Link href="/" className="shrink-0" onClick={() => setMenuOpen(false)}>
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
            <Image src="/assets/emblem.svg" alt="" width={240} height={240} className="hidden lg:block h-9 w-auto" />
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="lg:hidden bg-maroon-900 border-b border-white/10">
          {nav.map((n) => {
            const on = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className={[
                  "flex items-center px-6 py-4 font-sans text-base border-b border-white/10 last:border-b-0 transition-colors",
                  on ? "font-bold text-white bg-white/10" : "font-medium text-white/70 hover:text-white hover:bg-white/5",
                ].join(" ")}
              >
                {n.label}
              </Link>
            );
          })}
        </div>
      )}

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
    </header>
  );
}
