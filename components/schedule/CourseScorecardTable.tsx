import type { VenueCourse } from "@/lib/data/types";

function cell(value: number | null) {
  return value ?? "–";
}

function sum(values: (number | null)[]) {
  if (values.every((v) => v == null)) return null;
  return values.reduce((total: number, v) => total + (v ?? 0), 0);
}

export function CourseScorecardTable({ course }: { course: VenueCourse }) {
  const holes = course.holes;
  const totalPar = sum(holes.map((h) => h.par));
  const totalYards = sum(holes.map((h) => h.yards));

  return (
    <div className="overflow-x-auto rounded-md border border-ink-100 bg-cream-50">
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th scope="row" className="sticky left-0 bg-cream-50 py-2 pl-3 pr-4 text-left font-condensed text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Hole
            </th>
            {holes.map((h) => (
              <td key={h.hole} className="px-2 py-2 text-center font-condensed text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {h.hole}
              </td>
            ))}
            <td className="px-3 py-2 text-center font-condensed text-[11px] font-semibold uppercase tracking-wide text-ink-500">Total</td>
          </tr>
          <tr className="border-t border-ink-100">
            <th scope="row" className="sticky left-0 bg-cream-50 py-2 pl-3 pr-4 text-left font-sans text-xs font-bold text-ink-700">
              Par
            </th>
            {holes.map((h, i) => (
              <td key={i} className="px-2 py-2 text-center font-sans text-sm text-ink-900">
                {cell(h.par)}
              </td>
            ))}
            <td className="px-3 py-2 text-center font-sans text-sm font-bold text-ink-900">{cell(totalPar)}</td>
          </tr>
          <tr className="border-t border-ink-100">
            <th scope="row" className="sticky left-0 bg-cream-50 py-2 pl-3 pr-4 text-left font-sans text-xs font-bold text-ink-700">
              Yards
            </th>
            {holes.map((h, i) => (
              <td key={i} className="px-2 py-2 text-center font-sans text-sm text-ink-900">
                {cell(h.yards)}
              </td>
            ))}
            <td className="px-3 py-2 text-center font-sans text-sm font-bold text-ink-900">{cell(totalYards)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
