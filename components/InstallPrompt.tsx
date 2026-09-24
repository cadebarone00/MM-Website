"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const STORAGE_KEY = "mm-a2hs-dismissed";

type Platform = "ios" | "android";

function detectPlatform(): Platform | null {
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return null;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const STEPS: Record<Platform, string[]> = {
  ios: [
    'Tap the "•••" button in the bottom-left corner.',
    "Tap the Share button.",
    'Tap "View More" in the bottom-right.',
    'Scroll down and tap "Add to Home Screen."',
  ],
  android: [
    "Tap the ⋮ menu in the top right of Chrome.",
    'Tap "Add to Home screen" (or "Install app").',
    'Tap "Add" / "Install" to confirm.',
  ],
};

/**
 * A one-time-per-device modal that walks a phone visitor through adding the
 * site to their home screen. Skipped on desktop and once already installed.
 * It blocks the page behind it on purpose (no backdrop-click or Escape
 * dismiss) — closing it takes an explicit tap on "Got it," which is also
 * what makes the dismissal permanent for that device (localStorage), the
 * same "decide once, remember via storage" pattern as HomeEntrySplash.
 */
export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    // Deferred via setTimeout (rather than called directly in the effect
    // body) to avoid a synchronous setState-during-effect cascade, the same
    // pattern HomeEntrySplash uses.
    const timer = setTimeout(() => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      if (isStandalone()) return;
      setPlatform(detectPlatform());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!platform) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setPlatform(null);
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="install-prompt-title" className="w-full max-w-sm rounded-2xl bg-cream-50 p-6 text-ink-900 shadow-xl">
        <h2 id="install-prompt-title" className="font-title text-xl font-bold text-maroon-700">
          Add The Maroon Masters to your Home Screen
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-700">
          {STEPS[platform].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}
