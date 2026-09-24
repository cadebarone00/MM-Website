// components/portal/tiger/YearAndMasterSettingsNav.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { SEASON_YEARS } from "@/lib/live/seasonYears";

export function YearAndMasterSettingsNav({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);

  return (
    <div>
      <label className="font-sans text-sm font-semibold text-ink-700">
        Year:{" "}
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border-2 border-stone-300 rounded-lg px-2 py-1"
        >
          {SEASON_YEARS.map((y) => (
            <option key={y} value={y}>
              {y === 2034 ? "2034 — Test Season" : y}
            </option>
          ))}
        </select>
      </label>

      <Link
        href={`/portal/admin/master-settings/${year}`}
        className="mt-4 block rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
      >
        {year === 2034 ? "2034 Test Season Setup" : `${year} Master Settings`}
      </Link>
    </div>
  );
}
