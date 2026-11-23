"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { canRefreshApp, refreshApp } from "./appRefresh";
import styles from "./App.module.css";

const PULL = 70; // how far (px) to pull down at the top of a screen before letting go refreshes it

/** True if the touch started inside something scrolled down (a list, a scorecard), so a pull there scrolls it instead. */
function insideScrolled(target: EventTarget | null): boolean {
  for (let el = target as HTMLElement | null; el && el !== document.body; el = el.parentElement) if (el.scrollTop > 0) return true;
  return false;
}

/**
 * The phone behaviour the website doesn't need: pull down at the top of a screen to refresh it, refresh when you come
 * back to the app, and (Android) the back button goes back a screen, or leaves the app from the first one.
 */
export function AppNative() {
  const [pull, setPull] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pulled = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const resume = App.addListener("resume", refreshApp);
    const back = App.addListener("backButton", ({ canGoBack }) => (canGoBack ? window.history.back() : void App.exitApp()));
    return () => { void resume.then((l) => l.remove()); void back.then((l) => l.remove()); };
  }, []);

  useEffect(() => {
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start.current = window.scrollY <= 0 && event.touches.length === 1 && canRefreshApp() && !insideScrolled(event.target) ? { x: touch.clientX, y: touch.clientY } : null;
      pulled.current = 0;
      setPull(0);
    };
    const onMove = (event: TouchEvent) => {
      if (start.current === null) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch || Math.abs(touch.clientX - start.current.x) > Math.abs(touch.clientY - start.current.y)) {
        start.current = null;
        pulled.current = 0;
        setPull(0);
        return;
      }
      pulled.current = Math.max(0, touch.clientY - start.current.y);
      setPull(pulled.current);
    };
    const reset = () => {
      start.current = null;
      pulled.current = 0;
      setPull(0);
    };
    const onEnd = () => {
      if (start.current !== null && pulled.current >= PULL) refreshApp();
      reset();
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", reset);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);

  if (pull < 12) return null;
  return <div className={styles.pull} role="status" style={{ opacity: Math.min(1, pull / PULL) }}>{pull >= PULL ? "Let go to refresh" : "Pull to refresh"}</div>;
}
