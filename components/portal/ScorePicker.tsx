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

/** Always shows its own par-relative shape — selection is shown by the picker's fixed center box, not by recoloring the bubble. */
function ScoreBubble({ score, par, tone }: { score: number; par: number; tone: "light" | "maroon" }) {
  const { shape, doubled } = bubbleShape(score, par);
  const radiusClass = shape === "circle" ? "rounded-full" : "rounded-md";
  const borderClass = shape === "plain" ? "border-transparent" : tone === "maroon" ? "border-white/60" : "border-ink-300";
  const inner = (
    <span className={`flex h-16 w-16 items-center justify-center border-[3px] ${radiusClass} ${borderClass} font-sans text-3xl font-bold ${tone === "maroon" ? "text-white" : "text-ink-900"}`}>
      {score}
    </span>
  );
  if (!doubled) return inner;
  return (
    <span className={`flex h-20 w-20 items-center justify-center border-[3px] ${radiusClass} ${tone === "maroon" ? "border-white/60" : "border-ink-300"} p-0.5`}>
      {inner}
    </span>
  );
}

/**
 * Horizontal scorecard-style strip: par-relative bubbles (circle=birdie,
 * box=bogey, doubled=2-or-more), with an entry option for scores over 20. A
 * translucent maroon box stays fixed in the center — swipe the strip or tap
 * a bubble to slide that score into it; the bubble keeps its own shape
 * either way.
 */
export function ScorePicker({
  value,
  onChange,
  par,
  ariaLabel,
  disabled,
  tone = "light",
}: {
  value: number | null;
  onChange: (score: number) => void;
  par: number;
  ariaLabel: string;
  disabled?: boolean;
  tone?: "light" | "maroon";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const min = 1;
  const max = 20;
  const scores = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  if (value != null && value > max) scores.push(value);

  useEffect(() => {
    if (value == null) return;
    const container = containerRef.current;
    const item = itemRefs.current.get(value);
    if (container && item) container.scrollTo({ left: item.offsetLeft + item.offsetWidth / 2 - container.clientWidth / 2, behavior: "instant" });
  }, [value, par]);

  useEffect(() => () => { if (scrollTimeout.current) clearTimeout(scrollTimeout.current); }, []);

  function handleScroll() {
    if (disabled) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const container = containerRef.current;
      if (!container || disabled) return;
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
    <div className="relative mx-auto w-full max-w-[420px]">
      <div aria-hidden className={`pointer-events-none absolute left-1/2 top-1/2 z-0 h-28 w-[calc(100%/3-8px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl ring-2 ${tone === "maroon" ? "bg-white/20 ring-white/50" : "bg-maroon-700/25 ring-maroon-700/40"}`} />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="group"
        aria-label={ariaLabel}
        className="relative z-10 flex snap-x snap-mandatory items-center overflow-x-auto py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden before:w-1/3 before:shrink-0 before:content-[''] after:w-1/3 after:shrink-0 after:content-['']"
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
              className="flex h-20 w-1/3 shrink-0 snap-center items-center justify-center disabled:opacity-50"
            >
              <ScoreBubble score={score} par={par} tone={tone} />
            </button>
          );
        })}
        <button type="button" disabled={disabled} className="w-1/3 shrink-0 snap-center text-sm underline" onClick={() => {
          const entered = window.prompt("Enter the actual number of strokes for this hole:", String(value ?? par));
          if (entered === null) return;
          const score = Number(entered);
          if (Number.isSafeInteger(score) && score > 0 && score <= 2147483647) onChange(score);
        }}>Other score</button>
      </div>
    </div>
  );
}
