import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import { liveLabel, matchStatus } from "@/components/leaderboard/matchUtils";
import type { RealMatch } from "@/lib/data/types";
import type { MatchOddsPoint } from "@/lib/live/matchProfile";
import { MatchOddsGraph } from "./MatchOddsGraph";

export function MatchProfile({ match, tournamentSlug, editionLabel, scorecard, odds = [], live = false, round }: {
  match: RealMatch; tournamentSlug: string; editionLabel: string; scorecard: ReactNode;
  odds?: MatchOddsPoint[]; live?: boolean; round?: number;
}) {
  const status = matchStatus(match);
  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-16 pt-5 sm:px-7 sm:pt-10">
      <Link href={`/leaderboard/${tournamentSlug}`} className="inline-flex items-center gap-1 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700"><ArrowLeft size={16} /> Back to leaderboard</Link>
      <p className="mt-5 font-condensed text-xs font-bold uppercase tracking-wide text-ink-500">{editionLabel} · {round ? `Round ${round}` : `Day ${match.day} · ${match.session}`} · {match.format}</p>
      <h1 className="sr-only">{match.maroonPlayers.map(getPlayerDisplayName).join(" & ")} versus {match.whitePlayers.map(getPlayerDisplayName).join(" & ")}</h1>
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border border-gold-500">
        {(["maroon", "white"] as const).map((team) => (
          <div key={team} className={`min-w-0 p-4 sm:p-7 ${team === "maroon" ? "bg-maroon-700 text-white" : "border-l border-gold-500 bg-white text-maroon-700"}`}>
            <p className="mb-5 font-condensed text-xs font-bold uppercase tracking-eyebrow">Team {team}</p>
            <div className="flex flex-wrap gap-6">
              {(team === "maroon" ? match.maroonPlayers : match.whitePlayers).map((player) => (
                <Link key={player} href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}`} className="flex min-w-0 flex-col items-start gap-3 hover:opacity-80">
                  <Avatar name={getPlayerDisplayName(player)} src={getPlayerAvatar(player)} team={team} size="lg" />
                  <span className="break-words font-sans text-base font-bold sm:text-xl">{getPlayerDisplayName(player)}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center font-condensed text-sm font-bold uppercase tracking-wide text-maroon-700">{status === "scheduled" ? "Upcoming · VS" : `${status === "final" ? "Final" : `Live · Thru ${match.thru ?? 0}`} · ${liveLabel(match)}`}</p>
      <section aria-label="Match scorecard" className="mt-7 min-w-0">
        <h2 className="mb-3 font-serif text-xl font-bold text-ink-900">Scorecard</h2>
        {scorecard}
      </section>
      <div className="mt-8"><MatchOddsGraph points={odds} live={live} final={status === "final"} /></div>
    </main>
  );
}
