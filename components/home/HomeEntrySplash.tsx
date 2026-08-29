"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";

const SPLASH_MS = 1200;
const SESSION_KEY = "mm-home-splash-shown";

/**
 * Shown once per browser session the first time a visitor lands on the
 * homepage — fans and signed-out people. A timed visual gate only, not tied
 * to any data fetch. See `components/wagers/WagersEntrySplash.tsx` for the
 * same pattern used elsewhere on the site.
 */
export function HomeEntrySplash({ children }: { children: ReactNode }) {
  // Always start true so server and client render the same thing on first
  // paint (avoids a hydration mismatch); the effect below immediately skips
  // the splash if this session has already seen it.
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) {
      setShowSplash(false);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    const timer = setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
