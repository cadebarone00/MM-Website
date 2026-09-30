"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

// The spec's reference production resolution (§10) — rendering the iframe
// at this exact size, then scaling the whole thing down visually, means
// the preview shows real desktop/TV-scale typography (the actual
// breakpoint Tailwind classes /broadcast's scenes use above `sm:`), not
// the small-viewport/mobile styles a narrow iframe would otherwise trigger.
const PREVIEW_WIDTH = 1920;
const PREVIEW_HEIGHT = 1080;

/** A true-to-scale preview of /broadcast, shrunk to fit instead of reflowed. Pass a plain `/broadcast` src for the real thing, or a `?preview=1&...` src to rehearse privately (see BroadcastControlsPanel.tsx). */
export function BroadcastPreview({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setScale(width / PREVIEW_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {
      // Browsers can reject fullscreen outside a direct tap; the preview
      // remains usable in its normal rehearsal frame in that case.
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative -mx-4 aspect-video w-full overflow-hidden border-y-2 border-stone-300 bg-[color:var(--color-maroon-900)] sm:mx-0 sm:rounded-lg sm:border-x-2 fullscreen:m-0 fullscreen:h-screen fullscreen:w-screen fullscreen:rounded-none"
    >
      <iframe
        src={src}
        title="Broadcast preview"
        allow="fullscreen"
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          border: 0,
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "top left",
          transform: `scale(${scale ?? 0})`,
        }}
      />
      <button
        type="button"
        onClick={() => { void toggleFullscreen(); }}
        aria-label={fullscreen ? "Exit fullscreen preview" : "Fullscreen preview"}
        className="absolute bottom-3 right-3 z-10 rounded-md bg-black/70 p-2 text-white transition hover:bg-black"
      >
        {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>
    </div>
  );
}
