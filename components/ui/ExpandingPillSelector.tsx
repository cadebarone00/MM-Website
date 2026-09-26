"use client";

import { useEffect, useRef, useState } from "react";

export type ExpandingPillSelectorItem<T extends string | number> = {
  value: T;
  label: string;
};

export function ExpandingPillSelector<T extends string | number>({
  activeLabel,
  items,
  activeValue,
  onSelect,
  expandedMaxWidth = "max-w-40",
}: {
  activeLabel: string;
  items: ExpandingPillSelectorItem<T>[];
  activeValue: T;
  onSelect: (value: T) => void;
  expandedMaxWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeWhenClickedOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeWhenClickedOutside);
    return () => document.removeEventListener("mousedown", closeWhenClickedOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="inline-flex rounded-pill border border-gold-400 bg-cream-50 p-[3px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-pill bg-maroon-700 px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide text-cream-50"
      >
        {activeLabel}
      </button>
      <div className={["flex overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out", open ? `ml-1 ${expandedMaxWidth} opacity-100` : "max-w-0 opacity-0"].join(" ")}>
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={item.value === activeValue}
            onClick={() => {
              onSelect(item.value);
              setOpen(false);
            }}
            className={[
              "shrink-0 rounded-pill px-3 py-1 font-condensed text-2xs font-bold tabular-nums transition-colors",
              item.value === activeValue ? "bg-maroon-700 text-cream-50" : "text-ink-500 hover:bg-cream-100",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
