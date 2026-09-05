"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HoleMarkerForDiff } from "./HoleMarker";

type ArchiveHole = { hole: number; par: number; yards: number; score: number | null };
type ArchiveRound = { year: number; round: number; course: string; format: string; holes: ArchiveHole[] };

function scoreTotal(holes: ArchiveHole[]): number | null {
  return holes.length === 9 && holes.every((hole) => hole.score !== null) ? holes.reduce((total, hole) => total + (hole.score ?? 0), 0) : null;
}

// Same header-row look as CourseInfoHeader: a maroon "Hole" row, then muted
// cream rows for Yards/Par — reused here at nine-hole size instead of 18.
function InfoRow({
  label,
  variant,
  values,
  totalValue,
  first,
}: {
  label: string;
  variant: "header" | "muted";
  values: (number | string)[];
  totalValue: number | string;
  /** First row in the block gets the rounded top corners. */
  first?: boolean;
}) {
  const isHeader = variant === "header";
  const rowBg = isHeader ? "bg-maroon-700" : "bg-cream-100";
  const rowText = isHeader ? "text-white" : "text-maroon-700";
  const rowBorder = isHeader ? "border-white/15" : "border-ink-300";

  return (
    <div className={["flex border-b", rowBorder].join(" ")}>
      <div className={["flex h-8 w-[148px] shrink-0 items-center border-r pl-3", first ? "rounded-tl-2xl" : "", rowBorder, rowBg].join(" ")}>
        <span className={["font-condensed text-[10px] font-bold tracking-eyebrow uppercase", rowText].join(" ")}>{label}</span>
      </div>
      {values.map((value, index) => (
        <div key={index} className={["flex h-8 w-9 shrink-0 items-center justify-center border-r", rowBorder, rowBg].join(" ")}>
          <span className={["font-sans text-xs font-semibold tabular-nums", rowText].join(" ")}>{value}</span>
        </div>
      ))}
      <div className={["flex h-8 w-12 shrink-0 items-center justify-center border-l pl-1 pr-3", first ? "rounded-tr-2xl" : "", rowBorder, rowBg].join(" ")}>
        <span className={["font-sans text-xs font-semibold tabular-nums", rowText].join(" ")}>{totalValue}</span>
      </div>
    </div>
  );
}

function NineScorecard({ holes, label, finalTotal }: { holes: ArchiveHole[]; label: "OUT" | "IN"; finalTotal?: number | null }) {
  const nineTotal = scoreTotal(holes);
  const parTotal = holes.reduce((sum, hole) => sum + hole.par, 0);
  const yardTotal = holes.reduce((sum, hole) => sum + (hole.yards || 0), 0);
  const showFinalTotal = label === "IN";

  return (
    <div className="w-max min-w-full overflow-hidden rounded-2xl border border-ink-300 bg-cream-100">
      <InfoRow label="Hole" variant="header" values={holes.map((hole) => hole.hole)} totalValue={label} first />
      <InfoRow label="Yards" variant="muted" values={holes.map((hole) => hole.yards || "—")} totalValue={yardTotal || "—"} />
      <InfoRow label="Par" variant="muted" values={holes.map((hole) => hole.par)} totalValue={parTotal} />

      {/* Score row — same look as ScorecardRow: hole markers for eagle/birdie/bogey/etc. */}
      <div className="flex items-center bg-cream-100">
        <div className="flex h-11 w-[148px] shrink-0 items-center rounded-bl-2xl border-r border-ink-300 bg-cream-100 pl-3">
          <span className="font-condensed text-[10px] font-bold tracking-eyebrow uppercase text-maroon-700">Score</span>
        </div>
        {holes.map((hole) => (
          <div key={hole.hole} className="flex h-11 w-9 shrink-0 items-center justify-center border-r border-ink-300 bg-cream-100">
            {hole.score === null ? (
              <span className="font-sans text-xs text-maroon-300">–</span>
            ) : (
              <HoleMarkerForDiff diff={hole.score - hole.par} size={28} tone="maroon">{hole.score}</HoleMarkerForDiff>
            )}
          </div>
        ))}
        <div
          className={[
            "flex h-11 w-12 shrink-0 flex-col items-center justify-center border-ink-300 bg-cream-100 px-1",
            showFinalTotal ? "border-r" : "rounded-br-2xl border-r",
          ].join(" ")}
        >
          <span className="font-score text-sm font-bold text-maroon-700 tabular-nums leading-none">{nineTotal ?? "—"}</span>
          <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-maroon-500 leading-none mt-[2px]">{label}</span>
        </div>
        {showFinalTotal && (
          <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-br-2xl border-l border-ink-300 bg-cream-100 pl-1 pr-3">
            <span className="font-score text-lg font-extrabold text-maroon-700 tabular-nums leading-none">{finalTotal ?? "—"}</span>
            <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-maroon-500 leading-none mt-[2px]">Total</span>
          </div>
        )}
      </div>
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
          <div className="space-y-3 overflow-x-auto">
            <NineScorecard holes={front} label="OUT" />
            <NineScorecard holes={back} label="IN" finalTotal={total} />
          </div>
        </div>
      )}
    </section>
  );
}
