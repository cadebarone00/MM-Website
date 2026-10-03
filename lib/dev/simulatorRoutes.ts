import "server-only";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GOLF_TRIP_TABS, GOLF_TRIP_SECTIONS } from "@/lib/platform/golfTripNavigation";
import { isPlayDemoEnabled } from "@/lib/platform/playDemo";
import type { SimulatorPage } from "./simulator";

/** Discover existing static dev routes. No duplicate page implementation or dynamic ids. */
export function simulatorPages(): SimulatorPage[] {
  const pages: SimulatorPage[] = [];
  function walk(directory: string, path: string) {
    if (existsSync(join(directory, "page.tsx")) && path !== "/dev") {
      if (path.startsWith("/dev/play") && !isPlayDemoEnabled()) return;
      pages.push({ id: path, path, label: path === "/dev/tournament" ? "Golf Trip · Home" : path === "/dev/tournament/settings" ? "Golf Trip · Settings" : path.replace("/dev/play", "Tournament app").replaceAll("/", " · "), fixtures: path.startsWith("/dev/tournament") });
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !/[\[(@]/.test(entry.name)) walk(join(directory, entry.name), `${path}/${entry.name}`);
    }
  }
  walk(join(process.cwd(), "app/dev"), "/dev");
  const home = pages.find(page => page.path === "/dev/tournament");
  if (home) {
    home.navigation = { tab: "Home" };
    pages.splice(pages.indexOf(home) + 1, 0,
      ...GOLF_TRIP_TABS.filter(tab => tab !== "Home").map(tab => ({ ...home, id: `trip-${tab}`, label: `Golf Trip · ${tab}`, navigation: { tab } })),
      ...GOLF_TRIP_SECTIONS.filter(section => section !== "Overview").map(section => ({ ...home, id: `trip-${section}`, label: `Golf Trip · ${section}`, navigation: { tab: "Golf" as const, golfSection: section } })),
    );
  }
  for (const [path, label] of [["/", "Platform home"], ["/golf-trips", "Golf Trips list"], ["/golf-trips/new", "Create Golf Trip"], ["/login", "Sign in"]]) {
    if (existsSync(join(process.cwd(), "app", path, "page.tsx"))) pages.push({ id: path, path, label, fixtures: false });
  }
  return pages;
}
