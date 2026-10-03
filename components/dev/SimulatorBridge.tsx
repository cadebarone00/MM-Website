"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { parseSimulatorConfig, SIMULATOR_CHANNEL, type SimulatorConfig } from "@/lib/dev/simulator";

const SimulatorContext = createContext<SimulatorConfig | null>(null);
export const useSimulator = () => useContext(SimulatorContext);

/** Mounted only by the guarded /dev layout, never by production app routes. */
export function SimulatorBridge({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SimulatorConfig | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (window.parent === window) return;
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== SIMULATOR_CHANNEL || event.data?.type !== "config") return;
      const next = parseSimulatorConfig(event.data.config);
      if (next) setConfig(next);
    }
    window.addEventListener("message", receive);
    window.parent.postMessage({ channel: SIMULATOR_CHANNEL, type: "ready", path: pathname }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [pathname]);
  return <SimulatorContext.Provider value={config}>{children}</SimulatorContext.Provider>;
}
