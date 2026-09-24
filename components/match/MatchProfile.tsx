import styles from "./MatchTimeline.module.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { liveLabel, matchStatus, matchLeader } from "@/components/leaderboard/matchUtils";
import type { RealMatch } from "@/lib/data/types";
import type { MatchOddsPoint } from "@/lib/live/matchProfile";
import { MatchOddsBoard } from "./MatchOddsBoard";
import { MatchOddsGraph } from "./MatchOddsGraph";

export function MatchProfile({ match, tournamentSlug, editionLabel, scorecard, odds = [], live = false, round, estimateNote }: {
  match: RealMatch; tournamentSlug: string; editionLabel: string; scorecard: ReactNode;
  odds?: MatchOddsPoint[]; live?: boolean; round?: number; estimateNote?: string;
}) {
  const status = matchStatus(match);
  const leader = matchLeader(match);
  const centerTone = status === "scheduled" || leader === "tie" ? "bg-cream-100 text-maroon-700" : leader === "maroon" ? "bg-maroon-700 text-white" : "bg-white text-maroon-700";
  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-16 pt-5 sm:px-7 sm:pt-10">
      <Link href={`/leaderboard/${tournamentSlug}`} className="inline-flex items-center gap-1 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700"><ArrowLeft size={16} /> Back to leaderboard</Link>
      <p className="mt-5 font-condensed text-xs font-bold uppercase tracking-wide text-ink-500">{editionLabel} · {round ? `Round ${round}` : `Day ${match.day} · ${match.session}`} · {match.format}</p>
      <h1 className="sr-only">{match.maroonPlayers.map(getPlayerDisplayName).join(" & ")} versus {match.whitePlayers.map(getPlayerDisplayName).join(" & ")}</h1>
      <div className="mx-auto mt-3 max-w-2xl overflow-hidden rounded-sm border border-gold-500">
        <div className="grid grid-cols-2 border-b border-gold-500 font-condensed text-xs font-bold uppercase tracking-wide">
          <div className="bg-maroon-700 px-3 py-2 text-right text-white">Maroon</div>
          <div className="border-l border-gold-500 bg-white px-3 py-2 text-maroon-700">White</div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)] items-stretch bg-cream-50 sm:grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col justify-center gap-2 px-2 py-4 text-right sm:px-4">
            {match.maroonPlayers.map((player) => <Link key={player} href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}`} className="font-sans text-sm font-bold text-maroon-700 hover:underline sm:text-lg">{getPlayerDisplayName(player)}</Link>)}
          </div>
          <div aria-label="Match status" className={`flex flex-col items-center justify-center gap-1 border-x border-gold-500 px-1 py-3 text-center ${centerTone}`}>
            <span className="font-sans text-sm font-black sm:text-base">{status === "scheduled" ? match.teeTimeCst ?? "TBD" : liveLabel(match)}</span>
            <span className="font-condensed text-[10px] font-bold uppercase tracking-wide">{status === "scheduled" ? "Tee time" : status === "final" ? "Final" : `Thru ${match.thru ?? 0}`}</span>
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-2 px-2 py-4 text-left sm:px-4">
            {match.whitePlayers.map((player) => <Link key={player} href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}`} className="font-sans text-sm font-bold text-maroon-700 hover:underline sm:text-lg">{getPlayerDisplayName(player)}</Link>)}
          </div>
        </div>
      </div>
      <section aria-label="Match scorecard" className="mt-7 min-w-0">
        <h2 className="mb-3 font-serif text-xl font-bold text-ink-900">Scorecard</h2>
        {scorecard}
      </section>
      <div className={styles.mobileGraph}><MatchOddsBoard match={match} /><MatchOddsGraph points={odds} live={live} final={status === "final"} estimateNote={estimateNote} result={status === "final" && leader !== "tie" ? { winner: leader, thru: match.holesRemaining != null ? 18 - match.holesRemaining : match.thru ?? 18, label: liveLabel(match) } : undefined} /></div>
    </main>
  );
}
