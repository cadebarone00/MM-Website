import "server-only";
import { SIDE_GAME_REGISTRY } from "@/lib/platform/golfTripGames";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GOLF_TRIP_TABS, GOLF_TRIP_SECTIONS } from "@/lib/platform/golfTripNavigation";
import { SIMULATOR_SOURCES, type SimulatorPage } from "./simulator";
import { DEV_ACCOUNTS } from "./devAccounts";
import { GOLF_MATCH_PREVIEWS } from "@/lib/platform/golfTripPreviewFixture";
import { NOTIFICATION_PREVIEWS, NOTIFICATION_PREVIEW_LABELS } from "./sampleNotifications";

/** Discover existing static dev routes. No duplicate page implementation or dynamic ids. */
export function simulatorPages(): SimulatorPage[] {
  const pages: SimulatorPage[] = [];
  function walk(directory: string, path: string) {
    if (existsSync(join(directory, "page.tsx")) && path !== "/dev") {
      // Same condition as isPlayDemoEnabled() in lib/platform/playDemo.ts, checked here because only /dev/play may import
      // the demo module (playDemo.test.ts). This only hides list entries; the /dev/play pages enforce the real gate.
      if (path.startsWith("/dev/play") && !(process.env.NODE_ENV === "development" && process.env.DEV_PLAY_DEMO === "true")) return;
      pages.push({ id: path, path, label: path === "/dev/tournament" ? "Golf Trip · Home" : path === "/dev/tournament/settings" ? "Golf Trip · Settings preview" : path.replace("/dev/play", "Tournament app").replaceAll("/", " · "), fixtures: path.startsWith("/dev/tournament") });
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !/[\[(@]/.test(entry.name)) walk(join(directory, entry.name), `${path}/${entry.name}`);
    }
  }
  walk(join(process.cwd(), "app/dev"), "/dev");
  const brandStudio = pages.find(page => page.path === "/dev/brand");
  if (brandStudio) Object.assign(brandStudio, { group: "App Launch", label: "Logo studio", conditions: [] });
  const brandIntro = pages.find(page => page.path === "/dev/brand/intro");
  if (brandIntro) Object.assign(brandIntro, {
    group: "App Launch", label: "Logo entrance", conditions: [
      { id: "brand-gold", label: "Gold shimmer", state: { brandStyle: "gold" } },
      { id: "brand-clean", label: "Clean handwriting", state: { brandStyle: "clean" } },
      { id: "brand-drawing", label: "Drawing entrance", state: { brandStage: "drawing" } },
      { id: "brand-finished", label: "Finished logo", state: { brandStage: "finished" } },
      { id: "brand-reduced", label: "Reduced motion", state: { brandStage: "reduced" } },
    ],
  });
  const home = pages.find(page => page.path === "/dev/tournament");
  if (home) {
    home.navigation = { tab: "Home" };
    pages.splice(pages.indexOf(home) + 1, 0,
      ...GOLF_TRIP_TABS.filter(tab => tab !== "Home").map(tab => ({ ...home, id: `trip-${tab}`, label: `Golf Trip · ${tab}`, navigation: { tab } })),
      ...GOLF_TRIP_SECTIONS.filter(section => section !== "Overview").map(section => ({ ...home, id: `trip-${section}`, label: `Golf Trip · ${section}`, navigation: { tab: "Golf" as const, golfSection: section } })),
    );
  }
  for (const [path, label] of [["/new-user", "New User"], ["/signup", "Create an Account"], ["/", "Play / Home"], ["/golf-trips", "Golf Trips"], ["/profile", "Profile"], ["/tournaments/join", "Tourneys"], ["/pickems", "Pick?ems"], ["/golf-trips/new", "Create Golf Trip"], ["/golf-trips/trip/settings", "Golf Trip · App settings"], ["/login", "Log In welcome"], ["/login/email", "Email sign in"]]) {
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
    page.group ??= page.path.startsWith("/golf-trips/new") ? "Golf Trip Onboarding" : page.path.startsWith("/dev/tournament") || page.path === "/golf-trips/trip/settings" || page.path === "/dev/gps" ? "Golf Trip Active" : page.path.startsWith("/dev/play") ? "Tournament Active" : ["/login", "/login/email", "/signup", "/new-user"].includes(page.path) ? "Authentication" : "Public / Marketing";
    page.label = page.label.replace(/^Golf Trip \u00b7 /, "");
    if (page.path === "/golf-trips/new") page.label = "Trip Basics";
    if (page.conditions) continue;
    page.conditions = [];
    if (!page.path.startsWith("/dev/tournament")) continue;
    page.conditions = SIMULATOR_SOURCES.map(item => ({ id: "source-" + item.id, label: item.label, source: item.id }));
    if (page.navigation?.tab === "Home") page.conditions.push({ id: "dual-draft-momentum", label: "Upcoming Team Draft + Match Draft", state: { dualDraftMomentum: true } });
    if (page.navigation?.tab === "Home" || page.navigation?.tab === "Golf") page.conditions.push(
      { id: "competition-source", label: "Competition from data source", state: { competition: "source" } },
      { id: "competitive", label: "Competitive", state: { competition: "yes" } },
      { id: "social", label: "Non-competitive", state: { competition: "no" } },
      { id: "players", label: "Player count", playerCount: true });
    if (page.navigation?.tab === "Golf" && page.navigation.golfSection !== "Games") page.conditions.push(
      { id: "format-source", label: "Format from data source", state: { format: "source" } },
      ...Object.entries(GOLF_MATCH_PREVIEWS).map(([key, sample]) => ({ id: "format-" + key, label: sample.format, state: { format: key } })),
    );
    // Round state, on every Golf Trip Active trip page.
    if (page.navigation?.tab) page.conditions.push(
      { id: "round-source", label: "Round state from data source", state: { roundStatus: "source" } },
      { id: "scheduled", label: "Pre-tournament / before round 1", state: { roundStatus: "scheduled" } },
      { id: "round-live", label: "Live round", state: { roundStatus: "live" } },
      { id: "round-end-match", label: "End of round, unsubmitted — scores match", state: { roundStatus: "roundEnd", opponentCard: "match" } },
      { id: "round-end-mismatch", label: "End of round, unsubmitted — scores don't match", state: { roundStatus: "roundEnd", opponentCard: "mismatch" } },
      { id: "round-between", label: "Between rounds (round 3 done, round 4 next)", state: { roundStatus: "between" } },
      { id: "round-complete", label: "Trip complete (all rounds done)", state: { roundStatus: "complete" } });
    // The Scoring sheet sits on every trip tab.
    if (page.navigation?.tab) page.conditions.push(
      { id: "opponent-card-match", label: "Opponent's card matches", state: { opponentCard: "match" } },
      { id: "opponent-card-mismatch", label: "Opponent's card has a mismatch", state: { opponentCard: "mismatch" } });
    // Player rounds preview: which mock account is signed in (trip Submit & Save saves to them).
    if (page.navigation?.tab) page.conditions.push(...signedInAs());
    if (page.navigation?.golfSection === "Games") page.conditions.push(
      { id: "games-saved", label: "Your saved games", state: { sampleGames: false } },
      { id: "games-sample", label: "Sample games, mid-round (every game)", state: { sampleGames: true, roundStatus: "live" } });
    if (page.navigation?.golfSection === "Stats") page.conditions.push(
      { id: "trip-stats-saved", label: "Trip stats from saved cards", state: { sampleTripStats: false } },
      { id: "trip-stats-sample", label: "Sample trip stats (every player, 3 courses)", state: { sampleTripStats: true } });
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
    add("match-selection", "Match Selection settings", settings.id, "Organizer");
    pages.push({ ...settings, id: "trip-match-selector", label: "Match Selector", parentId: undefined, navigation: { tab: "Home", settingsView: "match-draft-room" } });
    for (const [view, label] of [["players", "Players"], ["schedule", "Golf Schedule"], ["competition", "Competition"], ["games", "Games"], ["history", "History"], ["placeholder-7", "Place holder 1"], ["placeholder-8", "Place holder 2"]]) add(view, label, settings.id, "Organizer");
    add("competition-rounds", "Rounds", "settings-competition");
    for (const game of [{ id: "skins", name: "Skins" }, ...SIDE_GAME_REGISTRY.filter(game => game.id !== "skins")]) add(`game-${game.id}`, game.name, "settings-games");
  }
  // Notifications group: phone notifications, Live Activity and in-app, each with its preview screens (spec: Notifications).
  for (const [path, label, surface] of [["/dev/notifications/phone", "Phone notifications", "phone"], ["/dev/notifications/live-activity", "Live Activity", "live"], ["/dev/notifications/in-app", "In-app notifications", "inApp"]] as const) {
    const page = pages.find(item => item.path === path);
    if (page) {
      Object.assign(page, { label, group: "Notifications", conditions: NOTIFICATION_PREVIEWS[surface].map(id => ({ id: "notify-" + id, label: NOTIFICATION_PREVIEW_LABELS[id], state: { notificationPreview: id } })) });
      pages.push(...pages.splice(pages.indexOf(page), 1)); // keep this order: phone, Live Activity, in-app
    }
  }
  // Profile group. First (the default): the real profile screens on a sample profile, no sign-in needed.
  const profile = pages.find(page => page.path === "/dev/profile");
  if (profile) Object.assign(profile, { label: "Profile (sample)", group: "Profile", conditions: [
    { id: "profile-preview-sample", label: "My profile · sample stats (25 rounds)", state: { profilePreview: "sample", sampleStats: true } },
    { id: "profile-preview-few", label: "My profile · not enough rounds for a handicap (2 rounds)", state: { profilePreview: "few", sampleStats: false } },
    { id: "profile-preview-none", label: "My profile · no rounds yet", state: { profilePreview: "none", sampleStats: false } },
    { id: "profile-preview-public", label: "Someone else's Public profile", state: { profilePreview: "public", sampleStats: false } },
    { id: "profile-preview-private", label: "Someone else's Private profile", state: { profilePreview: "private", sampleStats: false } },
  ] });
  for (const [path, label] of [["/dev/profile/settings", "Settings (sample)"], ["/dev/profile/edit", "Edit profile (sample)"]]) {
    const page = pages.find(item => item.path === path);
    if (page) Object.assign(page, { label, group: "Profile", parentId: profile?.id, conditions: [] });
  }
  // The real Profile (signed-in account): real data, or made-up rounds to preview the Stats tab and Compare.
  const realProfile = pages.find(page => page.path === "/profile");
  if (realProfile) Object.assign(realProfile, { label: "My profile (live account)", group: "Profile", conditions: [
    { id: "profile-real-data", label: "My real rounds", state: { sampleStats: false } },
    { id: "profile-sample-data", label: "Sample stats data (25 made-up rounds + a sample golfer to compare)", state: { sampleStats: true } },
  ] });
  // The player-rounds store (moved from /dev/profile): History link requests, removing rounds, Public / Private.
  const requests = pages.find(page => page.path === "/dev/profile/requests");
  if (requests) Object.assign(requests, { label: "Link requests (dev)", group: "Profile", conditions: signedInAs() });
  // Keep the sample profile first in its group, then the live account, then link requests.
  for (const page of [realProfile, requests]) if (page) pages.push(...pages.splice(pages.indexOf(page), 1));
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

/** "Signed in as <mock account>" conditions for the player-rounds preview. */
function signedInAs() {
  return DEV_ACCOUNTS.map((account) => ({ id: `view-as-${account.id}`, label: `Signed in as ${account.name}`, state: { viewAs: account.id } }));
}
