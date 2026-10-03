import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SIMULATOR_STATE, parseSimulatorConfig, parseSimulatorLocation, sameSimulatorNavigation, simulatorPageForLocation, SIMULATOR_DEVICES, type SimulatorPage } from "./simulator";
import { simulatorTripData } from "./golfTripSimulatorData";
import { GOLF_MATCH_PREVIEW, GOLF_TRIP_MOCK_DRAFT } from "@/lib/platform/golfTripPreviewFixture";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { adaptTournamentToDraft, adaptTournamentToPreviewMatch } from "@/lib/platform/tournamentToGolfTrip";

const mock = { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW };
const maroon = { preview: adaptTournamentToDraft(palmSprings2026).draft, previewMatch: adaptTournamentToPreviewMatch(palmSprings2026) ?? undefined };

test("one page mapping resolves route, tab and subview reports without replaying navigation", () => {
  const pages: SimulatorPage[] = [
    { id: "home", path: "/dev/tournament", label: "Home", fixtures: true, navigation: { tab: "Home" } },
    { id: "golf", path: "/dev/tournament", label: "Golf", fixtures: true, navigation: { tab: "Golf" } },
    { id: "games", path: "/dev/tournament", label: "Games", fixtures: true, navigation: { tab: "Golf", golfSection: "Games" } },
    { id: "settings", path: "/dev/tournament/settings", label: "Settings", fixtures: true },
  ];
  for (const page of pages) assert.equal(simulatorPageForLocation(pages, { path: page.path, navigation: page.navigation })?.id, page.id);
  assert.equal(simulatorPageForLocation(pages, { path: "/dev/tournament", navigation: { tab: "Golf", golfSection: "Overview" } })?.id, "golf");
  assert.equal(simulatorPageForLocation(pages, { path: "/dev/tournament" }, "games")?.id, "games");
  assert.equal(simulatorPageForLocation(pages, { path: "/unmapped" }), undefined);
  for (const value of [null, { path: "javascript:alert(1)" }, { path: "//other-host" }, { path: "/dev" }, { path: "/dev/tournament", navigation: { tab: "Admin" } }, { path: "/dev/tournament", navigation: { tab: "Golf", golfSection: "Invalid" } }]) assert.equal(parseSimulatorLocation(value), null);
  assert(sameSimulatorNavigation({ tab: "Venue", command: 1 }, { tab: "Venue", command: 1 }));
  assert(!sameSimulatorNavigation({ tab: "Venue", command: 1 }, { tab: "Venue", command: 2 }));
});

test("frame boundary rejects invalid dimensions of state and navigation", () => {
  const config = { source: "mock", state: DEFAULT_SIMULATOR_STATE, navigation: { tab: "Golf", golfSection: "Games", command: 1 } };
  assert.deepEqual(parseSimulatorConfig(config), config);
  for (const invalid of [null, {}, { ...config, source: "database" }, { ...config, state: { ...config.state, playerCount: -1 } }, { ...config, state: { ...config.state, playerCount: 10000 } }, { ...config, navigation: { tab: "Admin" } }, { ...config, state: { ...config.state, loading: "fetch-secrets" } }]) assert.equal(parseSimulatorConfig(invalid), null);
});

test("real and mock preserve their sources; fixture/state overrides cannot mutate tournament data", () => {
  const original = JSON.stringify({ tournament: palmSprings2026, mock, maroon });
  assert.deepEqual(simulatorTripData(mock, maroon, { source: "maroon", state: DEFAULT_SIMULATOR_STATE }), maroon);
  assert.deepEqual(simulatorTripData(mock, maroon, { source: "mock", state: DEFAULT_SIMULATOR_STATE }), mock);
  const empty = simulatorTripData(mock, maroon, { source: "empty", state: DEFAULT_SIMULATOR_STATE });
  assert.deepEqual(empty.preview, {});
  assert.equal(empty.previewMatch?.leaderboard.length, 0);
  assert.equal(empty.previewMatch?.matches.length, 0);
  const busy = simulatorTripData(mock, maroon, { source: "busy", state: DEFAULT_SIMULATOR_STATE });
  assert.equal(busy.previewMatch?.leaderboard.length, 32);
  assert.equal(busy.preview?.day4Rounds, "2");
  const overridden = simulatorTripData(mock, maroon, { source: "maroon", state: { ...DEFAULT_SIMULATOR_STATE, playerCount: 64, competition: "no", format: "stableford", roundStatus: "scheduled" } });
  assert.equal(overridden.preview?.playerCount, "64");
  assert.equal(overridden.preview?.includesTournament, "no");
  assert.equal(overridden.previewMatch?.format, "Stableford");
  assert(overridden.previewMatch?.leaderboard.every(row => row.holes.every(hole => hole === null)));
  assert.equal(JSON.stringify({ tournament: palmSprings2026, mock, maroon }), original);
});

test("requested device presets specify portrait CSS dimensions", () => {
  assert.equal(SIMULATOR_DEVICES.length, 9);
  assert.deepEqual(SIMULATOR_DEVICES.filter(device => device.id.startsWith("iphone17")).map(device => [device.width, device.height]), [[402, 874], [402, 874], [440, 956]]);
});
