"use client";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import { roundStats, type RoundStats } from "@/lib/profile/roundStats";
import { CompareRings } from "./CompareRings";

/**
 * Profile → Stats: every stat the rounds support (lib/profile/roundStats.ts), as tiles, one score-trend line, simple
 * single-colour bars and meters. Sections without data (e.g. putting when no round kept stats) are left out.
 */

const tile = "rounded-2xl border border-maroon-900/12 p-4 shadow-[0_1px_2px_rgba(29,11,17,.05)]";
const card = `${tile} bg-white`;
const heading = "m-0 font-condensed text-xs font-semibold uppercase tracking-[0.14em] text-maroon-700";
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const signed = (n: number) => n === 0 ? "E" : n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);

export function ProfileStats({ rounds, isOwner }: { rounds: ProfileHistoryRound[]; isOwner: boolean }) {
  const stats = roundStats(rounds);
  if (!stats) return <p className="px-4 py-5 text-center text-maroon-900/60">{isOwner ? "Stats will show here once you finish rounds." : "No stats to show yet."}</p>;
  const showsHoleStats = stats.putting || stats.driving || stats.approach || stats.scrambling;
  return <section aria-label="Round stats" className="grid gap-3">
    <Headline stats={stats} />
    {isOwner && <CompareRings mine={stats} />}
    {stats.byPar.length > 0 && <div className={card}>
      <h3 className={heading}>Scoring by par</h3>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {stats.byPar.map((p) => <div key={p.par} className="rounded-xl bg-cream-50 px-2 py-3">
          <dt className="font-condensed text-xs uppercase tracking-wider text-maroon-900/60">Par {p.par}s</dt>
          <dd className="m-0 font-serif text-2xl font-bold leading-tight">{p.average.toFixed(2)}</dd>
          <dd className="m-0 text-xs text-maroon-900/65">{signed(p.overPar)} · {p.holes} holes</dd>
        </div>)}
      </dl>
    </div>}
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

function Headline({ stats }: { stats: RoundStats }) {
  const tiles: { label: string; value: string; note: string }[] = [
    { label: "Handicap", value: stats.handicapIndex === null ? "—" : stats.handicapIndex.toFixed(1), note: stats.handicapIndex === null ? `${stats.countingRounds} of 3 counting rounds` : stats.lowIndex !== null ? `Low ${stats.lowIndex.toFixed(1)}` : `${stats.countingRounds} counting rounds` },
    { label: "Rounds", value: String(stats.rounds), note: [stats.eighteens && `${stats.eighteens} × 18`, stats.nines && `${stats.nines} × 9`].filter(Boolean).join(" · ") },
    { label: "18-hole avg", value: stats.average18 === null ? "—" : String(stats.average18), note: stats.average9 !== null ? `9-hole avg ${stats.average9}` : "Strokes" },
    { label: "Best 18", value: stats.best18 ? String(stats.best18.total) : "—", note: stats.best18 ? `${stats.best18.course} · ${fmtDate(stats.best18.date)}` : "No 18-hole rounds yet" },
  ];
  return <dl className="grid grid-cols-2 gap-3">
    {tiles.map((t, i) => <div key={t.label} className={`${tile} ${i === 0 ? "bg-maroon-900 text-cream-50" : "bg-white"}`}>
      <dt className={`font-condensed text-xs uppercase tracking-[0.14em] ${i === 0 ? "text-gold-300" : "text-maroon-900/60"}`}>{t.label}</dt>
      <dd className="m-0 mt-1 font-serif text-[32px] font-bold leading-none">{t.value}</dd>
      <dd className={`m-0 mt-1.5 truncate text-xs ${i === 0 ? "text-cream-50/75" : "text-maroon-900/60"}`}>{t.note}</dd>
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
