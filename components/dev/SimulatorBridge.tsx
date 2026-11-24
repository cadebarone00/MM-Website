"use client";

import { initializeTripScenario } from "@/lib/dev/tripSetupStore";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isSimulatorPath, parseSimulatorConfig, sameSimulatorNavigation, SIMULATOR_CHANNEL, type SimulatorConfig } from "@/lib/dev/simulator";
import type { GolfTripNavigation } from "@/lib/platform/golfTripNavigation";
import { SimulatorKeyboard } from "./SimulatorKeyboard";

const SimulatorContext = createContext<SimulatorConfig | null>(null);
export const useSimulator = () => useContext(SimulatorContext);
const NavigationReporter = createContext<((navigation: GolfTripNavigation, rounds?: { id: string; number: number }[]) => void) | undefined>(undefined);
export const useSimulatorNavigationReporter = () => useContext(NavigationReporter);

/** Mounted only in development; activated only inside the same-origin /dev simulator. */
export function SimulatorBridge({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SimulatorConfig | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const active = useRef(false);
  const allowedRoutes = useRef(new Set<string>());
  const lastReport = useRef("");
  const reportNavigation = useCallback((navigation: GolfTripNavigation, rounds?: { id: string; number: number }[]) => {
    if (!active.current) return;
    const location = { rounds, path: window.location.pathname, navigation: { tab: navigation.tab, golfSection: navigation.golfSection, settingsView: navigation.settingsView } };
    const signature = JSON.stringify(location);
    if (lastReport.current === signature) return;
    lastReport.current = signature;
    window.parent.postMessage({ channel: SIMULATOR_CHANNEL, type: "location", location }, window.location.origin);
  }, []);
  useEffect(() => {
    if (window.parent === window) return;
    try { if (window.parent.location.origin !== window.location.origin || window.parent.location.pathname !== "/dev") return; } catch { return; }
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== SIMULATOR_CHANNEL) return;
      if (event.data.type === "config") {
        const next = parseSimulatorConfig(event.data.config);
        if (!next) return;
        initializeTripScenario(next);
        active.current = true;
        if (Array.isArray(event.data.routes)) allowedRoutes.current = new Set(event.data.routes.filter(isSimulatorPath));
        // Fixture updates must not replay a previous tab command after in-app navigation.
        setConfig(current => ({ ...next, navigation: sameSimulatorNavigation(current?.navigation, next.navigation) ? current?.navigation : next.navigation }));
      } else if (active.current && event.data.type === "navigate" && isSimulatorPath(event.data.path) && allowedRoutes.current.has(event.data.path)) {
        // A page can carry a query (/dev/round?game=wolf): go there unless this phone is already on it, then add simulator=1.
        const target = new URL(event.data.path, window.location.origin), here = new URLSearchParams(window.location.search);
        if (window.location.pathname !== target.pathname || [...target.searchParams].some(([key, value]) => here.get(key) !== value)) {
          target.searchParams.set("simulator", "1");
          router.push(`${target.pathname}${target.search}`);
        }
      }
    }
    window.addEventListener("message", receive);
    window.parent.postMessage({ channel: SIMULATOR_CHANNEL, type: "ready", location: { path: window.location.pathname } }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [router]);
  useEffect(() => {
    if (!active.current) return;
    lastReport.current = "";
    window.parent.postMessage({ channel: SIMULATOR_CHANNEL, type: "location", location: { path: pathname } }, window.location.origin);
  }, [pathname]);
  return <SimulatorContext.Provider value={config}><NavigationReporter.Provider value={config ? reportNavigation : undefined}>{children}
    {config && config.state.keyboard && config.state.keyboard !== "off" && <SimulatorKeyboard kind={config.state.keyboard} />}
  </NavigationReporter.Provider></SimulatorContext.Provider>;
}
