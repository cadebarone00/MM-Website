"use client";

import { useRef, type PointerEvent } from "react";

/**
 * Left / right swipes on an element (finger or mouse). A swipe is at least 40px sideways and clearly more sideways than
 * up-and-down; swiping left calls `onLeft` (next), right calls `onRight` (previous). Spread the returned props on the
 * element; its `touch-action: pan-y` keeps up-and-down scrolling but stops a sideways swipe from scrolling anything
 * around it (like the Golf tab's Leaderboard / Matches strip), and text on it can't be selected.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    // No text selection either: a drag that selects names would turn the next swipe into dragging that text.
    style: { touchAction: "pan-y" as const, userSelect: "none" as const, WebkitUserSelect: "none" as const },
    onPointerDown: (event: PointerEvent) => { start.current = { x: event.clientX, y: event.clientY }; },
    onPointerCancel: () => { start.current = null; },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = event.clientX - from.x, dy = event.clientY - from.y;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft(); else onRight();
    },
  };
}
