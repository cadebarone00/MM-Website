"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type WagersMode = "coins" | "real";

const WagersModeContext = createContext<{ mode: WagersMode; setMode: (mode: WagersMode) => void } | null>(null);

/**
 * Holds which of MM Coins / Real Wagers is selected for the whole Wagers
 * section. Lives in app/wagers/layout.tsx so the nav bar's toggle and every
 * category page underneath it share one value without prop-drilling
 * through Next.js's opaque `children` route slot. Not persisted anywhere —
 * resets to "coins" on every fresh entry into the section.
 */
export function WagersModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WagersMode>("coins");
  return <WagersModeContext.Provider value={{ mode, setMode }}>{children}</WagersModeContext.Provider>;
}

export function useWagersMode(): { mode: WagersMode; setMode: (mode: WagersMode) => void } {
  const ctx = useContext(WagersModeContext);
  if (!ctx) throw new Error("useWagersMode must be used within WagersModeProvider");
  return ctx;
}
