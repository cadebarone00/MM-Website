"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fmtPt } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";

type Entry = {
  match: { id: string; format: string; maroon_players: string[]; white_players: string[] };
  officialState: { status: "upcoming" | "live" | "complete" | "closed_out"; leader: "maroon" | "white" | "tie" } | null;
  odds: { maroon_win_probability: number; tie_probability: number; white_win_probability: number } | null;
};

function probabilities(entry: Entry): [number, number, number] {
  if (entry.officialState?.status === "complete" || entry.officialState?.status === "closed_out") {
    return entry.officialState.leader === "maroon" ? [1, 0, 0] : entry.officialState.leader === "white" ? [0, 0, 1] : [0, 1, 0];
  }
  if (entry.odds) return [entry.odds.maroon_win_probability, entry.odds.tie_probability, entry.odds.white_win_probability];
  return [1 / 3, 1 / 3, 1 / 3];
}

function tournamentProbability(entries: Entry[]): { maroon: number; tie: number; white: number } {
  let distribution = new Map<number, number>([[0, 1]]);
  for (const entry of entries) {
    const [maroon, tie, white] = probabilities(entry);
    const next = new Map<number, number>();
    for (const [margin, probability] of distribution) {
      for (const [change, chance] of [[2, maroon], [0, tie], [-2, white]] as const) next.set(margin + change, (next.get(margin + change) ?? 0) + probability * chance);
    }
    distribution = next;
  }
  let maroon = 0; let tie = 0; let white = 0;
  distribution.forEach((probability, margin) => { if (margin > 0) maroon += probability; else if (margin < 0) white += probability; else tie += probability; });
  return { maroon, tie, white };
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

export function LiveProjectedTournamentPage({ title }: { title: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/live/matches", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active && data.ok) setEntries(data.matches); }).catch(() => {}).finally(() => active && setLoading(false));
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const probabilities = useMemo(() => tournamentProbability(entries), [entries]);
  const maroon = useMemo(() => points(entries, "maroon"), [entries]);
  const white = useMemo(() => points(entries, "white"), [entries]);
  const maroonPct = Math.round(probabilities.maroon * 100);
  const whitePct = Math.round(probabilities.white * 100);

  return <main className="mx-auto max-w-[1200px] px-4 py-7 sm:px-7 sm:py-10"><Link href="/leaderboard/2027" className="inline-flex items-center gap-1 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700"><ArrowLeft size={15} /> Back to Leaderboard</Link><section className="mt-4 rounded-md border border-gold-300 bg-maroon-900 p-5 text-white sm:p-7"><p className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-gold-300">Live Tournament Win Probability</p><h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">{title}</h1>{loading ? <p className="mt-12 font-sans text-sm text-white/70">Loading official match odds…</p> : <><div className="mt-8 grid grid-cols-3 text-center"><div><div className="font-sans text-5xl font-black text-gold-300">{maroonPct}%</div><div className="mt-1 font-condensed text-2xs font-bold uppercase tracking-wide">Maroon</div></div><div><div className="font-sans text-5xl font-black text-white/70">{Math.round(probabilities.tie * 100)}%</div><div className="mt-1 font-condensed text-2xs font-bold uppercase tracking-wide">Tie</div></div><div><div className="font-sans text-5xl font-black text-gold-300">{whitePct}%</div><div className="mt-1 font-condensed text-2xs font-bold uppercase tracking-wide">White</div></div></div><div className="mt-8 flex h-12 overflow-hidden rounded-sm border border-white/25"><div className="flex items-center justify-center bg-maroon-500 font-sans text-sm font-bold" style={{ width: `${probabilities.maroon * 100}%` }}>Maroon</div><div className="flex items-center justify-center bg-ink-500 font-sans text-sm font-bold" style={{ width: `${probabilities.tie * 100}%` }}>Tie</div><div className="flex items-center justify-center bg-cream-50 font-sans text-sm font-bold text-maroon-900" style={{ width: `${probabilities.white * 100}%` }}>White</div></div><p className="mt-3 font-sans text-xs text-white/65">Refreshes from the latest official match odds every 10 seconds.</p></>}</section><div className="mt-6 grid gap-5 lg:grid-cols-2"><LiveTeamList title="Maroon" rows={maroon} maroon /><LiveTeamList title="White" rows={white} maroon={false} /></div></main>;
}
