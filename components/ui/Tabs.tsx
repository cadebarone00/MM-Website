"use client";

import { useState } from "react";

export interface TabItem {
  value: string;
  label: string;
  badge?: number;
}

interface TabsProps {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  variant?: "underline" | "pill";
}

export function Tabs({ items, value, onChange, variant = "underline" }: TabsProps) {
  const [internal, setInternal] = useState(value ?? items[0]?.value);
  const active = value !== undefined ? value : internal;
  const select = (v: string) => {
    if (value === undefined) setInternal(v);
    onChange?.(v);
  };

  if (variant === "pill") {
    return (
      <div className="inline-flex gap-[2px] p-1 bg-cream-100 border border-ink-100 rounded-md">
        {items.map((it) => {
          const on = it.value === active;
          return (
            <button
              key={it.value}
              type="button"
              onClick={() => select(it.value)}
              className={[
                "inline-flex items-center gap-[6px] px-4 py-[7px] rounded-sm font-condensed text-xs font-semibold tracking-wide uppercase transition-[background,color] duration-200 cursor-pointer",
                on ? "bg-maroon-700 text-cream-50" : "bg-transparent text-ink-500 hover:text-maroon-700",
              ].join(" ")}
            >
              {it.label}
              {it.badge != null && <span className="text-[10px] opacity-80 tabular-nums">{it.badge}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="tablist" className="flex gap-6 border-b border-ink-200">
      {items.map((it) => {
        const on = it.value === active;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => select(it.value)}
            className={[
              "inline-flex items-center gap-[7px] pb-3 -mb-px font-condensed text-sm font-semibold tracking-wide uppercase border-b-2 transition-colors duration-200 cursor-pointer",
              on ? "text-maroon-700 border-maroon-700" : "text-ink-500 border-transparent hover:text-maroon-600",
            ].join(" ")}
          >
            {it.label}
            {it.badge != null && (
              <span
                className={[
                  "text-[10px] px-[6px] py-[1px] rounded-pill tabular-nums",
                  on ? "bg-maroon-100 text-maroon-700" : "bg-ink-100 text-ink-400",
                ].join(" ")}
              >
                {it.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
