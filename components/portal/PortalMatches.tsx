"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getPlayerLastName } from "@/lib/data/players";
import type { PortalMatchCard } from "@/lib/portal/matchCards";

function lastName(player: string) {
  const name = getPlayerLastName(player);
  if (name.toLowerCase() === "wojciechowski") return "WOJO";
  return name.toUpperCase();
}

/** Team-filled, stacked-last-name side — same look as components/leaderboard/CompactMatchRow.tsx's TeamSide. */
function TeamSide({ players, isMaroon, odds }: { players: string[]; isMaroon: boolean; odds: number | null }) {
  return (
    <div className={["flex min-w-0 flex-col justify-center self-stretch", isMaroon ? "items-end bg-maroon-700 text-white" : "items-start bg-white text-maroon-700"].join(" ")}>
      {players.map((player, i) => (
        <span key={player} className={["relative block w-full px-2 py-1.5 font-sans text-xs font-semibold", isMaroon ? "text-right" : "text-left"].join(" ")}>
          <span className="block truncate">{lastName(player)}</span>
          {players.length === 1 && (
            <span
              className={[
                "absolute top-1/2 flex h-4 w-8 -translate-y-1/2 items-center justify-center bg-transparent font-condensed text-[7px] font-extrabold uppercase tracking-tight",
                isMaroon ? "left-1/4 -translate-x-1/2 border border-white text-white" : "right-1/4 translate-x-1/2 border border-maroon-700 text-maroon-700",
              ].join(" ")}
            >
              {odds == null ? "Odds" : `${Math.round(odds * 100)}%`}
            </span>
          )}
          {i > 0 && (
            <>
              <span aria-hidden className={isMaroon ? "absolute right-0 top-0 h-px w-1/2 bg-gold-600" : "absolute left-0 top-0 h-px w-1/2 bg-gold-600"} />
              <span
                className={[
                  "absolute top-0 flex h-4 w-8 -translate-y-1/2 items-center justify-center bg-transparent font-condensed text-[7px] font-extrabold uppercase tracking-tight",
                  isMaroon ? "left-[calc(25%-16px)] border border-white text-white" : "right-[calc(25%-16px)] border border-maroon-700 text-maroon-700",
                ].join(" ")}
              >
                {odds == null ? "Odds" : `${Math.round(odds * 100)}%`}
              </span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

/** Boxed match card — course/round/format header, maroon-vs-white team sides, status+progress in the middle. Deliberately styled after components/leaderboard/CompactMatchRow.tsx. */
function MatchCard({ card }: { card: PortalMatchCard }) {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden border border-gold-500 bg-white text-maroon-900">
      <div className="border-b border-gold-300 bg-cream-50 px-3 py-1.5 text-center">
        <p className="truncate font-serif text-sm font-bold">{card.course ?? "Course TBD"}</p>
        <p className="mt-0.5 font-condensed text-3xs font-black uppercase tracking-wide text-ink-400">{card.roundFormatLabel}</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_74px_minmax(0,1fr)] items-stretch">
        <TeamSide players={card.maroonPlayers} isMaroon odds={card.maroonOdds} />
        <div className="flex flex-col items-center justify-center gap-0.5 border-x border-gold-300 bg-cream-100 px-1 py-2 text-center">
          <span className="font-sans text-base font-black leading-tight text-maroon-700">{card.statusLabel}</span>
          <span className="font-sans text-2xs font-bold leading-tight text-ink-500">{card.progressLabel}</span>
        </div>
        <TeamSide players={card.whitePlayers} isMaroon={false} odds={card.whiteOdds} />
      </div>
    </div>
  );
}

export function PortalMatches({ matches, team, year }: { matches: PortalMatchCard[]; team: "maroon" | "white" | null; year: number }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<PortalMatchCard["status"]>("Live");
  useEffect(() => {
    const reset = () => { setSelected("Live"); setActive(0); };
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      // Also reset when navigation hides a page that Next.js keeps mounted.
      reset();
    };
  }, []);
  const visibleMatches = matches.filter((match) => match.status === selected);
  const maroon = team === "maroon";
  return <section aria-label="My Matches" className={`flex flex-col justify-start pb-2 pt-3 ${maroon ? "bg-maroon-800 text-white" : "bg-white text-maroon-900"}`}>
    <h2 className="text-center font-serif text-xl font-bold sm:text-2xl">My Matches</h2>
    <div className={`mx-auto mt-2 flex justify-center border-b ${maroon ? "border-white/20" : "border-ink-200"}`} role="tablist" aria-label="Match timeframe">
      {(["Live", "Upcoming", "Past"] as const).map((tab, index, tabs) => <button key={tab} id={`matches-tab-${tab}`} type="button" role="tab" aria-selected={selected === tab} aria-controls="matches-panel" tabIndex={selected === tab ? 0 : -1}
        onClick={() => { setSelected(tab); setActive(0); }}
        onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          setSelected(tabs[next]); setActive(0);
          document.getElementById(`matches-tab-${tabs[next]}`)?.focus();
        }}
        className={`relative px-5 pb-2 font-condensed text-sm font-bold uppercase tracking-wide transition-colors ${selected === tab ? maroon ? "text-white" : "text-maroon-700" : maroon ? "text-white/50 hover:text-white/80" : "text-ink-400 hover:text-ink-700"}`}>
        {tab}{selected === tab && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-current" />}
      </button>)}
    </div>
    <div id="matches-panel" role="tabpanel" aria-labelledby={`matches-tab-${selected}`} tabIndex={0}>
    {visibleMatches.length === 0 && <p className={`px-4 py-4 text-center text-sm ${maroon ? "text-white/75" : "text-ink-600"}`}>No {selected.toLowerCase()} matches for {year}.</p>}
    <div key={selected} ref={track} onScroll={(event) => { const node = event.currentTarget; setActive(Math.round(node.scrollLeft / node.clientWidth)); }} className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {visibleMatches.map((match, index) => <article key={match.id} aria-label={`Match ${index + 1} of ${visibleMatches.length}`} className="flex w-full shrink-0 snap-center flex-col items-center justify-start px-4 py-3">
        <MatchCard card={match} />
        {match.status === "Live" && <Link href="/portal/scoring/play" className="mt-3 rounded-full border border-current px-5 py-2 text-sm font-semibold">Open live scoring</Link>}
      </article>)}
    </div>
    {visibleMatches.length > 1 && <div className="flex items-center justify-center gap-3" aria-label="Choose a match">{visibleMatches.map((match, index) => <button key={match.id} type="button" aria-label={`Show match ${index + 1}`} aria-current={active === index ? "true" : undefined} onClick={() => track.current?.scrollTo({ left: index * track.current.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })} className="flex h-8 w-8 items-center justify-center"><span className={`h-2 rounded-full bg-current transition-all ${active === index ? "w-6" : "w-2 opacity-30"}`} /></button>)}</div>}
    </div>
  </section>;
}
