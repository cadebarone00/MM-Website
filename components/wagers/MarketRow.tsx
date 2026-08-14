import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * One plain, clickable row in a Wagers category list — no box, no border
 * of its own. Rows are separated by the parent's `divide-y`. Tapping one
 * navigates to that market's own page to pick a side and stake.
 */
export function MarketRow({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 py-4 first:pt-0">
      <span className="font-sans text-sm font-semibold text-ink-900">{label}</span>
      <ChevronRight size={18} className="shrink-0 text-ink-300" />
    </Link>
  );
}
