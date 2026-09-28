"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fmtPt } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";
import { liveOddsSeries, type LiveRoundMatch } from "@/lib/data/tournamentProbability";
import { TournamentOddsGraph } from "./TournamentOddsGraph";
import styles from "@/components/match/MatchTimeline.module.css";

type Odds = { maroon_win_probability: number; tie_probability: number; white_win_probability: number };
type Entry = {
  match: { id: string; round: number; format: string; maroon_players: string[]; white_players: string[] };
  officialState: { status: "upcoming" | "live" | "complete" | "closed_out"; leader: "maroon" | "white" | "tie"; thru: number } | null;
  odds: Odds | null;
  openingOdds: Odds | null;
};

const chance = (odds: Odds | null) => odds ? { maroon: Number(odds.maroon_win_probability), tie: Number(odds.tie_probability), white: Number(odds.white_win_probability) } : null;

/** Rounds in play order, each holding its matches' results and official odds. */
function liveRounds(entries: Entry[]): LiveRoundMatch[][] {
  const rounds = [...new Set(entries.map((entry) => entry.match.round))].sort((a, b) => a - b);
  return rounds.map((round) => entries.filter((entry) => entry.match.round === round).map((entry) => {
    const done = entry.officialState?.status === "complete" || entry.officialState?.status === "closed_out";
    return { result: done ? entry.officialState!.leader : null, thru: entry.officialState?.thru ?? 0, opening: chance(entry.openingOdds), latest: chance(entry.odds) };
  }));
}

function points(entries: Entry[], team: "maroon" | "white") {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const players = team === "maroon" ? entry.match.maroon_players : entry.match.white_players;
    players.forEach((player) => totals.set(player, totals.get(player) ?? 0));
    if (entry.officialState?.status !== "complete" && entry.officialState?.status !== "closed_out") continue;
    const earned = entry.officialState.leader === team ? 1 : entry.officialState.leader === "tie" ? 0.5 : 0;
    players.forEach((player) => totals.set(player, (totals.get(player) ?? 0) + earned));
  }
  return [...totals].map(([slug, total]) => ({ name: getPlayerDisplayName(slug), total })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function LiveTeamList({ title, rows, maroon }: { title: string; rows: { name: string; total: number }[]; maroon: boolean }) {
  return <section className={maroon ? "rounded-md border border-maroon-700 bg-maroon-700 p-4 text-white" : "rounded-md border border-ink-200 bg-white p-4"}><h2 className="font-serif text-2xl font-bold">{title}</h2><p className={maroon ? "mt-1 font-sans text-sm text-white/70" : "mt-1 font-sans text-sm text-ink-500"}>Confirmed points earned</p><ol className="mt-4 divide-y divide-current/15">{rows.length ? rows.map((row) => <li key={row.name} className="flex justify-between py-2.5 font-sans"><span className="font-semibold">{row.name}</span><span className="text-xl font-black tabular-nums">{fmtPt(row.total)}</span></li>) : <li className="py-3 font-sans text-sm opacity-70">Players appear when matchups are locked.</li>}</ol></section>;
}

export function LiveProjectedTournamentPage({ title, slug }: { title: string; slug: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/live/matches?section=leaderboard", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active && data.ok) setEntries(data.matches); }).catch(() => {}).finally(() => active && setLoading(false));
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const rounds = useMemo(() => liveRounds(entries), [entries]);
  const series = useMemo(() => liveOddsSeries(rounds), [rounds]);
  const maroon = useMemo(() => points(entries, "maroon"), [entries]);
  const white = useMemo(() => points(entries, "white"), [entries]);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-4 sm:px-7 sm:py-10">
      <Link href={`/leaderboard/${slug}`} className="inline-flex items-center gap-1 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700 hover:text-maroon-900"><ArrowLeft size={15} /> Back to Leaderboard</Link>
      <div className="mt-3 sm:mt-4">
        <p className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-500">Live Tournament Win Probability</p>
        <h1 className="mt-1 font-serif text-xl font-bold sm:text-3xl">{title}</h1>
        <div className={styles.mobileGraph}><div className={styles.probabilityCard}>
          <TournamentOddsGraph points={series} rounds={rounds.length} note="Finished rounds count as their real results, later matches use their official pre-round odds, and Now uses the latest official odds. Refreshes every 10 seconds." emptyNote={loading ? "Loading official match odds…" : "Odds will appear once matchups are locked."} />
        </div></div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2"><LiveTeamList title="Maroon" rows={maroon} maroon /><LiveTeamList title="White" rows={white} maroon={false} /></div>
    </main>
  );
}
