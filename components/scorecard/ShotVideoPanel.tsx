"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shot tracker + player. When the hole has at least one shot video, this
 * auto-plays through every shot in order and loops forever: a real video
 * plays and, on ending, advances to the next shot; a shot with no video
 * shows a 3-second "no video" beat and advances the same way. Clicking a
 * shot dot jumps straight to it and resumes the loop from there. Pausing a
 * real video (native controls) holds the loop at that shot until the
 * viewer presses play again — moving to a different hole always starts
 * fresh at shot 1 (the parent remounts this component via a `key` on hole
 * change, so that reset needs no code here).
 *
 * If the hole has no video at all, this is just a static message — no
 * dots, no loop, nothing plays.
 */
export function ShotVideoPanel({ shotCount, videoUrls }: { shotCount: number; videoUrls?: Record<number, string> }) {
  const hasAnyVideo = !!videoUrls && Object.keys(videoUrls).length > 0;
  const shots = Array.from({ length: shotCount }, (_, i) => i + 1);
  const [currentShot, setCurrentShot] = useState(1);
  const [paused, setPaused] = useState(false);
  const currentUrl = videoUrls?.[currentShot];

  const advance = useCallback(() => {
    setCurrentShot((s) => (s >= shotCount ? 1 : s + 1));
  }, [shotCount]);

  function jumpTo(shot: number) {
    setCurrentShot(shot);
    setPaused(false);
  }

  // A shot with no video isn't a real <video> to drive onEnded — time its
  // "no video" beat manually and advance the same way onEnded would.
  // Depends on currentShot explicitly (not just currentUrl) so two
  // consecutive video-less shots each get their own fresh 3-second timer
  // instead of sharing one, since currentUrl is undefined for both.
  useEffect(() => {
    if (!hasAnyVideo || currentUrl || paused) return;
    const timer = setTimeout(advance, 3000);
    return () => clearTimeout(timer);
  }, [currentShot, currentUrl, hasAnyVideo, paused, advance]);

  if (!hasAnyVideo) {
    return (
      <div className="-mx-7 sm:mx-0">
        <div className="aspect-video w-full flex items-center justify-center bg-ink-900 text-cream-100 sm:rounded-md">
          <span className="font-condensed text-sm font-semibold tracking-wide uppercase opacity-80">No Shot Video For This Hole</span>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-7 sm:mx-0">
      {currentUrl ? (
        <video
          key={currentUrl}
          autoPlay
          controls
          playsInline
          className="aspect-video w-full bg-ink-900 sm:rounded-md"
          src={currentUrl}
          onEnded={advance}
          onPause={(e) => {
            // Browsers fire `pause` right before `ended` when a video
            // finishes naturally — only treat it as a real user-pause
            // (one that should hold the loop) when the video hasn't ended.
            if (!e.currentTarget.ended) setPaused(true);
          }}
          onPlay={() => setPaused(false)}
        />
      ) : (
        <div className="aspect-video w-full flex flex-col items-center justify-center gap-2 bg-ink-900 text-cream-100 sm:rounded-md">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60">
            <rect x="2" y="5" width="15" height="14" rx="2" />
            <path d="M17 9l5-3v12l-5-3" />
          </svg>
          <span className="font-condensed text-xs font-semibold tracking-wide uppercase opacity-80">No Uploaded Video For Shot {currentShot}</span>
        </div>
      )}

      <div className="flex items-center px-7 py-3 sm:px-0">
        {shots.map((shot, i) => (
          <div key={shot} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => jumpTo(shot)}
              className={[
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-condensed text-[11px] font-bold cursor-pointer transition-colors",
                shot === currentShot ? "bg-maroon-700 text-white" : "bg-cream-100 text-maroon-700 border border-ink-300",
                videoUrls?.[shot] ? "ring-2 ring-offset-1 ring-maroon-700" : "",
              ].join(" ")}
            >
              {shot}
            </button>
            {i < shots.length - 1 && (
              <div className="mx-1 h-[3px] flex-1 overflow-hidden rounded-full bg-ink-200">
                <div className="h-full bg-maroon-700 transition-all duration-300" style={{ width: shot < currentShot ? "100%" : "0%" }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
