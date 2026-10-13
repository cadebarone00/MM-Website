"use client";

import { useCallback, useLayoutEffect, useRef, type PointerEvent } from "react";

/**
 * Left / right swipes on an element (finger, mouse, or a trackpad's two-finger swipe). A swipe is at least 40px sideways
 * and clearly more sideways than up-and-down; swiping left calls `onLeft` (next), right calls `onRight` (previous).
 * Spread the returned props on the element; its `touch-action: pan-y` keeps up-and-down scrolling but stops a sideways
 * swipe from scrolling anything around it (like the Golf tab's Leaderboard / Matches strip), and text on it can't be
 * selected. A sideways trackpad swipe is caught too (one step per swipe), so it doesn't scroll that strip or make the
 * browser go back / forward a page.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const handlers = useRef({ onLeft, onRight });
  useLayoutEffect(() => { handlers.current = { onLeft, onRight }; });
  // Trackpad: one swipe is a burst of wheel events; add up its sideways distance and step once, then wait for the burst
  // to end (no wheel event for 200ms) before the next swipe can step.
  const wheel = useRef({ dx: 0, fired: false, timer: 0 });
  const listening = useRef<{ element: HTMLElement; listener: (event: WheelEvent) => void } | null>(null);
  const ref = useCallback((element: HTMLElement | null) => {
    if (listening.current) listening.current.element.removeEventListener("wheel", listening.current.listener);
    listening.current = null;
    if (!element) return;
    const listener = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const gesture = wheel.current;
      window.clearTimeout(gesture.timer);
      gesture.timer = window.setTimeout(() => { gesture.dx = 0; gesture.fired = false; }, 200);
      if (gesture.fired) return;
      gesture.dx += event.deltaX;
      if (Math.abs(gesture.dx) < 40) return;
      gesture.fired = true;
      if (gesture.dx > 0) handlers.current.onLeft(); else handlers.current.onRight();
    };
    // Not passive, so the sideways scroll can be stopped.
    element.addEventListener("wheel", listener, { passive: false });
    listening.current = { element, listener };
  }, []);
  return {
    ref,
    // No text selection either: a drag that selects names would turn the next swipe into dragging that text.
    style: { touchAction: "pan-y" as const, overscrollBehaviorX: "none" as const, userSelect: "none" as const, WebkitUserSelect: "none" as const },
    onPointerDown: (event: PointerEvent) => { start.current = { x: event.clientX, y: event.clientY }; },
    onPointerCancel: () => { start.current = null; },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = event.clientX - from.x, dy = event.clientY - from.y;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) handlers.current.onLeft(); else handlers.current.onRight();
    },
  };
}
