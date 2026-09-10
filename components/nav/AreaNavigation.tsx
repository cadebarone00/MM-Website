"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { areaBack, popArea, visitArea, type AreaHistory } from "@/lib/navigation/areaHistory";

const Context = createContext({ href: "/", onNavigate: () => {} });
const KEY = "mm-area-navigation-v1";
function persist(history: AreaHistory) {
  try { sessionStorage.setItem(KEY, JSON.stringify(history)); } catch { /* Navigation works without storage. */ }
}
export function AreaNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [history, setHistory] = useState<AreaHistory>({});
  useEffect(() => {
    let stored: AreaHistory = {};
    try {
      const raw = JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
      for (const area of ["website", "portal", "scoring", "tiger"] as const) {
        if (Array.isArray(raw?.[area])) stored[area] = raw[area].filter((path: unknown) => typeof path === "string" && path.startsWith("/") && !path.startsWith("//")).slice(-100);
      }
    } catch { stored = {}; }
    const next = visitArea(stored, pathname);
    persist(next);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize committed routes with tab-local navigation history.
    setHistory(next);
  }, [pathname]);
  const current = visitArea(history, pathname);
  const href = areaBack(current, pathname);
  function onNavigate() {
    const next = popArea(current, pathname);
    persist(next); setHistory(next);
  }
  return <Context.Provider value={{ href, onNavigate }}>{children}</Context.Provider>;
}
export function useAreaBack() { return useContext(Context); }
