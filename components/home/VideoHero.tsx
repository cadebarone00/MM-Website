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
      <video className="absolute inset-0 w-full h-full scale-110 object-cover" src="/videos/home-hero.mp4" autoPlay muted loop playsInline />
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
