"use client";

import { useState } from "react";

/**
 * Shot tracker: a dot per shot connected by a line that fills in as you
 * progress through them. Clicking a shot jumps to it — jumping ahead fills
 * every line before it (you "caught up"), jumping back empties every line
 * after it (that progress no longer counts as watched).
 *
 * Once real footage exists, wiring a <video>'s onTimeUpdate/onEnded here
 * would animate the current segment's fill live and auto-advance to the
 * next shot when one ends — the placeholder below has no video to drive
 * that yet, so the fill only moves when a shot is clicked.
 */
export function ShotVideoPanel({ shotCount, videoUrls }: { shotCount: number; videoUrls?: Record<number, string> }) {
  const shots = Array.from({ length: shotCount }, (_, i) => i + 1);
  const [currentShot, setCurrentShot] = useState(1);
  const currentUrl = videoUrls?.[currentShot];

  return (
    <div className="-mx-7 sm:mx-0">
      {currentUrl ? (
        <video key={currentUrl} controls playsInline className="aspect-video w-full bg-ink-900 sm:rounded-md" src={currentUrl} />
      ) : (
        <div className="aspect-video w-full flex flex-col items-center justify-center gap-2 bg-ink-900 text-cream-100 sm:rounded-md">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60">
            <rect x="2" y="5" width="15" height="14" rx="2" />
            <path d="M17 9l5-3v12l-5-3" />
          </svg>
          <span className="font-condensed text-xs font-semibold tracking-wide uppercase opacity-80">Shot {currentShot} · Video awaiting upload</span>
          <span className="font-sans text-[11px] text-cream-200/70 max-w-[280px] text-center">
            Once footage is uploaded, it&rsquo;ll be assigned to this shot and playable right here.
          </span>
        </div>
      )}

      <div className="flex items-center px-7 py-3 sm:px-0">
        {shots.map((shot, i) => (
          <div key={shot} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => setCurrentShot(shot)}
              className={[
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-condensed text-[11px] font-bold cursor-pointer transition-colors",
                shot <= currentShot ? "bg-maroon-700 text-white" : "bg-cream-100 text-maroon-700 border border-ink-300",
                videoUrls?.[shot] ? "ring-2 ring-offset-1 ring-maroon-700" : "",
              ].join(" ")}
            >
              {shot}
            </button>
            {i < shots.length - 1 && (
              <div className="mx-1 h-[3px] flex-1 overflow-hidden rounded-full bg-ink-200">
                <div className="h-full bg-maroon-700 transition-all duration-300" style={{ width: shot + 1 <= currentShot ? "100%" : "0%" }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
