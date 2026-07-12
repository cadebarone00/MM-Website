"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import { STATS_YEARS, getCourseStatsForYear } from "@/lib/data/stats";
import type { StatsYear } from "@/lib/data/stats";
import type { Team, Tournament } from "@/lib/data/types";

type StatsView = "player" | "course";

function StatsPlayerRow({ name, team }: { name: string; team: Team }) {
  const displayName = getPlayerDisplayName(name);
  const avatar = getPlayerAvatar(name);
  const isMaroon = team === "maroon";

  return (
    <div className="flex items-center gap-4 border-b-2 border-maroon-700 py-5 sm:gap-6 sm:py-6">
      <Avatar
        src={avatar}
        name={displayName}
        team={team}
        size="xl"
        className="h-[72px] w-[72px] shrink-0 border border-ink-100 bg-white text-ink-400 sm:h-[88px] sm:w-[88px]"
      />
      <div className="min-w-0 flex-1">
        <h2 className="m-0 truncate font-sans text-xl font-extrabold text-ink-900 sm:text-2xl">{displayName}</h2>
        <div
          className={[
            "mt-1 font-condensed text-xs font-semibold uppercase tracking-wide",
            isMaroon ? "text-maroon-600" : "text-ink-500",
          ].join(" ")}
        >
          {isMaroon ? "Team Maroon" : "Team White"}
        </div>
      </div>
      <Link
        href={`/teams/stats/players/${encodeURIComponent(name.toLowerCase())}`}
        className={[
          "inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-sm border px-4 font-condensed text-xs font-semibold uppercase tracking-wide transition-colors sm:px-5",
          isMaroon
            ? "border-maroon-700 bg-maroon-700 text-cream-50 hover:bg-maroon-800"
            : "border-maroon-700 bg-white text-maroon-700 hover:bg-maroon-50",
        ].join(" ")}
      >
        Stats
      </Link>
    </div>
  );
}

function PlayerStatsColumns({ tournament }: { tournament: Tournament }) {
  const maroon = [...tournament.roster.maroon].sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b)));
  const white = [...tournament.roster.white].sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b)));

  return (
    <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
      <div>
        <div className="mb-2 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-600">Team Maroon</div>
        {maroon.map((name) => (
          <StatsPlayerRow key={name} name={name} team="maroon" />
        ))}
      </div>
      <div>
        <div className="mb-2 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Team White</div>
        {white.map((name) => (
          <StatsPlayerRow key={name} name={name} team="white" />
        ))}
      </div>
    </div>
  );
}

function RankTable<T extends { rank: number; hole: string }>({
  title,
  rows,
  valueLabel,
  formatValue,
}: {
  title: string;
  rows?: T[];
  valueLabel: string;
  formatValue: (row: T) => string;
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <div className="mb-3 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">{title}</div>
      {!rows || rows.length === 0 ? (
        <p className="font-sans text-sm text-ink-400">Not recorded for this year.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="font-condensed text-2xs uppercase tracking-wide text-ink-400">
              <th className="w-10 pb-1">#</th>
              <th className="pb-1">Hole</th>
              <th className="pb-1 text-right">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rank} className="border-t border-ink-100 font-sans text-sm text-ink-700">
                <td className="py-1 tabular-nums text-ink-400">{row.rank}</td>
                <td className="py-1">{row.hole}</td>
                <td className="py-1 text-right tabular-nums">{formatValue(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ParBucketCard({
  label,
  callout,
}: {
  label: string;
  callout?: { hardest?: { hole: string; diff: number }; easiest?: { hole: string; diff: number }; worstPerformer?: string };
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-cream-50 p-4">
      <div className="mb-2 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">{label}</div>
      {!callout ? (
        <p className="font-sans text-sm text-ink-400">Not recorded for this year.</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2 font-sans text-sm text-ink-700">
          <div>
            <dt className="font-condensed text-2xs uppercase tracking-wide text-ink-400">Hardest</dt>
            <dd>{callout.hardest ? `${callout.hardest.hole} (+${callout.hardest.diff})` : "—"}</dd>
          </div>
          <div>
            <dt className="font-condensed text-2xs uppercase tracking-wide text-ink-400">Easiest</dt>
            <dd>{callout.easiest ? `${callout.easiest.hole} (${callout.easiest.diff})` : "—"}</dd>
          </div>
          <div>
            <dt className="font-condensed text-2xs uppercase tracking-wide text-ink-400">Worst Performer</dt>
            <dd>{callout.worstPerformer ?? "—"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function CourseStatsView() {
  const [year, setYear] = useState<StatsYear>(2026);
  const course = getCourseStatsForYear(year);

  return (
    <div>
      <div className="mb-6 flex gap-2">
        {STATS_YEARS.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className={[
              "rounded-sm border px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition-colors",
              year === y ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-ink-300 bg-white text-ink-600 hover:border-maroon-400",
            ].join(" ")}
          >
            {y}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ParBucketCard label="Par 3's" callout={course?.par3} />
        <ParBucketCard label="Par 4's" callout={course?.par4} />
        <ParBucketCard label="Par 5's" callout={course?.par5} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RankTable
          title="Hole Difficulty Ranking (Score Diff.)"
          rows={course?.holeDifficulty}
          valueLabel="Diff."
          formatValue={(r) => `${(r.scoreDiff as number) >= 0 ? "+" : ""}${r.scoreDiff}`}
        />
        <RankTable
          title="Green Difficulty Ranking (GIR %)"
          rows={course?.greenDifficulty}
          valueLabel="GIR %"
          formatValue={(r) => `${r.pct}%`}
        />
        <RankTable
          title="Fairway Difficulty Ranking (FIR %)"
          rows={course?.fairwayDifficulty}
          valueLabel="FIR %"
          formatValue={(r) => `${r.pct}%`}
        />
        <RankTable
          title="Most 3+ Putted Greens"
          rows={course?.most3Putted}
          valueLabel="3+ Putts"
          formatValue={(r) => `${r.total}`}
        />
        <RankTable
          title="Most 1-Putted Greens"
          rows={course?.most1Putted}
          valueLabel="1-Putts"
          formatValue={(r) => `${r.total}`}
        />
      </div>
    </div>
  );
}

export function StatsTab({ tournament }: { tournament: Tournament }) {
  const [view, setView] = useState<StatsView>("player");

  return (
    <div>
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setView("player")}
          className={[
            "rounded-sm border px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition-colors",
            view === "player" ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-ink-300 bg-white text-ink-600 hover:border-maroon-400",
          ].join(" ")}
        >
          Player
        </button>
        <button
          type="button"
          onClick={() => setView("course")}
          className={[
            "rounded-sm border px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition-colors",
            view === "course" ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-ink-300 bg-white text-ink-600 hover:border-maroon-400",
          ].join(" ")}
        >
          Course
        </button>
      </div>

      {view === "player" ? <PlayerStatsColumns tournament={tournament} /> : <CourseStatsView />}
    </div>
  );
}
