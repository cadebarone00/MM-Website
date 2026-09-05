"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HoleMarkerForDiff } from "./HoleMarker";

type ArchiveHole = { hole: number; par: number; yards: number; score: number | null; putts: number | null; fairwayInRegulation: boolean | null; greenInRegulation: boolean | null };
type ArchiveRound = { year: number; round: number; course: string; format: string; holes: ArchiveHole[] };

const roundKey = (round: ArchiveRound) => round.year + ":" + round.round + ":" + round.course;
function total(holes: ArchiveHole[]) { return holes.length === 18 && holes.every((hole) => hole.score !== null) ? holes.reduce((sum, hole) => sum + (hole.score ?? 0), 0) : null; }
function ScoreNine({ holes, endLabel }: { holes: ArchiveHole[]; endLabel: "OUT" | "IN" }) {
  const nine = holes.reduce((sum, hole) => sum + (hole.score ?? 0), 0);
  return <div className="grid grid-cols-10 overflow-hidden rounded-sm border border-gold-200 text-center">
    {holes.map((hole) => <div key={hole.hole} className="flex h-7 items-center justify-center border-r border-gold-100 bg-maroon-700 font-condensed text-xs font-bold text-white">{hole.hole}</div>)}
    <div className="flex h-7 items-center justify-center bg-maroon-700 font-condensed text-2xs font-bold text-white">{endLabel}</div>
    {holes.map((hole) => <div key={hole.hole} className="flex h-5 items-center justify-center border-r border-gold-100 bg-cream-100 font-sans text-[9px] font-semibold tabular-nums text-ink-500">{hole.yards || "—"}</div>)}
    <div className="flex h-5 items-center justify-center bg-cream-100 font-condensed text-[8px] font-bold uppercase text-ink-500">YDS</div>
    {holes.map((hole) => <div key={hole.hole} className="flex h-5 items-center justify-center border-r border-gold-100 bg-cream-100 font-sans text-[10px] font-bold tabular-nums text-ink-600">{hole.par}</div>)}
    <div className="flex h-5 items-center justify-center bg-cream-100 font-condensed text-[8px] font-bold uppercase text-ink-500">PAR</div>
    {holes.map((hole) => <div key={hole.hole} className="flex h-10 items-center justify-center border-r border-gold-100 bg-cream-50">{hole.score == null ? <span className="text-xs text-ink-400">—</span> : <HoleMarkerForDiff diff={hole.score - hole.par} size={26} tone="maroon">{hole.score}</HoleMarkerForDiff>}</div>)}
    <div className="flex h-10 flex-col items-center justify-center bg-cream-100"><span className="font-score text-sm font-bold text-maroon-700">{nine || "—"}</span><span className="font-condensed text-[8px] font-bold text-ink-500">SCORE</span></div>
  </div>;
}
function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="min-w-0 border-r border-gold-100 px-2 text-center last:border-r-0 sm:px-3"><p className="m-0 font-condensed text-[9px] font-bold uppercase tracking-wide text-ink-500">{label}</p><p className="m-0 mt-0.5 font-sans text-sm font-black tabular-nums text-ink-900">{value}</p>{note && <p className="m-0 text-[9px] leading-3 text-ink-500">{note}</p>}</div>;
}

