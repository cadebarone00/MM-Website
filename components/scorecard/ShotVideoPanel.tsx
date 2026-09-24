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

  // How far through the *current* shot we are (0 to 1) — drives the one
  // connecting-bar segment that's actively filling, so it reads as "closing
  // in on the next shot" rather than jumping straight to full. For a real
  // video this tracks actual playback time; for the timed "no video" beat
  // it's a synthetic clock over the same 3 seconds.
  const [shotProgress, setShotProgress] = useState(0);
  // Resets shotProgress to 0 the moment currentShot changes, so a freshly-
  // advanced-to video doesn't briefly show the previous shot's leftover
  // progress before its own first tick lands. Adjusting state during
  // render (React's own pattern for "reset when a prop/value changes")
  // rather than in a useEffect — avoids an extra render pass.
  const [progressForShot, setProgressForShot] = useState(currentShot);
  if (progressForShot !== currentShot) {
    setProgressForShot(currentShot);
    setShotProgress(0);
  }

  const advance = useCallback(() => {
    setCurrentShot((s) => (s >= shotCount ? 1 : s + 1));
  }, [shotCount]);

  function jumpTo(shot: number) {
    setCurrentShot(shot);
    setPaused(false);
  }

  // A shot with no video isn't a real <video> to drive onEnded (or a real
  // timeline to read progress from) — time its "no video" beat manually,
  // ticking a synthetic progress clock alongside the same 3-second timeout
  // that was already advancing it. Depends on currentShot explicitly (not
  // just currentUrl) so two consecutive video-less shots each get their
  // own fresh timer instead of sharing one, since currentUrl is undefined
  // for both.
  useEffect(() => {
    if (!hasAnyVideo || currentUrl || paused) return;
    const start = Date.now();
    const tick = setInterval(() => setShotProgress(Math.min((Date.now() - start) / 3000, 1)), 50);
    const timer = setTimeout(advance, 3000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
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
          onTimeUpdate={(e) => {
            const { currentTime, duration } = e.currentTarget;
            // duration is NaN until metadata loads, and briefly 0 — both
            // falsy, so this naturally no-ops until there's a real span to
            // divide by. While paused, timeupdate simply stops firing, so
            // the bar freezes wherever it was — no extra pause-handling
            // needed here.
            if (duration) setShotProgress(currentTime / duration);
          }}
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
                <div
                  className="h-full bg-maroon-700 transition-[width] duration-200 ease-linear"
                  style={{
                    // Bars before the current shot: already played, stay
                    // full. After it: not reached yet, stay empty. The one
                    // right after the current shot is the only one that's
                    // actually moving — it fills in step with that shot's
                    // real playback (or its synthetic "no video" clock).
                    width: shot < currentShot ? "100%" : shot === currentShot ? `${shotProgress * 100}%` : "0%",
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
