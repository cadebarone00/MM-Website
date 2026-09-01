// components/portal/tiger/YearPicker.tsx
"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

export function YearPicker({ options, value }: { options: { slug: string; year: number }[]; value: string }) {
  const router = useRouter();
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => router.push(`?tournament=${e.target.value}`)}
        className="appearance-none rounded-lg border-2 border-stone-300 bg-white py-2 pl-3 pr-8 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-900"
      >
        {options.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.year}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" />
    </div>
  );
}