export function ArchivedScores({ playerSlug }: { playerSlug: string }) {
  const [rounds, setRounds] = useState<ArchiveRound[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [yearOpen, setYearOpen] = useState(false);
  const yearRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!yearOpen) return;
    const close = (event: MouseEvent) => { if (yearRef.current && !yearRef.current.contains(event.target as Node)) setYearOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [yearOpen]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/players/" + playerSlug + "/archived-scores", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (cancelled || !data.ok) return;
      const loaded = data.rounds as ArchiveRound[]; setRounds(loaded);
      if (loaded.length) { setYear(loaded[0].year); setSelectedKey(roundKey(loaded[0])); }
    }).catch(() => !cancelled && setError("Player archives are unavailable right now."));
    return () => { cancelled = true; };
  }, [playerSlug]);
  const years = useMemo(() => [...new Set(rounds.map((round) => round.year))].sort((a, b) => b - a), [rounds]);
  const visible = rounds.filter((round) => round.year === year).sort((a, b) => a.round - b.round);
  const selected = rounds.find((round) => roundKey(round) === selectedKey) ?? visible[0];
  const chooseYear = (next: number) => { setYear(next); const first = rounds.filter((round) => round.year === next).sort((a, b) => a.round - b.round)[0]; setSelectedKey(first ? roundKey(first) : ""); };
  if (!rounds.length && !error) return null;
  if (error || !selected) return <section className="mt-8"><h2 className="m-0 font-serif text-2xl font-bold text-maroon-700">Player Archives</h2>{error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}</section>;
  const front = selected.holes.filter((hole) => hole.hole <= 9), back = selected.holes.filter((hole) => hole.hole >= 10);
  const score = total(selected.holes), par = selected.holes.reduce((sum, hole) => sum + hole.par, 0);
  const fairways = selected.holes.filter((hole) => hole.fairwayInRegulation !== null), greens = selected.holes.filter((hole) => hole.greenInRegulation !== null);
  const firHit = fairways.filter((hole) => hole.fairwayInRegulation).length, girHit = greens.filter((hole) => hole.greenInRegulation).length;
  const putts = selected.holes.reduce<number | null>((sum, hole) => sum === null || hole.putts === null ? null : sum + hole.putts, 0);
  return <section className="mt-8">
    <h2 className="m-0 font-serif text-2xl font-bold text-maroon-700">Player Archives</h2>
    <div className="mt-4">
      <p className="m-0 font-condensed text-xs font-bold uppercase tracking-wide text-ink-700">Scorecards</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div ref={yearRef} className="flex items-center"><button type="button" aria-expanded={yearOpen} onClick={() => setYearOpen((open) => !open)} className="rounded-pill bg-maroon-700 px-3 py-1.5 font-condensed text-xs font-bold text-cream-50">{year}</button><div className={["flex overflow-hidden transition-[max-width,opacity,margin] duration-200", yearOpen ? "ml-1 max-w-40 opacity-100" : "max-w-0 opacity-0"].join(" ")}>{years.map((item) => <button key={item} type="button" onClick={() => { chooseYear(item); setYearOpen(false); }} className={item === year ? "shrink-0 rounded-pill bg-maroon-700 px-3 py-1.5 font-condensed text-xs font-bold text-cream-50" : "shrink-0 rounded-pill px-3 py-1.5 font-condensed text-xs font-bold text-ink-500 hover:bg-cream-100"}>{item}</button>)}</div></div>
        <div className="flex flex-wrap gap-1">{visible.map((round) => <button type="button" key={roundKey(round)} onClick={() => setSelectedKey(roundKey(round))} className={roundKey(round) === roundKey(selected) ? "rounded-pill bg-maroon-700 px-3 py-1.5 font-condensed text-xs font-bold text-white" : "rounded-pill bg-cream-100 px-3 py-1.5 font-condensed text-xs font-bold text-ink-600 hover:bg-gold-100"}>R{round.round}</button>)}</div>
      </div>
      <p className="mt-3 mb-2 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{selected.course} <span className="mx-1 text-gold-500">·</span> {selected.format}</p>
      <div className="space-y-2"><ScoreNine holes={front} endLabel="OUT" /><ScoreNine holes={back} endLabel="IN" /></div>
    </div>
    <div className="mt-5">
      <p className="m-0 font-condensed text-xs font-bold uppercase tracking-wide text-ink-700">Stats</p>
      <div className="mt-2 grid grid-cols-5 rounded-sm border border-gold-200 bg-white py-2"><Stat label="Score" value={score === null ? "—" : String(score)} /><Stat label="To Par" value={score === null ? "—" : score === par ? "E" : score > par ? "+" + (score - par) : String(score - par)} /><Stat label="Fairways" value={fairways.length ? Math.round((firHit / fairways.length) * 100) + "%" : "—"} note={fairways.length ? firHit + "/" + fairways.length : undefined} /><Stat label="Greens" value={greens.length ? Math.round((girHit / greens.length) * 100) + "%" : "—"} note={greens.length ? girHit + "/" + greens.length : undefined} /><Stat label="Putts" value={putts === null ? "—" : String(putts)} /></div>
    </div>
  </section>;
}
