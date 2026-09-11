"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type PortalMatch = { id: string; label: string; details: string; status: "Live" | "Upcoming" | "Past" };

export function PortalMatches({ matches, team, year }: { matches: PortalMatch[]; team: "maroon" | "white" | null; year: number }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<PortalMatch["status"]>("Live");
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
  return <section aria-label="My Matches" className={`flex min-h-[max(16rem,48vw)] flex-col justify-center py-7 sm:min-h-[max(18rem,48vw)] ${maroon ? "bg-maroon-800 text-white" : "bg-white text-maroon-900"}`}>
    <h2 className="text-center font-serif text-3xl font-bold sm:text-4xl">My Matches</h2>
    <div className={`mx-auto mt-6 flex justify-center border-b ${maroon ? "border-white/20" : "border-ink-200"}`} role="tablist" aria-label="Match timeframe">
      {(["Live", "Upcoming", "Past"] as const).map((tab, index, tabs) => <button key={tab} id={`matches-tab-${tab}`} type="button" role="tab" aria-selected={selected === tab} aria-controls="matches-panel" tabIndex={selected === tab ? 0 : -1}
        onClick={() => { setSelected(tab); setActive(0); }}
        onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          setSelected(tabs[next]); setActive(0);
          document.getElementById(`matches-tab-${tabs[next]}`)?.focus();
        }}
        className={`relative px-5 pb-3 font-condensed text-sm font-bold uppercase tracking-wide transition-colors ${selected === tab ? maroon ? "text-white" : "text-maroon-700" : maroon ? "text-white/50 hover:text-white/80" : "text-ink-400 hover:text-ink-700"}`}>
        {tab}{selected === tab && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-current" />}
      </button>)}
    </div>
    <div id="matches-panel" role="tabpanel" aria-labelledby={`matches-tab-${selected}`} tabIndex={0}>
    {visibleMatches.length === 0 && <p className={`px-6 py-12 text-center text-sm ${maroon ? "text-white/75" : "text-ink-600"}`}>No {selected.toLowerCase()} matches for {year}.</p>}
    <div key={selected} ref={track} onScroll={(event) => { const node = event.currentTarget; setActive(Math.round(node.scrollLeft / node.clientWidth)); }} className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {visibleMatches.map((match, index) => <article key={match.id} aria-label={`Match ${index + 1} of ${visibleMatches.length}`} className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-6 py-7 text-center sm:py-10">
        <p className={`rounded-full border px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-[0.15em] ${maroon ? "border-white/30 text-white/80" : "border-maroon-200 text-maroon-700"}`}>{match.status === "Live" ? "Live now" : match.status === "Past" ? "Final" : "Upcoming"}</p>
        <h3 className="mx-auto mt-5 max-w-2xl font-serif text-2xl font-bold sm:text-4xl">{match.label}</h3>
        <p className={`mt-4 max-w-xl text-sm leading-relaxed ${maroon ? "text-white/75" : "text-ink-600"}`}>{match.details}</p>
        {match.status === "Live" && <Link href="/portal/scoring/play" className="mt-5 rounded-full border border-current px-5 py-2 text-sm font-semibold">Open live scoring</Link>}
      </article>)}
    </div>
    {visibleMatches.length > 1 && <div className="flex items-center justify-center gap-3" aria-label="Choose a match">{visibleMatches.map((match, index) => <button key={match.id} type="button" aria-label={`Show match ${index + 1}`} aria-current={active === index ? "true" : undefined} onClick={() => track.current?.scrollTo({ left: index * track.current.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })} className="flex h-8 w-8 items-center justify-center"><span className={`h-2 rounded-full bg-current transition-all ${active === index ? "w-6" : "w-2 opacity-30"}`} /></button>)}</div>}
    </div>
  </section>;
}
