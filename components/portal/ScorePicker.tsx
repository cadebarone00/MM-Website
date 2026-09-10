"use client";

import { useEffect, useRef } from "react";

/** Horizontal scrollable strip of scores, replacing a plain number input. */
export function ScorePicker({
  value,
  onChange,
  min = 1,
  max = 12,
  ariaLabel,
  disabled,
}: {
  value: number | null;
  onChange: (score: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [value]);

  const scores = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex gap-2 overflow-x-auto px-1 py-1" role="group" aria-label={ariaLabel}>
      {scores.map((score) => {
        const selected = value === score;
        return (
          <button
            key={score}
            ref={selected ? selectedRef : undefined}
            type="button"
            onClick={() => onChange(score)}
            disabled={disabled}
            aria-pressed={selected}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border font-sans text-lg font-semibold transition-colors ${selected ? "border-maroon-700 bg-maroon-700 text-white" : "border-ink-200 bg-white text-ink-700"} disabled:opacity-50`}
          >
            {score}
          </button>
        );
      })}
    </div>
  );
}
