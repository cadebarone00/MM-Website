"use client";

import { useState } from "react";

export function ShotVideoPanel({ shotCount }: { shotCount: number }) {
  const shots = Array.from({ length: shotCount }, (_, i) => i + 1);
  const [selected, setSelected] = useState<number>(1);

  return (
    <div>
      <div className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400 mb-2">Shot-by-Shot Video</div>
      <div className="flex flex-wrap gap-2 mb-4">
        {shots.map((shot) => {
          const on = shot === selected;
          return (
            <button
              key={shot}
              type="button"
              onClick={() => setSelected(shot)}
              className={[
                "inline-flex items-center justify-center w-9 h-9 rounded-pill font-condensed text-sm font-bold tracking-wide transition-all duration-150 cursor-pointer border-[1.5px]",
                on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 bg-white text-ink-700 hover:border-maroon-600 hover:text-maroon-700",
              ].join(" ")}
            >
              {shot}
            </button>
          );
        })}
      </div>

      <div className="aspect-video w-full max-w-[640px] flex flex-col items-center justify-center gap-2 bg-ink-900 rounded-md text-cream-100">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60">
          <rect x="2" y="5" width="15" height="14" rx="2" />
          <path d="M17 9l5-3v12l-5-3" />
        </svg>
        <span className="font-condensed text-xs font-semibold tracking-wide uppercase opacity-80">Shot {selected} · Video awaiting upload</span>
        <span className="font-sans text-[11px] text-cream-200/70 max-w-[280px] text-center">
          Once footage is uploaded, it&rsquo;ll be assigned to this shot and playable right here.
        </span>
      </div>
    </div>
  );
}
