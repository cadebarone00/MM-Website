"use client";

import { useState } from "react";
import { playersOf, shortCourseName } from "@/lib/data";
import type { Tournament } from "@/lib/data";
import { CategoryPills } from "./CategoryPills";
import { ComparePicker } from "./ComparePicker";
import { DonutGauge } from "./DonutGauge";
import { ScoringSummaryChart } from "./ScoringSummaryChart";
import { PuttsPerRoundBars } from "./PuttsPerRoundBars";
import { StrokesGainedBars } from "./StrokesGainedBars";
import {
  getScoringSummary,
  fieldScoringSummary,
  getPctSeries,
  fieldPctSeries,
  getPuttsPerRound,
  fieldPuttsPerRound,
  getStrokesGained,
  fieldStrokesGained,
  type PctKind,
} from "@/lib/data/stats/tournamentStats";

type CategoryKey = "scoring" | "fir" | "gir" | "putts" | "threePutt" | "upDown" | "sg";

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "scoring", label: "Scoring Summary" },
  { key: "fir", label: "Fairways Hit %" },
  { key: "gir", label: "Greens in Regulation %" },
  { key: "putts", label: "Putts / Round" },
  { key: "threePutt", label: "3-Putt Avoidance %" },
  { key: "upDown", label: "Up & Down %" },
  { key: "sg", label: "Strokes Gained" },
];

const CATEGORY_TO_PCT_KIND: Partial<Record<CategoryKey, PctKind>> = {
  fir: "fir",
  gir: "gir",
  threePutt: "threePutt",
  upDown: "upDown",
};

function CompareLegend({ compareLabel }: { compareLabel: string }) {
  return (
    <div className="flex items-center justify-center gap-4 mb-4">
      <span className="flex items-center gap-1.5 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-600">
        <span className="h-2 w-2 rounded-full bg-maroon-600" /> Player
      </span>
      <span className="flex items-center gap-1.5 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-400">
        <span className="h-2 w-2 rounded-full bg-ink-400" /> {compareLabel}
      </span>
    </div>
  );
}

export function StatsSection({ tournament, player }: { tournament: Tournament; player: string }) {
  const [category, setCategory] = useState<CategoryKey>("scoring");
  const [compareTo, setCompareTo] = useState<string>("field");

  const others = playersOf(tournament)
    .map((p) => p.name)
    .filter((name) => name.toLowerCase() !== player.toLowerCase());
  const compareLabel = compareTo === "field" ? "Field" : compareTo;

  let content: React.ReactNode;

  if (category === "scoring") {
    const playerSummary = getScoringSummary(tournament, player);
    const compareSummary = compareTo === "field" ? fieldScoringSummary(tournament, player) : getScoringSummary(tournament, compareTo);
    content = <ScoringSummaryChart playerName={player} player={playerSummary} compareLabel={compareLabel} compare={compareSummary} />;
  } else if (category === "putts") {
    const playerRounds = getPuttsPerRound(tournament, player);
    const compareRounds = compareTo === "field" ? fieldPuttsPerRound(tournament, player) : getPuttsPerRound(tournament, compareTo);
    content = (
      <div>
        <PuttsPerRoundBars compareLabel={compareLabel} playerRounds={playerRounds} compareRounds={compareRounds} />
      </div>
    );
  } else if (category === "sg") {
    const playerSg = getStrokesGained(tournament.year, player);
    const compareSg = compareTo === "field" ? fieldStrokesGained(tournament.year, tournament, player) : getStrokesGained(tournament.year, compareTo);
    content = <StrokesGainedBars player={playerSg} compare={compareSg} compareLabel={compareLabel} />;
  } else {
    const kind = CATEGORY_TO_PCT_KIND[category]!;
    const playerSeries = getPctSeries(tournament, player, kind);
    const compareSeries = compareTo === "field" ? fieldPctSeries(tournament, player, kind) : getPctSeries(tournament, compareTo, kind);
    content = (
      <div>
        <CompareLegend compareLabel={compareLabel} />
        <div className="flex justify-center">
          <DonutGauge playerPct={playerSeries.overallPct} comparePct={compareSeries.overallPct} size="big" />
        </div>
        {playerSeries.perRound.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            {playerSeries.perRound.map((r) => {
              const c = compareSeries.perRound.find((x) => x.round === r.round);
              return (
                <div key={r.round} className="flex flex-col items-center gap-1">
                  <DonutGauge playerPct={r.pct} comparePct={c?.pct ?? null} size="mini" />
                  <span className="font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">{shortCourseName(r.course)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-serif text-2xl font-bold text-maroon-700 m-0">Statistics</h2>
        <ComparePicker players={others} value={compareTo} onChange={setCompareTo} />
      </div>

      <CategoryPills categories={CATEGORIES} selected={category} onSelect={setCategory} />

      <div className="mt-5 rounded-md border border-ink-100 bg-white p-5">{content}</div>
    </div>
  );
}
