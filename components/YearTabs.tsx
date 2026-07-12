import Link from "next/link";
import { pastTournaments, nextTournament, isLiveNow } from "@/lib/data";

export function YearTabs({ basePath, activeSlug, includeLive = false }: { basePath: string; activeSlug: string; includeLive?: boolean }) {
  const items = [
    ...pastTournaments.map((t) => ({ slug: t.slug, label: String(t.year) })),
    ...(includeLive ? [{ slug: nextTournament.slug, label: isLiveNow() ? `${nextTournament.year} · Live` : `${nextTournament.year}` }] : []),
  ];

  return (
    <div className="inline-flex gap-[2px] p-1 bg-cream-100 border border-ink-100 rounded-md mb-3 sm:mb-6">
      {items.map((it) => {
        const on = it.slug === activeSlug;
        return (
          <Link
            key={it.slug}
            href={`${basePath}/${it.slug}`}
            className={[
              "inline-flex items-center px-2.5 py-1 rounded-sm font-condensed text-[10px] font-semibold tracking-wide uppercase transition-colors duration-200 sm:px-4 sm:py-[7px] sm:text-xs",
              on ? "bg-maroon-700 text-cream-50" : "bg-transparent text-ink-500 hover:text-maroon-700",
            ].join(" ")}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
