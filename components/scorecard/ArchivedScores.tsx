"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ArchiveHole = { hole: number; par: number; yards: number; score: number | null };
type ArchiveRound = { year: number; round: number; course: string; format: string; holes: ArchiveHole[] };

function scoreTotal(holes: ArchiveHole[]): number | null {
  return holes.length === 9 && holes.every((hole) => hole.score !== null) ? holes.reduce((total, hole) => total + (hole.score ?? 0), 0) : null;
}

function NineScorecard({ holes, label, finalTotal }: { holes: ArchiveHole[]; label: "OUT" | "IN"; finalTotal?: number | null }) {
  const rows = [
    ["Hole", ...holes.map((hole) => hole.hole)],
    ["Yards", ...holes.map((hole) => hole.yards || "—")],
    ["Par", ...holes.map((hole) => hole.par)],
    ["Score", ...holes.map((hole) => hole.score ?? "—")],
  ];
  const nineTotal = scoreTotal(holes);

  return (
    <div className="overflow-x-auto rounded-md border border-ink-200">
      <table className="min-w-[650px] w-full border-collapse text-center font-condensed text-xs">
        <tbody>
          {rows.map(([rowLabel, ...values]) => (
            <tr key={String(rowLabel)} className={rowLabel === "Score" ? "bg-cream-100 font-bold text-ink-900" : "text-ink-600"}>
              <th className="w-14 border-b border-r border-ink-200 bg-maroon-700 px-2 py-1.5 text-left font-condensed text-2xs font-bold uppercase tracking-wide text-white">{rowLabel}</th>
              {values.map((value, index) => <td key={index} className="min-w-12 border-b border-r border-ink-200 px-1 py-1.5 last:border-r-0">{value}</td>)}
              {rowLabel === "Score" ? <td className="min-w-14 border-b border-ink-200 bg-gold-200 px-2 py-1.5 font-bold text-ink-900">{label} {nineTotal ?? "—"}</td> : <td className="border-b border-ink-200 bg-cream-50" />}
              {rowLabel === "Score" && label === "IN" ? <td className="min-w-16 border-b border-l border-ink-200 bg-gold-400 px-2 py-1.5 font-bold text-maroon-900">Total {finalTotal ?? "—"}</td> : rowLabel === "Score" ? null : label === "IN" ? <td className="border-b border-l border-ink-200 bg-cream-50" /> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ArchivedScores({ playerSlug }: { playerSlug: string }) {
  const [rounds, setRounds] = useState<ArchiveRound[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedRoundKey, setSelectedRoundKey] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [yearOpen, setYearOpen] = useState(false);
  const yearSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!yearOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (yearSelectorRef.current && !yearSelectorRef.current.contains(event.target as Node)) setYearOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [yearOpen]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/players/${playerSlug}/archived-scores`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        const loaded = data.rounds as ArchiveRound[];
        setRounds(loaded);
        if (loaded.length) {
          setSelectedYear(loaded[0].year);
          setSelectedRoundKey(`${loaded[0].year}:${loaded[0].round}:${loaded[0].course}`);
        }
      })
      .catch(() => !cancelled && setError("Archived scores are unavailable right now."));
    return () => { cancelled = true; };
  }, [playerSlug]);

  const years = useMemo(() => [...new Set(rounds.map((round) => round.year))].sort((a, b) => b - a), [rounds]);
  const visibleRounds = rounds.filter((round) => round.year === selectedYear);
  const selectedRound = rounds.find((round) => `${round.year}:${round.round}:${round.course}` === selectedRoundKey) ?? visibleRounds[0];
  const selectYear = (year: number) => {
    setSelectedYear(year);
    const first = rounds.find((round) => round.year === year);
    setSelectedRoundKey(first ? `${first.year}:${first.round}:${first.course}` : "");
  };

  if (!rounds.length && !error) return null;

  const front = selectedRound?.holes.filter((hole) => hole.hole <= 9) ?? [];
  const back = selectedRound?.holes.filter((hole) => hole.hole >= 10) ?? [];
  const total = scoreTotal(front) !== null && scoreTotal(back) !== null ? scoreTotal(front)! + scoreTotal(back)! : null;

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="m-0 font-serif text-2xl font-bold text-maroon-700">Archived Scores</h2>
        <p className="mt-1 font-sans text-sm text-ink-500">Completed individual scorecards from the Career Archive.</p>
      </div>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p> : selectedRound && (
        <div className="rounded-md border border-ink-100 bg-white p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div ref={yearSelectorRef} className="flex items-center">
              <button type="button" aria-expanded={yearOpen} onClick={() => setYearOpen((open) => !open)} className="rounded-pill bg-maroon-700 px-3 py-1.5 font-condensed text-xs font-bold text-cream-50">
                {selectedYear}
              </button>
              <div className={["flex overflow-hidden transition-[max-width,opacity,margin] duration-200", yearOpen ? "ml-1 max-w-40 opacity-100" : "max-w-0 opacity-0"].join(" ")}>
                {years.map((year) => <button key={year} type="button" onClick={() => { selectYear(year); setYearOpen(false); }} className={year === selectedYear ? "shrink-0 rounded-pill bg-maroon-700 px-3 py-1.5 font-condensed text-xs font-bold text-cream-50" : "shrink-0 rounded-pill px-3 py-1.5 font-condensed text-xs font-bold text-ink-500 hover:bg-cream-100"}>{year}</button>)}
              </div>
            </div>
            <label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">
              Round
              <select value={selectedRoundKey} onChange={(event) => setSelectedRoundKey(event.target.value)} className="mt-1 block w-full min-w-56 rounded-sm border border-ink-300 bg-white px-3 py-2 font-sans text-sm font-semibold normal-case tracking-normal text-ink-900 sm:w-auto">
                {visibleRounds.map((round) => <option key={`${round.year}:${round.round}:${round.course}`} value={`${round.year}:${round.round}:${round.course}`}>Round {round.round} · {round.course}</option>)}
              </select>
            </label>
          </div>
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500"><span>{selectedRound.course}</span><span>{selectedRound.format}</span></div>
          <div className="space-y-3">
            <NineScorecard holes={front} label="OUT" />
            <NineScorecard holes={back} label="IN" finalTotal={total} />
          </div>
        </div>
      )}
    </section>
  );
}
