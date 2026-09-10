"use client";

import { useRef, useState } from "react";
import Link from "next/link";

export type PortalMatch = { id: string; label: string; details: string; live?: boolean; preview?: boolean };

export function PortalMatches({ matches, team }: { matches: PortalMatch[]; team: "maroon" | "white" | null }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const maroon = team === "maroon";
  return <section aria-label="My Matches" className={`flex min-h-[max(16rem,48vw)] flex-col justify-center py-7 sm:min-h-[max(18rem,48vw)] ${maroon ? "bg-maroon-800 text-white" : "bg-white text-maroon-900"}`}>
    <h2 className="text-center font-serif text-3xl font-bold sm:text-4xl">My Matches</h2>
    <div ref={track} onScroll={(event) => { const node = event.currentTarget; setActive(Math.round(node.scrollLeft / node.clientWidth)); }} className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {matches.map((match, index) => <article key={match.id} aria-label={`Match ${index + 1} of ${matches.length}`} className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-6 py-7 text-center sm:py-10">
        <p className={`rounded-full border px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-[0.15em] ${maroon ? "border-white/30 text-white/80" : "border-maroon-200 text-maroon-700"}`}>{match.preview ? "Upcoming · Test match" : match.live ? "Live now" : "Upcoming"}</p>
        <h3 className="mx-auto mt-5 max-w-2xl font-serif text-2xl font-bold sm:text-4xl">{match.label}</h3>
        <p className={`mt-4 max-w-xl text-sm leading-relaxed ${maroon ? "text-white/75" : "text-ink-600"}`}>{match.details}</p>
        {match.live && !match.preview && <Link href="/portal/scoring/play" className="mt-5 rounded-full border border-current px-5 py-2 text-sm font-semibold">Open live scoring</Link>}
      </article>)}
    </div>
    {matches.length > 1 && <div className="flex items-center justify-center gap-3" aria-label="Choose a match">{matches.map((match, index) => <button key={match.id} type="button" aria-label={`Show match ${index + 1}`} aria-current={active === index ? "true" : undefined} onClick={() => track.current?.scrollTo({ left: index * track.current.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })} className="flex h-8 w-8 items-center justify-center"><span className={`h-2 rounded-full bg-current transition-all ${active === index ? "w-6" : "w-2 opacity-30"}`} /></button>)}</div>}
  </section>;
}
