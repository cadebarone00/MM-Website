"use client";

import { useEffect, useRef, useState } from "react";

// The spec's reference production resolution (§10) — rendering the iframe
// at this exact size, then scaling the whole thing down visually, means
// the preview shows real desktop/TV-scale typography (the actual
// breakpoint Tailwind classes /broadcast's scenes use above `sm:`), not
// the small-viewport/mobile styles a narrow iframe would otherwise trigger.
const PREVIEW_WIDTH = 1920;
const PREVIEW_HEIGHT = 1080;

/** A true-to-scale live preview of /broadcast — same page real viewers see, shrunk to fit instead of reflowed. */
export function BroadcastPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

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

  return (
    <div
      ref={containerRef}
      className="relative -mx-4 aspect-video overflow-hidden border-y-2 border-stone-300 bg-[color:var(--color-maroon-900)] sm:mx-0 sm:rounded-lg sm:border-x-2"
    >
      <iframe
        src="/broadcast"
        title="Broadcast preview"
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
    </div>
  );
}
