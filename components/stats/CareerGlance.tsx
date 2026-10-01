import type { PlayerYearStats } from "@/lib/data/stats";
import { fmtNum, fmtPct, sumIfAny } from "@/lib/data/stats/careerColumns";

const CHART_LABELS: [number, number, string][] = [[100, 25, "Score"], [171, 77, "Fairways"], [145, 169, "Greens"], [55, 169, "Up & Down"], [29, 77, "Putting"]];
const pentagon = (radius: number) => [0, 1, 2, 3, 4].map((index) => {
  const angle = (-Math.PI / 2) + (index * Math.PI * 2) / 5;
  return `${100 + Math.cos(angle) * radius},${100 + Math.sin(angle) * radius}`;
});

/**
 * "Performance at a glance": the five-point chart plus four headline tiles.
 * Shown on the website's player stats page (tone "light") and the My Profile
 * Stats tab (tone "dark"). "Latest season" is the last entry in yearStats.
 */
export function CareerGlance({ yearStats, tone = "light" }: { yearStats: { year: number; stats: PlayerYearStats | null }[]; tone?: "light" | "dark" }) {
  const latest = yearStats.at(-1)?.stats;
  const careerPoints = sumIfAny(yearStats.map((year) => year.stats?.teamPointsWon));
  const chartValues = [
    Math.max(0, Math.min(100, (95 - (latest?.scoringAverage ?? 95)) * 5)),
    latest?.firPct ?? 0,
    latest?.girPct ?? 0,
    latest?.upAndDown?.pct ?? 0,
    Math.max(0, Math.min(100, 50 + (latest?.strokesGained?.putting ?? 0) * 12)),
  ];
  const chartPoints = chartValues.map((value, index) => {
    const angle = (-Math.PI / 2) + (index * Math.PI * 2) / chartValues.length;
    const radius = 62 * (value / 100);
    return `${100 + Math.cos(angle) * radius},${100 + Math.sin(angle) * radius}`;
  }).join(" ");
  const dark = tone === "dark";

  return (
    <section className="grid gap-4 lg:grid-cols-[1.25fr_0.9fr]">
      <div className={`rounded-2xl p-5 text-white shadow-sm sm:p-6 ${dark ? "border border-cream-50/15 bg-maroon-900" : "bg-maroon-800"}`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-gold-200">Career profile</p><h2 className="mt-1 font-serif text-2xl font-bold">Performance at a glance</h2></div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/85">{yearStats.length} seasons</span>
        </div>
        <div className="mt-2 flex items-center justify-center">
          <svg viewBox="0 0 200 200" className="h-56 w-56 overflow-visible" aria-label="Five-category performance graphic">
            {[62, 42, 22].map((radius) => <polygon key={radius} points={pentagon(radius).join(" ")} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1" />)}
            {pentagon(62).map((point) => { const [x2, y2] = point.split(","); return <line key={point} x1="100" y1="100" x2={x2} y2={y2} stroke="rgba(255,255,255,.25)" strokeWidth="1" />; })}
            <polygon points={chartPoints} fill="rgba(213,171,82,.45)" stroke="rgb(246,210,120)" strokeWidth="2" />
            {CHART_LABELS.map(([x, y, label]) => <text key={label} x={x} y={y} textAnchor="middle" className="fill-white text-[9px] font-semibold">{label}</text>)}
          </svg>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Scoring avg.", latest?.scoringAverage != null ? fmtNum(latest.scoringAverage) : "—", "Latest season"],
          ["Career points", careerPoints != null ? fmtNum(careerPoints) : "—", "All tournaments"],
          ["Fairways", latest?.firPct != null ? fmtPct(latest.firPct) : "—", "Latest season"],
          ["Greens", latest?.girPct != null ? fmtPct(latest.girPct) : "—", "Latest season"],
        ].map(([label, value, note]) => (
          <div key={label} className={`flex min-h-36 flex-col justify-between rounded-xl border p-4 shadow-sm ${dark ? "border-cream-50/15 bg-maroon-900" : "border-stone-300 bg-white"}`}>
            <p className={`font-condensed text-2xs font-semibold uppercase tracking-[0.14em] ${dark ? "text-cream-50/60" : "text-ink-500"}`}>{label}</p>
            <p className={`font-serif text-3xl font-bold ${dark ? "text-gold-300" : "text-ink-900"}`}>{value}</p>
            <p className={`font-sans text-xs ${dark ? "text-cream-50/60" : "text-ink-500"}`}>{note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
