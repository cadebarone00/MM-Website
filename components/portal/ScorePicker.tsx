"use client";

import { useEffect, useRef } from "react";

/** Standard scorecard notation: circle = birdie, box = bogey, doubled = 2-or-more either way. */
function bubbleShape(score: number, par: number): { shape: "circle" | "box" | "plain"; doubled: boolean } {
  const diff = score - par;
  if (diff <= -2) return { shape: "circle", doubled: true };
  if (diff === -1) return { shape: "circle", doubled: false };
  if (diff === 1) return { shape: "box", doubled: false };
  if (diff >= 2) return { shape: "box", doubled: true };
  return { shape: "plain", doubled: false };
}

function ScoreBubble({ score, par, selected }: { score: number; par: number; selected: boolean }) {
  const { shape, doubled } = bubbleShape(score, par);
  const radiusClass = shape === "circle" ? "rounded-full" : shape === "box" ? "rounded-md" : "rounded-md";
  const ringClass = shape === "plain" ? "border-transparent" : selected ? "border-maroon-700" : "border-ink-300";
  const inner = (
    <span
      className={`flex h-14 w-14 items-center justify-center border-2 ${radiusClass} ${ringClass} font-sans text-2xl font-bold ${selected ? "bg-maroon-700 text-white" : "bg-white text-ink-800"}`}
    >
      {score}
    </span>
  );
  if (!doubled) return inner;
  return (
    <span className={`flex h-[4.25rem] w-[4.25rem] items-center justify-center border-2 ${radiusClass} ${selected ? "border-maroon-700" : "border-ink-300"} p-0.5`}>
      {inner}
    </span>
  );
}

/**
 * Horizontal scorecard-style strip: par-relative bubbles (circle=birdie,
 * box=bogey, doubled=2-or-more), score capped at double par. The selected
 * score always sits centered — tap any bubble or swipe the strip to it.
 */
export function ScorePicker({
  value,
  onChange,
  par,
  ariaLabel,
  disabled,
}: {
  value: number | null;
  onChange: (score: number) => void;
  par: number;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const min = 1;
  const max = par * 2;
  const scores = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);

  useEffect(() => {
    if (value == null) return;
    itemRefs.current.get(value)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [value, par]);

  function handleScroll() {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const centerX = container.getBoundingClientRect().left + container.getBoundingClientRect().width / 2;
      let closest: number | null = null;
      let closestDistance = Infinity;
      for (const [score, el] of itemRefs.current) {
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - centerX);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = score;
        }
      }
      if (closest != null && closest !== value) onChange(closest);
    }, 120);
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      role="group"
      aria-label={ariaLabel}
      className="flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-[calc(50%-1.75rem)] py-2"
    >
      {scores.map((score) => {
        const selected = value === score;
        return (
          <button
            key={score}
            ref={(el) => {
              if (el) itemRefs.current.set(score, el);
              else itemRefs.current.delete(score);
            }}
            type="button"
            disabled={disabled}
            onClick={() => onChange(score)}
            aria-pressed={selected}
            className="shrink-0 snap-center disabled:opacity-50"
          >
            <ScoreBubble score={score} par={par} selected={selected} />
          </button>
        );
      })}
    </div>
  );
}
