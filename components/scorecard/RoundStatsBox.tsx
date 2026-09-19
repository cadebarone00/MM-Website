export interface RoundStat {
  label: string;
  value: string;
  /** Small line under the value, e.g. "9/14" under a fairway percentage. */
  note?: string;
}

function Stat({ label, value, note }: RoundStat) {
  return <div className="min-w-0 border-r border-gold-100 px-2 text-center last:border-r-0 sm:px-3"><p className="m-0 font-condensed text-[9px] font-bold uppercase tracking-wide text-ink-500">{label}</p><p className="m-0 mt-0.5 font-sans text-sm font-black tabular-nums text-ink-900">{value}</p>{note && <p className="m-0 text-[9px] leading-3 text-ink-500">{note}</p>}</div>;
}

/** The five-across round summary box (score, to par, fairways, greens, putts...) — shared by the player profiles' archived rounds and the handicap Scorecard so they always look identical. */
export function RoundStatsBox({ stats }: { stats: RoundStat[] }) {
  return <div className="grid grid-cols-5 rounded-sm border border-gold-200 bg-white py-2">{stats.map((stat) => <Stat key={stat.label} {...stat} />)}</div>;
}
