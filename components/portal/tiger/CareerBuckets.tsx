import type { CareerHoleRecord } from "@/lib/data/careerStats";

type Bucket = { label: string; rows: CareerHoleRecord[] };

function yardageBucket(yards: number) {
  if (yards <= 150) return "≤150";
  if (yards <= 200) return "151–200";
  if (yards <= 250) return "201–250";
  if (yards <= 350) return "251–350";
  if (yards <= 400) return "351–400";
  if (yards <= 450) return "401–450";
  if (yards <= 500) return "451–500";
  return "501+";
}

function group(rows: CareerHoleRecord[], key: (row: CareerHoleRecord) => string): Bucket[] {
  const map = new Map<string, CareerHoleRecord[]>();
  rows.forEach((row) => map.set(key(row), [...(map.get(key(row)) ?? []), row]));
  return [...map.entries()].map(([label, values]) => ({ label, rows: values })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function BucketTable({ title, buckets }: { title: string; buckets: Bucket[] }) {
  return <section className="overflow-x-auto rounded-sm border border-gold-200 bg-white"><h3 className="border-b border-gold-200 px-3 py-2 font-condensed text-sm font-bold uppercase tracking-wide text-ink-800">{title}</h3><table className="min-w-full text-left font-sans text-xs"><thead className="bg-cream-100 text-ink-500"><tr><th className="px-3 py-2">Bucket</th><th className="px-3 py-2">Holes</th><th className="px-3 py-2">Avg.</th><th className="px-3 py-2">To Par</th><th className="px-3 py-2">Birdie %</th><th className="px-3 py-2">FIR %</th><th className="px-3 py-2">GIR %</th><th className="px-3 py-2">Putts</th><th className="px-3 py-2">Pen.</th></tr></thead><tbody>{buckets.map(({ label, rows }) => { const holes = rows.length; const average = rows.reduce((sum, row) => sum + row.score, 0) / holes; const toPar = rows.reduce((sum, row) => sum + row.score - row.par, 0) / holes; const fir = rows.filter((row) => row.fairwayInRegulation != null); const gir = rows.filter((row) => row.greenInRegulation != null); const putts = rows.filter((row) => row.putts != null); return <tr key={label} className="border-t border-gold-100"><td className="px-3 py-2 font-semibold">{label}</td><td className="px-3 py-2">{holes}</td><td className="px-3 py-2">{average.toFixed(3)}</td><td className="px-3 py-2">{toPar > 0 ? `+${toPar.toFixed(3)}` : toPar.toFixed(3)}</td><td className="px-3 py-2">{((rows.filter((row) => row.score - row.par === -1).length / holes) * 100).toFixed(1)}%</td><td className="px-3 py-2">{fir.length ? `${((fir.filter((row) => row.fairwayInRegulation).length / fir.length) * 100).toFixed(1)}%` : "—"}</td><td className="px-3 py-2">{gir.length ? `${((gir.filter((row) => row.greenInRegulation).length / gir.length) * 100).toFixed(1)}%` : "—"}</td><td className="px-3 py-2">{putts.length ? (putts.reduce((sum, row) => sum + (row.putts ?? 0), 0) / putts.length).toFixed(2) : "—"}</td><td className="px-3 py-2">{rows.reduce((sum, row) => sum + (row.penalties ?? 0), 0)}</td></tr>; })}</tbody></table></section>;
}

export function CareerBuckets({ records }: { records: CareerHoleRecord[] }) {
  return <div className="mt-3 grid gap-4"><p className="m-0 font-sans text-xs text-ink-500">These standardized buckets are calculated directly from the player&apos;s archived 18-hole records and are the exact feature groups the model can query.</p><BucketTable title="By format" buckets={group(records, (row) => row.format)} /><BucketTable title="By course" buckets={group(records, (row) => row.course)} /><div className="grid gap-4 xl:grid-cols-2"><BucketTable title="By par" buckets={group(records, (row) => `Par ${row.par}`)} /><BucketTable title="By yardage" buckets={group(records, (row) => yardageBucket(row.yards))} /></div><BucketTable title="By course side" buckets={group(records, (row) => row.hole <= 9 ? "Front 9" : "Back 9")} /></div>;
}
