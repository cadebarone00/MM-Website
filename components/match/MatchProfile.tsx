import styles from "./MatchTimeline.module.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { liveLabel, matchStatus, matchLeader, matchWinner, sideScore, teamSideColor } from "@/components/leaderboard/matchUtils";
import type { RealMatch, Team } from "@/lib/data/types";
import type { MatchOddsPoint } from "@/lib/live/matchProfile";
import { MatchProbabilityPreview } from "./MatchProbabilityPreview";
import { MatchOddsBoard } from "./MatchOddsBoard";
import { MatchOddsGraph } from "./MatchOddsGraph";

function OddsBadge({ probability, onMaroon }: { probability?: number; onMaroon: boolean }) {
  return (
    <span className={["flex h-5 min-w-10 items-center justify-center border px-1 font-condensed text-[10px] font-extrabold uppercase tracking-tight", onMaroon ? "border-white text-white" : "border-maroon-700 text-maroon-700"].join(" ")}>
      {probability == null ? "Odds" : `${Math.round(probability * 100)}%`}
    </span>
  );
}

function PlayerSide({ match, team, tournamentSlug }: { match: RealMatch; team: Team; tournamentSlug: string }) {
  const isMaroon = team === "maroon";
  const players = isMaroon ? match.maroonPlayers : match.whitePlayers;
  const won = matchWinner(match) === team;
  const score = sideScore(match, team);
  const scoreLabel = score && <span className={["relative z-10 shrink-0 whitespace-nowrap px-0.5 font-condensed text-base font-extrabold uppercase sm:text-xl", teamSideColor(team, won)].join(" ")}>{score}</span>;
  return (
    <div className={["relative flex min-w-0 items-center self-stretch py-4", isMaroon ? "justify-end" : "justify-start", teamSideColor(team, won)].join(" ")}>
      {isMaroon && scoreLabel}
      <div className={["flex min-w-0 flex-col gap-2", isMaroon ? "items-end text-right" : "items-start text-left"].join(" ")}>
        {players.map((player) => <Link key={player} href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}?fromMatch=${encodeURIComponent(match.id)}`} className="block max-w-full truncate px-2 font-sans text-sm font-bold hover:underline sm:px-4 sm:text-lg">{getPlayerDisplayName(player)}</Link>)}
      </div>
      {!isMaroon && scoreLabel}
      {players.length > 1 && <span aria-hidden className={isMaroon ? "absolute right-0 top-1/2 h-px w-1/2 bg-gold-600" : "absolute left-0 top-1/2 h-px w-1/2 bg-gold-600"} />}
    </div>
  );
}

export function MatchProfile({ match, tournamentSlug, year, courseName, scorecard, odds = [], live = false, round, estimateNote }: {
  match: RealMatch; tournamentSlug: string; year: number; courseName?: string; scorecard: ReactNode;
  odds?: MatchOddsPoint[]; live?: boolean; round?: number; estimateNote?: string;
}) {
  const status = matchStatus(match);
  const leader = matchLeader(match);
  const details = [courseName, round ? `Round ${round}` : `Day ${match.day} · ${match.session}`, match.format].filter(Boolean).join(" · ");
  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-16 pt-5 sm:px-7 sm:pt-10">
      <Link href={`/leaderboard/${tournamentSlug}?day=${match.day}`} className="inline-flex items-center gap-1 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700"><ArrowLeft size={16} /> Back</Link>
      <header className="mt-4 text-center text-maroon-700">
        <h1 className="m-0 font-serif text-3xl font-bold sm:text-5xl">The Maroon Tournament {year}</h1>
        <p className="mt-2 font-condensed text-sm font-bold uppercase tracking-wide sm:text-base">{details}</p>
      </header>
      <p className="sr-only">{match.maroonPlayers.map(getPlayerDisplayName).join(" & ")} versus {match.whitePlayers.map(getPlayerDisplayName).join(" & ")}</p>
      <div className="mx-auto mt-4 max-w-2xl overflow-hidden rounded-sm border border-gold-500">
        <div className="grid grid-cols-2 border-b border-gold-500 font-condensed text-xs font-bold uppercase tracking-wide">
          <div className="flex items-center justify-between gap-2 bg-maroon-700 px-3 py-2 text-white"><OddsBadge probability={match.maroonWinProbability} onMaroon /><span>Maroon</span></div>
          <div className="flex items-center justify-between gap-2 border-l border-gold-500 bg-white px-3 py-2 text-maroon-700"><span>White</span><OddsBadge probability={match.whiteWinProbability} onMaroon={false} /></div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-stretch sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)]">
          <PlayerSide match={match} team="maroon" tournamentSlug={tournamentSlug} />
          <div aria-label="Match status" className="flex items-center justify-center border-x border-gold-500 bg-cream-100 px-1 text-center text-maroon-700">
            {status === "live" ? (
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" aria-label="Live" />
            ) : status === "final" ? (
              <span className="font-sans text-lg font-black sm:text-xl">F</span>
            ) : (
              <span className="font-condensed text-xs font-extrabold uppercase leading-tight sm:text-sm">{match.teeTimeCst ?? "—"}</span>
            )}
          </div>
          <PlayerSide match={match} team="white" tournamentSlug={tournamentSlug} />
        </div>
      </div>
      <section aria-label="Match scorecard" className="mt-7 min-w-0">
        <h2 className="mb-3 font-serif text-xl font-bold text-ink-900">Scorecard</h2>
        {scorecard}
      </section>
      <div className={styles.mobileGraph}><MatchOddsBoard match={match} />{status === "scheduled" ? <MatchProbabilityPreview points={odds} /> : <div className={styles.probabilityCard}><MatchOddsGraph points={odds} live={live} final={status === "final"} estimateNote={estimateNote} result={status === "final" && leader !== "tie" ? { winner: leader, thru: match.holesRemaining != null ? 18 - match.holesRemaining : match.thru ?? 18, label: liveLabel(match) } : undefined} /></div>}</div>
    </main>
  );
}
