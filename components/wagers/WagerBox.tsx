import type { ReactNode } from "react";

/**
 * Shared "market card" shell used across every Wagers category page — icon
 * badge + eyebrow title + whatever outcome rows the caller renders inside.
 * Gives every category the same Kalshi-style card look instead of each
 * market component defining its own border/padding.
 */
export function WagerBox({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-100 border-l-4 border-l-gold-400 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-maroon-50 text-maroon-700">
          {icon}
        </span>
        <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">{title}</p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
