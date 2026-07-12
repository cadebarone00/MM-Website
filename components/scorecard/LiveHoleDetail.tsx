"use client";

import Link from "next/link";
import { HoleDetailCard } from "./HoleDetailCard";
import { ShotVideoPanel } from "./ShotVideoPanel";
import { DETAIL_POLL_MS, useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament } from "@/lib/data";

export function LiveHoleDetail({
  tournamentSlug,
  player,
  round,
  hole,
}: {
  tournamentSlug: string;
  player: string;
  round: number;
  hole: number;
}) {
  const { tournament, loading, payload } = useLiveTournament(DETAIL_POLL_MS);

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>;
  }

  const displayName =
    [...tournament.roster.maroon, ...tournament.roster.white].find((n) => n.toLowerCase() === player.toLowerCase()) ?? player;
  const scorecard = tournament.scorecards?.find((s) => s.player.toLowerCase() === player.toLowerCase());
  const roundCard = scorecard?.rounds.find((r) => r.round === round);
  const holeStat = roundCard?.holes.find((h) => h.hole === hole);

  if (!roundCard || !holeStat) {
    return (
      <div>
        <Link
          href={`/leaderboard/${tournamentSlug}/players/${player}`}
          className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
        >
          &larr; Back to {displayName}&rsquo;s Scorecard
        </Link>
        <div className="mt-6 px-5 py-8 bg-cream-50 border border-ink-100 rounded-md text-center">
          <p className="font-sans text-sm text-ink-500 m-0">This hole hasn&rsquo;t been posted yet - check back once it&rsquo;s played.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/leaderboard/${tournamentSlug}/players/${player}`}
        className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
      >
        &larr; Back to {displayName}&rsquo;s Scorecard
      </Link>

      <div className="mt-4 mb-6">
        <div className="font-condensed text-[11px] font-semibold tracking-eyebrow uppercase text-maroon-600 mb-[6px]">
          {nextTournament.editionLabel} &middot; Round {roundCard.round} &middot; {roundCard.course}
        </div>
        <h1 className="font-sans text-[32px] font-extrabold text-ink-900 m-0">
          {displayName} &middot; Hole {holeStat.hole}
        </h1>
      </div>

      <HoleDetailCard hole={holeStat} />

      <div className="mt-8">
        <div className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400 mb-2">Hole Overview</div>
        <div className="aspect-[16/7] w-full flex flex-col items-center justify-center gap-2 bg-cream-100 border border-ink-100 rounded-md text-ink-400 mb-8">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="font-condensed text-xs font-semibold tracking-wide uppercase">Hole photos coming soon</span>
        </div>

        <ShotVideoPanel shotCount={holeStat.score} />
      </div>
    </div>
  );
}
