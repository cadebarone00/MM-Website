"use client";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import { roundStats } from "@/lib/profile/roundStats";
import { CompareRings } from "./CompareRings";

/**
 * Profile → Stats: every stat the rounds support (lib/profile/roundStats.ts), as tiles, one score-trend line, simple
 * single-colour bars and meters. Sections without data (e.g. putting when no round kept stats) are left out.
 */

const card = "rounded-2xl border border-maroon-900/12 bg-white p-4 shadow-[0_1px_2px_rgba(29,11,17,.05)]";
const heading = "m-0 font-condensed text-xs font-semibold uppercase tracking-[0.14em] text-maroon-700";

export function ProfileStats({ rounds, isOwner }: { rounds: ProfileHistoryRound[]; isOwner: boolean }) {
  const stats = roundStats(rounds);
  if (!stats) return <p className="px-4 py-5 text-center text-cream-50/70">{isOwner ? "Stats will show here once you finish rounds." : "No stats to show yet."}</p>;
  const showsHoleStats = stats.putting || stats.driving || stats.approach || stats.scrambling;
  return <section aria-label="Round stats" className="grid gap-3">
    <div>
      <StatRow label="Headline stats" items={[
        ["Handicap", stats.handicapIndex === null ? "—" : stats.handicapIndex.toFixed(1)],
        ["Scoring Avg.", stats.average18 === null ? "—" : stats.average18.toFixed(1)],
        ["Scoring Avg adj", stats.adjustedAverage18 === null ? "—" : stats.adjustedAverage18.toFixed(1)],
        ["Low Score", stats.best18 ? String(stats.best18.total) : "—"],
      ]} />
      <hr className="m-0 border-0 border-t border-cream-50/15" />
      {/* Average strokes on each par; "—" when no hole of that par has a score yet. */}
      <StatRow label="Scoring by par" items={([3, 4, 5] as const).map((par) => {
        const p = stats.byPar.find((entry) => entry.par === par);
        return [`Par ${par}s`, p ? p.average.toFixed(2) : "—"];
      })} />
    </div>
    {isOwner && <CompareRings mine={stats} />}
    {showsHoleStats && <div className={card}>
      <h3 className={heading}>Tee to green</h3>
      <div className="mt-3 grid gap-3">
        {stats.driving && <Meter label="Fairways hit" value={stats.driving.fairwayPct} note={`${stats.driving.missLeftPct !== null ? `Misses left ${stats.driving.missLeftPct}% · right ${stats.driving.missRightPct}% · ` : ""}${stats.driving.holes} drives`} />}
        {stats.approach && <Meter label="Greens in regulation" value={stats.approach.girPct} note={`${stats.approach.holes} holes`} />}
        {stats.scrambling && <Meter label="Scrambling" value={stats.scrambling.pct} note={`Par or better after missing the green · ${stats.scrambling.chances} chances`} />}
      </div>
      {stats.putting && <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-maroon-900/10 pt-3 text-center">
        <div><dt className="text-xs text-maroon-900/60">Putts / round</dt><dd className="m-0 font-serif text-xl font-bold">{stats.putting.perRound}</dd></div>
        <div><dt className="text-xs text-maroon-900/60">1-putts</dt><dd className="m-0 font-serif text-xl font-bold">{stats.putting.onePuttPct}%</dd></div>
        <div><dt className="text-xs text-maroon-900/60">3-putts</dt><dd className="m-0 font-serif text-xl font-bold">{stats.putting.threePuttPct}%</dd></div>
      </dl>}
    </div>}
    {stats.courses.length > 0 && <div className={card}>
      <h3 className={heading}>Most played</h3>
      <ol className="mt-2">
        {stats.courses.map((c) => <li key={c.name} className="flex items-baseline justify-between gap-3 border-t border-maroon-900/10 py-2.5 first:border-t-0">
          <span className="min-w-0 truncate font-semibold">{c.name}</span>
          <span className="shrink-0 text-sm text-maroon-900/65">{c.rounds} {c.rounds === 1 ? "round" : "rounds"}{c.best !== null && <> · best <b className="text-maroon-900">{c.best}</b></>}</span>
        </li>)}
      </ol>
    </div>}
  </section>;
}

/** A row of stats: the words on one line, each number under its word (no boxes). "—" = not enough rounds yet. */
function StatRow({ label, items }: { label: string; items: [string, string][] }) {
  return <dl className={`grid gap-2 py-3 text-center text-cream-50 ${items.length === 4 ? "grid-cols-4" : "grid-cols-3"}`} aria-label={label}>
    {items.map(([label, value]) => <div key={label} className="flex min-w-0 flex-col items-center gap-1">
      <dt className="whitespace-nowrap font-condensed text-xs text-cream-50/70">{label}</dt>
      <dd className="m-0 font-serif text-xl font-bold leading-none">{value}</dd>
    </div>)}
  </dl>;
}

function Meter({ label, value, note }: { label: string; value: number; note: string }) {
  return <div>
    <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">{label}</span><span className="font-serif text-xl font-bold tabular-nums">{value}%</span></div>
    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-maroon-900/8" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span className="block h-full rounded-full bg-maroon-700" style={{ width: `${value}%` }} /></div>
    <p className="m-0 mt-1 text-xs text-maroon-900/55">{note}</p>
  </div>;
}
