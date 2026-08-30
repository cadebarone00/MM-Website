"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function ComparePicker({
  players,
  value,
  onChange,
}: {
  players: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const label = value === "field" ? "Field" : value;

  return (
    <div ref={ref} className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-pill border border-ink-200 bg-white px-3 py-1.5 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700 cursor-pointer"
      >
        vs {label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-40 overflow-y-auto rounded-md border border-ink-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange("field");
              setOpen(false);
            }}
            className={[
              "block w-full px-3 py-2 text-left font-sans text-sm cursor-pointer hover:bg-cream-100",
              value === "field" ? "font-semibold text-maroon-700" : "text-ink-700",
            ].join(" ")}
          >
            The Field
          </button>
          {players.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className={[
                "block w-full px-3 py-2 text-left font-sans text-sm cursor-pointer hover:bg-cream-100",
                value === p ? "font-semibold text-maroon-700" : "text-ink-700",
              ].join(" ")}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
