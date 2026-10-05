import "server-only";
import { SIDE_GAME_REGISTRY } from "@/lib/platform/golfTripGames";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GOLF_TRIP_TABS, GOLF_TRIP_SECTIONS } from "@/lib/platform/golfTripNavigation";
import { isPlayDemoEnabled } from "@/lib/platform/playDemo";
import { SIMULATOR_SOURCES, type SimulatorPage } from "./simulator";
import { GOLF_MATCH_PREVIEWS } from "@/lib/platform/golfTripPreviewFixture";

/** Discover existing static dev routes. No duplicate page implementation or dynamic ids. */
export function simulatorPages(): SimulatorPage[] {
  const pages: SimulatorPage[] = [];
  function walk(directory: string, path: string) {
    if (existsSync(join(directory, "page.tsx")) && path !== "/dev") {
      if (path.startsWith("/dev/play") && !isPlayDemoEnabled()) return;
      pages.push({ id: path, path, label: path === "/dev/tournament" ? "Golf Trip · Home" : path === "/dev/tournament/settings" ? "Golf Trip · Settings preview" : path.replace("/dev/play", "Tournament app").replaceAll("/", " · "), fixtures: path.startsWith("/dev/tournament") });
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
  for (const [path, label] of [["/new-user", "New User"], ["/signup", "Create an Account"], ["/", "Explore / Home"], ["/golf-trips", "Golf Trips"], ["/profile", "Profile"], ["/tournaments/join", "Tourneys"], ["/pickems", "Pick?ems"], ["/golf-trips/new", "Create Golf Trip"], ["/golf-trips/trip/settings", "Golf Trip · App settings"], ["/login", "Sign in"]]) {
    if (existsSync(join(process.cwd(), "app", path, "page.tsx"))) pages.push({ id: path, path, label, fixtures: false });
  }
  // Dynamic setup route has a real, fixed Golf Trip branch.
  pages.push({ id: "trip-setup", path: "/tournaments/create/golf-trip", label: "Golf Trip setup", fixtures: false, group: "Golf Trip Onboarding", conditions: [] });
  const steps = ["", "players", "golf", "courses", "format", "lodging", "flights", "transportation", "review"];
  for (const step of steps.slice(1)) {
    const path = "/golf-trips/new/" + step;
    if (existsSync(join(process.cwd(), "app", path, "page.tsx"))) pages.push({ id: path, path, label: step[0].toUpperCase() + step.slice(1), fixtures: false });
  }
  for (const page of pages) {
    page.group ??= page.path.startsWith("/golf-trips/new") ? "Golf Trip Onboarding" : page.path.startsWith("/dev/tournament") || page.path === "/golf-trips/trip/settings" || page.path === "/dev/gps" ? "Golf Trip Active" : page.path.startsWith("/dev/play") ? "Tournament Active" : ["/login", "/signup", "/new-user"].includes(page.path) ? "Authentication" : "Public / Marketing";
    page.label = page.label.replace(/^Golf Trip \u00b7 /, "");
    if (page.path === "/golf-trips/new") page.label = "Trip Basics";
    if (page.conditions) continue;
    page.conditions = [];
    if (!page.path.startsWith("/dev/tournament")) continue;
    page.conditions = SIMULATOR_SOURCES.map(item => ({ id: "source-" + item.id, label: item.label, source: item.id }));
    if (page.navigation?.tab === "Home" || page.navigation?.tab === "Golf") page.conditions.push(
      { id: "competition-source", label: "Competition from data source", state: { competition: "source" } },
      { id: "competitive", label: "Competitive", state: { competition: "yes" } },
      { id: "social", label: "Non-competitive", state: { competition: "no" } },
      { id: "players", label: "Player count", playerCount: true });
    if (page.navigation?.tab === "Golf" && page.navigation.golfSection !== "Games") page.conditions.push(
      { id: "format-source", label: "Format from data source", state: { format: "source" } },
      ...Object.entries(GOLF_MATCH_PREVIEWS).map(([key, sample]) => ({ id: "format-" + key, label: sample.format, state: { format: key } })),
      { id: "round-source", label: "Round from data source", state: { roundStatus: "source" } },
      { id: "scheduled", label: "Scheduled", state: { roundStatus: "scheduled" } });
    // The Scoring sheet sits on every trip tab.
    if (page.navigation?.tab) page.conditions.push(
      { id: "opponent-card-match", label: "Opponent's card matches", state: { opponentCard: "match" } },
      { id: "opponent-card-mismatch", label: "Opponent's card has a mismatch", state: { opponentCard: "mismatch" } });
    if (page.navigation?.tab === "Venue") page.conditions.push(
      { id: "weather-off", label: "Normal weather", state: { loading: "off" } },
      { id: "weather-loading", label: "Weather loading", state: { loading: "weather" } });
  }
  const gps = pages.find(page => page.path === "/dev/gps");
  if (gps) gps.label = "GPS prototype";
  const settings = pages.find(page => page.path === "/dev/tournament/settings");
  if (settings) {
    settings.label = "Settings preview";
    const add = (view: string, label: string, parentId: string, section?: string) => pages.push({
      ...settings, id: `settings-${view}`, label, parentId, section,
      navigation: { tab: "Home", settingsView: view },
      conditions: settings.conditions?.map(condition => ({ ...condition })),
    });
    add("player", "Player settings", settings.id, "Player");
    for (let index = 1; index <= 6; index++) add(`placeholder-${index}`, `Place holder ${index}`, settings.id, "Player");
    add("organizer", "Organizer settings", settings.id, "Organizer");
    for (const [view, label] of [["players", "Players"], ["schedule", "Trip Schedule"], ["competition", "Competition"], ["games", "Games"], ["placeholder-7", "Place holder 1"], ["placeholder-8", "Place holder 2"]]) add(view, label, settings.id, "Organizer");
    add("competition-rounds", "Rounds", "settings-competition");
    for (const game of [{ id: "skins", name: "Skins" }, ...SIDE_GAME_REGISTRY.filter(game => game.id !== "skins")]) add(`game-${game.id}`, game.name, "settings-games");
  }
  const maroonUPath = "/dev/tournament/maroon-u";
  for (let index = pages.length - 1; index >= 0; index--) {
    if (pages[index].path.startsWith(maroonUPath)) pages.splice(index, 1);
  }
  const maroonUPages = pages.filter(page => page.group === "Golf Trip Active").map(page => ({
    ...page, id: "maroon-u-" + page.id, parentId: page.parentId ? "maroon-u-" + page.parentId : page.parentId, // keep settings branches inside Maroon U
    path: page.path.endsWith("/settings") ? maroonUPath + "/settings" : maroonUPath,
    group: "Maroon U Active", fixtures: true,
    conditions: page.conditions?.map(condition => condition.id === "source-maroon" ? { ...condition, label: "Fictional Maroon U team data" } : condition),
  }));
  pages.splice(pages.map(page => page.group).lastIndexOf("Golf Trip Active") + 1, 0, ...maroonUPages);
  const onboardingOrder = ["/tournaments/create/golf-trip", ...steps.map(step => "/golf-trips/new" + (step ? "/" + step : ""))];
  const groupOrder = Array.from(new Set(pages.map(page => page.group)));
  groupOrder.splice(groupOrder.indexOf("Golf Trip Onboarding"), 1);
  groupOrder.splice(groupOrder.indexOf("Golf Trip Active") + 1, 0, "Golf Trip Onboarding");
  return pages.sort((a, b) => a.group !== b.group ? groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) : a.group === "Golf Trip Onboarding" ? onboardingOrder.indexOf(a.path) - onboardingOrder.indexOf(b.path) : 0);
}
