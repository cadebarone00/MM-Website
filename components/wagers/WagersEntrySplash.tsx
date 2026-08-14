"use client";

import { useEffect, useState, type ReactNode } from "react";

const SPLASH_MS = 1200;

/**
 * Shown once per mount — i.e. once per entry into the Wagers section from
 * outside it, since app/wagers/layout.tsx (the only place this is used)
 * persists across navigation between /wagers/* routes and only remounts
 * when arriving at the section fresh. A timed visual gate only, not tied
 * to any data fetch.
 *
 * The background is a placeholder solid color until a real image asset is
 * provided — swap in a full-bleed <Image> behind the pulsating text once
 * one exists.
 */
export function WagersEntrySplash({ children }: { children: ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-maroon-900">
        <span className="animate-pulse font-serif text-4xl font-bold uppercase tracking-eyebrow text-white">Wagers</span>
      </div>
    );
  }

  return <>{children}</>;
}
