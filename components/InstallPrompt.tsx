"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

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
    'Tap the Share icon (square with an arrow) at the bottom of Safari.',
    'Scroll down and tap "Add to Home Screen."',
    'Tap "Add" in the top corner.',
  ],
  android: [
    "Tap the ⋮ menu in the top right of Chrome.",
    'Tap "Add to Home screen" (or "Install app").',
    'Tap "Add" / "Install" to confirm.',
  ],
};

/**
 * A one-time-per-device nudge to add the site to the phone's home screen.
 * iOS Safari and Android Chrome each use their own menu for this (there's
 * no shared browser API for it), so the steps shown depend on the detected
 * platform. Skipped on desktop and once the site is already installed.
 * Dismissing it is permanent for that device (localStorage) — the same
 * "decide once, remember via storage" pattern as HomeEntrySplash.
 */
export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  return (
    <div className="mm-fade border-b border-gold-300 bg-maroon-50 px-4 py-3">
      <div className="mx-auto flex max-w-(--container-mm-lg) items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-condensed text-sm font-semibold text-maroon-700">Add The Maroon Masters to your Home Screen</p>
          {expanded ? (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-ink-700">
              {STEPS[platform].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : (
            <button type="button" onClick={() => setExpanded(true)} className="mt-1 text-sm font-semibold text-maroon-600 underline">
              Show me how
            </button>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-ink-500">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
