"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const Context = createContext<{ active: boolean; setActive: (active: boolean) => void }>({ active: false, setActive: () => {} });

/**
 * Lets a page tell the portal header "a round is underway" so the top-left
 * back arrow reads "Exit" instead of "Back". Used by the handicap round
 * wizard once you've started a round; the header just reads it.
 */
export function RoundExitProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRoundExitActive(): boolean {
  return useContext(Context).active;
}

/** Marks a round as underway for as long as the calling component is mounted with `active` true. */
export function useRegisterRoundInProgress(active: boolean) {
  const { setActive } = useContext(Context);
  useEffect(() => {
    setActive(active);
    return () => setActive(false);
  }, [active, setActive]);
}
