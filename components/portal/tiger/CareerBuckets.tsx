import type { CareerHoleRecord } from "@/lib/data/careerStats";
import { canonicalCourseName } from "@/lib/data/canonicalCourse";

type Bucket = { label: string; rows: CareerHoleRecord[] };

// Measure 2's permanent bucket definitions. These are intentionally fixed so
// a bucket always means the same thing in the Career Stats page and the model.
const tenYardRanges = Array.from({ length: 55 }, (_, index) => {
  const start = 101 + index * 10;
  return { start, end: start + 9, label: `${start}-${start + 9}` };
});

function group(rows: CareerHoleRecord[], key: (row: CareerHoleRecord) => string): Bucket[] {
  const map = new Map<string, CareerHoleRecord[]>();
  rows.forEach((row) => map.set(key(row), [...(map.get(key(row)) ?? []), row]));
  return [...map.entries()]
    .map(([label, values]) => ({ label, rows: values }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function tenYardBuckets(rows: CareerHoleRecord[]): Bucket[] {
  return tenYardRanges.map(({ start, end, label }) => ({
    label,
    rows: rows.filter((row) => row.yards >= start && row.yards <= end),
  }));
}

function BucketTable({ title, buckets }: { title: string; buckets: Bucket[] }) {
  return <section className="overflow-x-auto rounded-sm border border-gold-200 bg-white">
    <h3 className="border-b border-gold-200 px-3 py-2 font-condensed text-sm font-bold uppercase tracking-wide text-ink-800">{title}</h3>
    <table className="min-w-full text-left font-sans text-xs">
      <thead className="bg-cream-100 text-ink-500"><tr><th className="px-3 py-2">Bucket</th><th className="px-3 py-2">Holes</th><th className="px-3 py-2">Avg.</th><th className="px-3 py-2">To Par</th><th className="px-3 py-2">Birdie %</th><th className="px-3 py-2">FIR %</th><th className="px-3 py-2">GIR %</th><th className="px-3 py-2">Putts</th><th className="px-3 py-2">Pen.</th></tr></thead>
      <tbody>{buckets.map(({ label, rows }) => {
        const holes = rows.length;
        const average = holes ? rows.reduce((sum, row) => sum + row.score, 0) / holes : null;
        const toPar = holes ? rows.reduce((sum, row) => sum + row.score - row.par, 0) / holes : null;
        const fir = rows.filter((row) => row.fairwayInRegulation != null);
        const gir = rows.filter((row) => row.greenInRegulation != null);
        const putts = rows.filter((row) => row.putts != null);
        return <tr key={label} className="border-t border-gold-100"><td className="px-3 py-2 font-semibold">{label}</td><td className="px-3 py-2">{holes}</td><td className="px-3 py-2">{average == null ? "—" : average.toFixed(3)}</td><td className="px-3 py-2">{toPar == null ? "—" : toPar > 0 ? `+${toPar.toFixed(3)}` : toPar.toFixed(3)}</td><td className="px-3 py-2">{holes ? `${((rows.filter((row) => row.score - row.par === -1).length / holes) * 100).toFixed(1)}%` : "—"}</td><td className="px-3 py-2">{fir.length ? `${((fir.filter((row) => row.fairwayInRegulation).length / fir.length) * 100).toFixed(1)}%` : "—"}</td><td className="px-3 py-2">{gir.length ? `${((gir.filter((row) => row.greenInRegulation).length / gir.length) * 100).toFixed(1)}%` : "—"}</td><td className="px-3 py-2">{putts.length ? (putts.reduce((sum, row) => sum + (row.putts ?? 0), 0) / putts.length).toFixed(2) : "—"}</td><td className="px-3 py-2">{holes ? rows.reduce((sum, row) => sum + (row.penalties ?? 0), 0) : "—"}</td></tr>;
      })}</tbody>
    </table>
  </section>;
}

export function CareerBuckets({ records }: { records: CareerHoleRecord[] }) {
  const individualBallRecords = records.filter((row) => row.roundHoles === 18 && (row.format === "Singles" || row.format === "Fourball"));
  return <div className="mt-3 grid gap-4">
    <p className="m-0 font-sans text-xs text-ink-500">Measure 2: fixed 10-yard individual-ball scoring buckets. Every completed Singles and Fourball hole from this player&apos;s Career Archive is counted; par does not affect bucket membership. Empty buckets remain visible so the model can identify sparse data.</p>
    <BucketTable title="Measure 2 — 10-yard scoring buckets (101–650 yards)" buckets={tenYardBuckets(individualBallRecords)} />
    <BucketTable title="By format" buckets={group(records, (row) => row.format)} />
    <BucketTable title="By course" buckets={group(records, (row) => canonicalCourseName(row.course))} />
    <div className="grid gap-4 xl:grid-cols-2"><BucketTable title="By par" buckets={group(records, (row) => `Par ${row.par}`)} /></div>
    <BucketTable title="By course side" buckets={group(records, (row) => row.hole <= 9 ? "Front 9" : "Back 9")} />
  </div>;
}
